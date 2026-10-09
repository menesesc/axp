import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { jsonImportes } from '@/lib/importes'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { periodoDe, vencimientosEntre, type Periodicidad } from '@/lib/finanzas/obligaciones'

interface CalendarRow {
  fecha_efectiva: Date
  pago_id: string
  numero: number
  estado: string
  tipo: string
  monto: number
  proveedor: string
}

export async function GET(request: NextRequest) {
  const { user, error, verImportes } = await requireSeccion(SECCION.FINANZAS_CALENDARIO)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  // El calendario muestra todo lo que mueve la cuenta, incluidas las
  // transferencias ya pagadas y los vencimientos estimados. El widget de
  // "próximos pagos" del inicio pide `pendientes=1`: ahí sólo lo que falta
  // pagar de verdad, sin lo ya pagado y sin estimaciones.
  const soloPendientes = searchParams.get('pendientes') === '1'

  if (!desde || !hasta) {
    return NextResponse.json(
      { error: 'Parámetros desde y hasta requeridos' },
      { status: 400 }
    )
  }

  const rows = await prisma.$queryRaw<CalendarRow[]>`
    SELECT
      CASE
        WHEN pm.tipo IN ('CHEQUE', 'ECHEQ') AND pm.meta->>'fecha' IS NOT NULL
          THEN (pm.meta->>'fecha')::date
        ELSE p.fecha
      END as fecha_efectiva,
      p.id as pago_id,
      p.numero,
      p.estado::text,
      pm.tipo::text,
      pm.monto::float,
      pr."razonSocial" as proveedor
    FROM pago_metodos pm
    JOIN pagos p ON pm."pagoId" = p.id
    JOIN proveedores pr ON p."proveedorId" = pr.id
    WHERE p."clienteId" = ${user.clienteId}::uuid
      -- Un cheque o eCheq entregado (orden PAGADO) se debita recién en su
      -- fecha, así que va al día que corresponde y no al de la orden.
      AND (
        p.estado IN ('BORRADOR', 'EMITIDA')
        OR (p.estado = 'PAGADO' AND (NOT ${soloPendientes} OR pm.tipo IN ('CHEQUE', 'ECHEQ')))
      )
      AND CASE
        WHEN pm.tipo IN ('CHEQUE', 'ECHEQ') AND pm.meta->>'fecha' IS NOT NULL
          THEN (pm.meta->>'fecha')::date
        ELSE p.fecha
      END BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY fecha_efectiva ASC
  `

  /*
   * Vencimientos que todavía no tienen orden de pago: una boleta de luz que
   * vence el 20 no aparecía en el calendario hasta que alguien armaba el pago,
   * que es justo cuando ya es tarde para enterarse.
   *
   * Se excluyen las que ya están en una orden (aunque sea borrador), porque
   * esa orden ya figura por su lado y si no se contaría dos veces.
   */
  const vencimientos = await prisma.$queryRaw<Array<{
        fecha: string; documento_id: string; numero: string | null; tipo: string; letra: string | null
        monto: number; proveedor: string | null; proveedor_id: string | null; rubro: string | null
      }>>`
        SELECT to_char(d."fechaVencimiento", 'YYYY-MM-DD') AS fecha,
               d.id AS documento_id, d."numeroCompleto" AS numero,
               d.tipo::text AS tipo, d.letra::text AS letra,
               (d.total - COALESCE((SELECT SUM(pd."montoAplicado") FROM pago_documentos pd
                                     WHERE pd."documentoId" = d.id), 0))::float AS monto,
               pr."razonSocial" AS proveedor, pr.id AS proveedor_id, pr.rubro AS rubro
          FROM documentos d
          LEFT JOIN proveedores pr ON pr.id = d."proveedorId"
         WHERE d."clienteId" = ${user.clienteId}::uuid
           AND d."fechaVencimiento" BETWEEN ${desde}::date AND ${hasta}::date
           AND d.tipo::text <> 'NOTA_CREDITO'
           AND d."estadoRevision"::text NOT IN ('PAGADO', 'ERROR', 'DUPLICADO')
           AND d.total > 0
           AND NOT EXISTS (
             SELECT 1 FROM pago_documentos pd
               JOIN pagos pg ON pg.id = pd."pagoId"
              WHERE pd."documentoId" = d.id AND pg.estado::text <> 'ANULADO'
           )
         ORDER BY d."fechaVencimiento"
  `

  // Obligaciones periódicas: se proyectan sobre el rango y se descartan las
  // que ya tienen el comprobante real de ese mes, que es el que manda.
  const obligaciones = soloPendientes
    ? []
    : await prisma.$queryRaw<Array<{
        id: string; nombre: string; rubro: string; periodicidad: string
        dia: number; ancla: number | null; monto: number | null
        proveedor_id: string | null; proveedor: string | null
      }>>`
        SELECT o.id, o.nombre, o.rubro, o.periodicidad,
               o."diaVencimiento" AS dia, o."mesAncla" AS ancla,
               o."montoEstimado"::float AS monto,
               o."proveedorId" AS proveedor_id, p."razonSocial" AS proveedor
          FROM obligaciones o
          LEFT JOIN proveedores p ON p.id = o."proveedorId"
         WHERE o."clienteId" = ${user.clienteId}::uuid AND o.activa = true
      `

  // Qué períodos ya tienen comprobante real, por proveedor: si la boleta de
  // Camuzzi de septiembre ya está cargada, el estimado de septiembre sobra.
  const periodosConPapel = new Set<string>()
  if (obligaciones.length > 0) {
    const conProveedor = obligaciones.map((o) => o.proveedor_id).filter((x): x is string => !!x)
    if (conProveedor.length > 0) {
      const papeles = await prisma.$queryRaw<Array<{ proveedor_id: string; periodo: string }>>`
        SELECT d."proveedorId" AS proveedor_id,
               to_char(COALESCE(d."fechaVencimiento", d."fechaEmision"), 'YYYY-MM') AS periodo
          FROM documentos d
         WHERE d."clienteId" = ${user.clienteId}::uuid
           AND d."proveedorId" = ANY(${conProveedor}::uuid[])
           AND d."estadoRevision"::text NOT IN ('ERROR', 'DUPLICADO')
           AND COALESCE(d."fechaVencimiento", d."fechaEmision")
               BETWEEN (${desde}::date - interval '1 month') AND (${hasta}::date + interval '1 month')
      `
      for (const p2 of papeles) periodosConPapel.add(`${p2.proveedor_id}#${p2.periodo}`)
    }
  }

  // Agrupar por fecha
  interface ItemCalendario {
    clase: 'pago' | 'vencimiento' | 'estimado'
    pagoId: string | null
    documentoId?: string | null
    obligacionId?: string | null
    proveedorId?: string | null
    numero: number | null
    etiqueta?: string
    proveedor: string
    estado: string
    monto: number
    tipo: string
    rubro?: string | null
  }
  const eventosPorFecha = new Map<string, { fecha: string; total: number; items: ItemCalendario[] }>()

  const agregar = (fechaKey: string, item: ItemCalendario) => {
    if (!eventosPorFecha.has(fechaKey)) {
      eventosPorFecha.set(fechaKey, { fecha: fechaKey, total: 0, items: [] })
    }
    const evento = eventosPorFecha.get(fechaKey)!
    evento.total += item.monto
    evento.items.push(item)
  }

  for (const row of rows) {
    const fechaKey = new Date(row.fecha_efectiva).toISOString().split('T')[0]!
    agregar(fechaKey, {
      clase: 'pago',
      pagoId: row.pago_id,
      numero: row.numero,
      proveedor: row.proveedor,
      estado: row.estado,
      monto: row.monto,
      tipo: row.tipo,
    })
  }

  for (const v of vencimientos) {
    if (!v.fecha || !(v.monto > 0)) continue
    agregar(v.fecha, {
      clase: 'vencimiento',
      pagoId: null,
      documentoId: v.documento_id,
      proveedorId: v.proveedor_id,
      numero: null,
      etiqueta: [v.tipo === 'FACTURA' ? 'Factura' : v.tipo, v.letra, v.numero].filter(Boolean).join(' '),
      proveedor: v.proveedor ?? 'Sin proveedor',
      estado: 'SIN_ORDEN',
      monto: v.monto,
      tipo: 'VENCIMIENTO',
      rubro: v.rubro,
    })
  }

  for (const o of obligaciones) {
    const fechas = vencimientosEntre(
      { periodicidad: o.periodicidad as Periodicidad, diaVencimiento: o.dia, mesAncla: o.ancla },
      desde,
      hasta
    )
    for (const f of fechas) {
      if (o.proveedor_id && periodosConPapel.has(`${o.proveedor_id}#${periodoDe(f)}`)) continue
      agregar(f, {
        clase: 'estimado',
        pagoId: null,
        obligacionId: o.id,
        proveedorId: o.proveedor_id,
        numero: null,
        etiqueta: o.nombre,
        proveedor: o.proveedor ?? o.nombre,
        estado: 'ESTIMADO',
        monto: o.monto ?? 0,
        tipo: 'ESTIMADO',
        rubro: o.rubro,
      })
    }
  }

  // Cheques y eCheq entregados que todavía no se debitaron, miren el mes que
  // miren: es plata comprometida que hay que tener, y si vence el mes que
  // viene no aparecía en ninguna parte sin cambiar de mes a mano.
  const porDebitar = await prisma.$queryRaw<Array<{
    fecha: string; pago_id: string; numero: number; tipo: string; monto: number; proveedor: string
  }>>`
    SELECT to_char((pm.meta->>'fecha')::date, 'YYYY-MM-DD') AS fecha,
           p.id AS pago_id, p.numero, pm.tipo::text AS tipo,
           pm.monto::float AS monto, pr."razonSocial" AS proveedor
      FROM pago_metodos pm
      JOIN pagos p ON pm."pagoId" = p.id
      JOIN proveedores pr ON p."proveedorId" = pr.id
     WHERE p."clienteId" = ${user.clienteId}::uuid
       AND pm.tipo IN ('CHEQUE', 'ECHEQ')
       AND p.estado IN ('EMITIDA', 'PAGADO')
       AND pm.meta->>'fecha' IS NOT NULL
       AND (pm.meta->>'fecha')::date > CURRENT_DATE
     ORDER BY (pm.meta->>'fecha')::date
     LIMIT 40
  `

  return jsonImportes({
    // Ordenados por fecha: al mezclar pagos, vencimientos y estimados el
    // Map quedó en el orden en que se fueron agregando, no cronológico.
    eventos: Array.from(eventosPorFecha.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porDebitar: porDebitar.map((c) => ({
      fecha: c.fecha,
      pagoId: c.pago_id,
      numero: c.numero,
      tipo: c.tipo,
      monto: c.monto,
      proveedor: c.proveedor,
    })),
  }, !!verImportes)
}
