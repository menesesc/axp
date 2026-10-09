import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { ESTADOS_COMPRA } from '@/app/api/conciliacion/_range'
import { hoyAR, inicioDeMesAR, sumarDias } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

/**
 * Todo lo del proveedor en una sola llamada: ficha, saldo, comprobantes,
 * pagos, items, compras por mes e índice de precios.
 *
 * Con SQL directo: los campos de contacto (`pedidos1Nombre`, `adminTelefono`,
 * `cbu`, `logoKey`…) son columnas nuevas y el cliente Prisma de producción no
 * se regenera en el build.
 *
 * El rango (`desde`/`hasta`) filtra compras, pagos, items y precios. El saldo
 * pendiente es la excepción: es cuánto se le debe hoy, no del período, así que
 * se calcula sobre todo el historial.
 *
 * Sin permiso de importes no viaja ningún monto: el que ve solo cantidades no
 * debería poder deducir la deuda del payload.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.DOC_PROVEEDORES)
  if (error) return error
  const { id } = await params

  const sp = request.nextUrl.searchParams
  const fecha = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  // Por defecto los últimos 12 meses, que es lo que se mira siempre. Con
  // `todo=1` arranca en la primera compra: abrir el rango a una fecha fija
  // llenaría el gráfico de meses vacíos anteriores a la primera factura.
  const hasta = fecha(sp.get('hasta')) ?? hoyAR()
  const porDefecto = mesesAtras(hasta, 11)

  const [proveedor] = await prisma.$queryRaw<Array<{
    id: string; razonSocial: string; cuit: string | null; email: string | null
    telefono: string | null; pedidos1Nombre: string | null; pedidos1Telefono: string | null
    pedidos2Nombre: string | null; pedidos2Telefono: string | null
    adminNombre: string | null; adminTelefono: string | null
    diasEntrega: number | null; cbu: string | null; activo: boolean; logoKey: string | null
    alias: string[]; letra: string | null; primera_compra: string | null
  }>>`
    SELECT id, "razonSocial", cuit, email, telefono,
           "pedidos1Nombre", "pedidos1Telefono", "pedidos2Nombre", "pedidos2Telefono",
           "adminNombre", "adminTelefono", "diasEntrega", cbu, activo, "logoKey",
           alias, letra::text AS letra,
           (SELECT to_char(MIN(d."fechaEmision"), 'YYYY-MM-DD') FROM documentos d
             WHERE d."proveedorId" = proveedores.id AND d."clienteId" = proveedores."clienteId") AS primera_compra
      FROM proveedores WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!proveedor) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })

  const desde =
    sp.get('todo') === '1'
      ? (proveedor.primera_compra ?? porDefecto)
      : (fecha(sp.get('desde')) ?? porDefecto)

  const estados = [...ESTADOS_COMPRA]

  const [documentos, pagos, porMes, items, saldo, indice, deudaTotal] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string; tipo: string; letra: string | null; numeroCompleto: string | null
      fecha: string | null; total: number | null; estado: string; pagado: number | null
      items: bigint
    }>>`
      SELECT d.id, d.tipo::text AS tipo, d.letra::text AS letra, d."numeroCompleto",
             to_char(d."fechaEmision", 'YYYY-MM-DD') AS fecha,
             d.total::float8 AS total, d."estadoRevision"::text AS estado,
             (SELECT SUM(pd."montoAplicado")::float8 FROM pago_documentos pd WHERE pd."documentoId" = d.id) AS pagado,
             (SELECT COUNT(*)::bigint FROM documento_items di WHERE di."documentoId" = d.id) AS items
        FROM documentos d
       WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
         AND d."fechaEmision" BETWEEN ${desde}::date AND ${hasta}::date
       ORDER BY d."fechaEmision" DESC NULLS LAST, d."createdAt" DESC
       LIMIT 300
    `,
    prisma.$queryRaw<Array<{
      id: string; numero: number; fecha: string; estado: string; montoTotal: number
      documentos: bigint; metodos: string | null
    }>>`
      SELECT p.id, p.numero, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, p.estado::text AS estado,
             p."montoTotal"::float8 AS "montoTotal",
             (SELECT COUNT(*)::bigint FROM pago_documentos pd WHERE pd."pagoId" = p.id) AS documentos,
             (SELECT string_agg(DISTINCT pm.tipo::text, ', ') FROM pago_metodos pm WHERE pm."pagoId" = p.id) AS metodos
        FROM pagos p
       WHERE p."proveedorId" = ${id}::uuid AND p."clienteId" = ${clienteId}::uuid
         AND p.fecha BETWEEN ${desde}::date AND ${hasta}::date
       ORDER BY p.fecha DESC, p.numero DESC
       LIMIT 200
    `,
    // Compras y pagos mes a mes, en la misma serie para poder compararlos.
    // generate_series rellena los meses sin movimiento: si no, el gráfico
    // miente juntando dos meses separados como si fueran consecutivos.
    prisma.$queryRaw<Array<{ mes: string; comprado: number; documentos: bigint; pagado: number }>>`
      WITH meses AS (
        SELECT to_char(generate_series(date_trunc('month', ${desde}::date),
                                       date_trunc('month', ${hasta}::date),
                                       interval '1 month'), 'YYYY-MM') AS mes
      ),
      compras AS (
        SELECT to_char(date_trunc('month', d."fechaEmision"), 'YYYY-MM') AS mes,
               SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(d.total, 0))::float8 AS comprado,
               COUNT(*)::bigint AS documentos
          FROM documentos d
         WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
           AND d."estadoRevision"::text = ANY(${estados}::text[])
           AND d."fechaEmision" BETWEEN ${desde}::date AND ${hasta}::date
         GROUP BY 1
      ),
      abonos AS (
        SELECT to_char(date_trunc('month', p.fecha), 'YYYY-MM') AS mes,
               SUM(p."montoTotal")::float8 AS pagado
          FROM pagos p
         WHERE p."proveedorId" = ${id}::uuid AND p."clienteId" = ${clienteId}::uuid
           AND p.estado::text IN ('EMITIDA', 'PAGADO')
           AND p.fecha BETWEEN ${desde}::date AND ${hasta}::date
         GROUP BY 1
      )
      SELECT m.mes,
             COALESCE(c.comprado, 0)::float8 AS comprado,
             COALESCE(c.documentos, 0)::bigint AS documentos,
             COALESCE(a.pagado, 0)::float8 AS pagado
        FROM meses m
        LEFT JOIN compras c ON c.mes = m.mes
        LEFT JOIN abonos a ON a.mes = m.mes
       ORDER BY m.mes
    `,
    /*
     * Items con su recorrido de precio.
     *
     * Antes de medir nada hay que sacar la basura: el extractor a veces lee mal
     * un precio del PDF y mete un 446,72 donde iba 15.256,35. Con dos o tres
     * líneas así, el "último precio" y la variación quedan al revés. Se toma la
     * mediana de cada item y se descartan las líneas que caen fuera del rango
     * 0,4x–2,5x de esa mediana. Las descartadas se cuentan aparte (`atipicos`)
     * para que se vea que hay algo para revisar y no desaparezcan en silencio.
     */
    prisma.$queryRaw<Array<{
      descripcion: string; veces: bigint; cantidad: number | null; unidad: string | null
      primero: number | null; ultimo: number | null; minimo: number | null; maximo: number | null
      total: number | null; ultima_fecha: string | null; atipicos: bigint
    }>>`
      WITH lineas AS (
        SELECT di.descripcion,
               NULLIF(di."precioUnitario", 0)::numeric AS precio,
               COALESCE(di.subtotal, 0)::numeric AS subtotal,
               di.cantidad::numeric AS cantidad,
               di.unidad,
               d."fechaEmision" AS fecha
          FROM documento_items di
          JOIN documentos d ON d.id = di."documentoId"
         WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
           AND d."estadoRevision"::text = ANY(${estados}::text[])
           AND d."fechaEmision" BETWEEN ${desde}::date AND ${hasta}::date
      ),
      med AS (
        SELECT descripcion, percentile_cont(0.5) WITHIN GROUP (ORDER BY precio) AS mediana
          FROM lineas WHERE precio IS NOT NULL GROUP BY descripcion
      ),
      marcadas AS (
        SELECT l.*, (l.precio IS NOT NULL AND l.precio BETWEEN m.mediana * 0.4 AND m.mediana * 2.5) AS ok
          FROM lineas l LEFT JOIN med m ON m.descripcion = l.descripcion
      )
      SELECT descripcion,
             COUNT(*)::bigint AS veces,
             SUM(cantidad)::float8 AS cantidad,
             (ARRAY_AGG(unidad ORDER BY fecha DESC NULLS LAST))[1] AS unidad,
             ((ARRAY_AGG(precio ORDER BY fecha ASC NULLS LAST) FILTER (WHERE ok))[1])::float8 AS primero,
             ((ARRAY_AGG(precio ORDER BY fecha DESC NULLS LAST) FILTER (WHERE ok))[1])::float8 AS ultimo,
             (MIN(precio) FILTER (WHERE ok))::float8 AS minimo,
             (MAX(precio) FILTER (WHERE ok))::float8 AS maximo,
             SUM(subtotal)::float8 AS total,
             to_char(MAX(fecha), 'YYYY-MM-DD') AS ultima_fecha,
             COUNT(*) FILTER (WHERE precio IS NOT NULL AND NOT ok)::bigint AS atipicos
        FROM marcadas
       GROUP BY descripcion
       ORDER BY SUM(subtotal) DESC NULLS LAST
       LIMIT 200
    `,
    prisma.$queryRaw<Array<{ facturado: number | null; docs: bigint; pagado: number | null }>>`
      SELECT SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(d.total, 0))::float8 AS facturado,
             COUNT(*)::bigint AS docs,
             COALESCE((SELECT SUM(p."montoTotal")::float8
                         FROM pagos p
                        WHERE p."proveedorId" = ${id}::uuid AND p."clienteId" = ${clienteId}::uuid
                          AND p.estado::text IN ('EMITIDA', 'PAGADO')
                          AND p.fecha BETWEEN ${desde}::date AND ${hasta}::date), 0) AS pagado
        FROM documentos d
       WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
         AND d."estadoRevision"::text = ANY(${estados}::text[])
         AND d."fechaEmision" BETWEEN ${desde}::date AND ${hasta}::date
    `,
    /*
     * Índice de precios del proveedor: cuánto aumentó lo que le compramos,
     * con base 100 en el primer mes del rango.
     *
     * No se pueden promediar precios de items distintos (un kilo de queso y un
     * rollo de papel no se suman), y tampoco sirve comparar cada mes contra el
     * primero: si un mes se compraron tres items y al siguiente treinta, el
     * promedio se mueve por el cambio de canasta y no por los precios.
     *
     * Entonces va encadenado: de un mes al anterior se comparan sólo los items
     * que están en los dos, con el promedio geométrico de sus variaciones
     * ponderado por cuánto pesa cada item, y después se encadenan los eslabones.
     * Así el índice mide precios y no composición. Si un item se saltea meses,
     * su eslabón va contra la última vez que se compró.
     *
     * Mismo filtro de atípicos que en los items.
     */
    prisma.$queryRaw<Array<{ mes: string; indice: number | null; items: bigint }>>`
      WITH lineas AS (
        SELECT di.descripcion,
               di."precioUnitario"::numeric AS precio,
               COALESCE(di.subtotal, 0)::numeric AS subtotal,
               to_char(date_trunc('month', d."fechaEmision"), 'YYYY-MM') AS mes
          FROM documento_items di
          JOIN documentos d ON d.id = di."documentoId"
         WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
           AND d."estadoRevision"::text = ANY(${estados}::text[])
           AND d.tipo <> 'NOTA_CREDITO'
           AND di."precioUnitario" > 0
           AND d."fechaEmision" BETWEEN ${desde}::date AND ${hasta}::date
      ),
      med AS (
        SELECT descripcion, percentile_cont(0.5) WITHIN GROUP (ORDER BY precio) AS mediana
          FROM lineas GROUP BY descripcion
      ),
      limpias AS (
        SELECT l.* FROM lineas l JOIN med m ON m.descripcion = l.descripcion
         WHERE l.precio BETWEEN m.mediana * 0.4 AND m.mediana * 2.5
      ),
      por_item_mes AS (
        SELECT mes, descripcion, AVG(precio) AS precio, SUM(subtotal) AS peso
          FROM limpias GROUP BY mes, descripcion
      ),
      eslabones AS (
        SELECT a.mes,
               exp(SUM(ln(a.precio / b.precio) * (a.peso + b.peso)) / NULLIF(SUM(a.peso + b.peso), 0)) AS factor,
               COUNT(*)::bigint AS items
          FROM por_item_mes a
          JOIN LATERAL (
            SELECT p.precio, p.peso FROM por_item_mes p
             WHERE p.descripcion = a.descripcion AND p.mes < a.mes
             ORDER BY p.mes DESC LIMIT 1
          ) b ON true
         WHERE a.precio > 0 AND b.precio > 0
         GROUP BY a.mes
      ),
      serie AS (
        SELECT m.mes,
               COALESCE(e.factor, 1) AS factor,
               COALESCE(e.items, 0)::bigint AS items
          FROM (SELECT DISTINCT mes FROM por_item_mes) m
          LEFT JOIN eslabones e ON e.mes = m.mes
      )
      SELECT mes,
             (100 * exp(SUM(ln(factor)) OVER (ORDER BY mes)))::float8 AS indice,
             items
        FROM serie
       ORDER BY mes
    `,
    // Deuda viva: no depende del rango, es lo que se le debe hoy.
    prisma.$queryRaw<Array<{ pendiente: number | null; sin_pagar: bigint }>>`
      SELECT (
               SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(d.total, 0))
               - COALESCE((SELECT SUM(pd."montoAplicado")
                             FROM pago_documentos pd
                             JOIN documentos d2 ON d2.id = pd."documentoId"
                            WHERE d2."proveedorId" = ${id}::uuid AND d2."clienteId" = ${clienteId}::uuid), 0)
             )::float8 AS pendiente,
             COUNT(*) FILTER (WHERE d."estadoRevision"::text <> 'PAGADO')::bigint AS sin_pagar
        FROM documentos d
       WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
         AND d."estadoRevision"::text = ANY(${estados}::text[])
    `,
  ])

  // Los montos solo viajan con permiso de importes.
  const $ = (n: number | null | undefined) => (verImportes ? (n ?? null) : null)
  const comprado = saldo[0]?.facturado ?? 0
  const docs = Number(saldo[0]?.docs ?? 0)

  return NextResponse.json({
    verImportes,
    rango: { desde, hasta, primeraCompra: proveedor.primera_compra },
    proveedor,
    saldo: {
      comprado: $(comprado),
      pagado: $(saldo[0]?.pagado),
      documentos: docs,
      ticket: $(docs > 0 ? comprado / docs : null),
      pendiente: $(deudaTotal[0]?.pendiente),
      sinPagar: Number(deudaTotal[0]?.sin_pagar ?? 0),
    },
    porMes: porMes.map((m) => ({
      mes: m.mes,
      comprado: $(m.comprado) ?? 0,
      pagado: $(m.pagado) ?? 0,
      documentos: Number(m.documentos),
    })),
    documentos: documentos.map((d) => ({
      ...d,
      total: $(d.total),
      pagado: $(d.pagado),
      // Lo que falta pagar de este comprobante. Las notas de crédito no se
      // deben: restan, así que quedan en cero.
      pendiente:
        d.estado === 'PAGADO' || d.tipo === 'NOTA_CREDITO'
          ? 0
          : $(Math.max(0, Math.round(((d.total ?? 0) - (d.pagado ?? 0)) * 100) / 100)),
      items: Number(d.items),
    })),
    pagos: pagos.map((p) => ({ ...p, montoTotal: $(p.montoTotal), documentos: Number(p.documentos) })),
    items: items.map((i) => ({
      descripcion: i.descripcion,
      veces: Number(i.veces),
      cantidad: i.cantidad,
      unidad: i.unidad,
      primerPrecio: $(i.primero),
      ultimoPrecio: $(i.ultimo),
      minimo: $(i.minimo),
      maximo: $(i.maximo),
      // La variación es un porcentaje, no un importe: se muestra igual sin
      // permiso de importes, que es justo lo útil para el que compra.
      variacionPct:
        i.primero && i.ultimo && i.primero > 0
          ? Math.round(((i.ultimo - i.primero) / i.primero) * 1000) / 10
          : null,
      total: $(i.total),
      ultimaFecha: i.ultima_fecha,
      atipicos: Number(i.atipicos),
    })),
    indice: indice.map((r) => ({
      mes: r.mes,
      indice: r.indice == null ? null : Math.round(r.indice * 10) / 10,
      items: Number(r.items),
    })),
  })
}

/** Resta `n` meses a una fecha YYYY-MM-DD quedándose en el día 1. */
function mesesAtras(iso: string, n: number): string {
  let out = inicioDeMesAR(iso)
  for (let i = 0; i < n; i++) out = inicioDeMesAR(sumarDias(out, -1))
  return out
}
