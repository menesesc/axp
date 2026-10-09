import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { ESTADOS_COMPRA } from '@/app/api/conciliacion/_range'

export const dynamic = 'force-dynamic'

/**
 * Todo lo del proveedor en una sola llamada: ficha, saldo, comprobantes,
 * pagos e items más comprados.
 *
 * Con SQL directo: los campos de contacto (`pedidos1Nombre`, `adminTelefono`,
 * `cbu`…) son columnas nuevas y el cliente Prisma de producción no se
 * regenera en el build.
 *
 * Sin permiso de importes no se calcula ni viaja ningún monto: el que ve solo
 * cantidades no debería poder deducir la deuda del payload.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.DOC_PROVEEDORES)
  if (error) return error
  const { id } = await params

  const meses = Math.min(Math.max(Number(request.nextUrl.searchParams.get('meses')) || 12, 1), 36)

  const [proveedor] = await prisma.$queryRaw<Array<{
    id: string; razonSocial: string; cuit: string | null; email: string | null
    telefono: string | null; pedidos1Nombre: string | null; pedidos1Telefono: string | null
    pedidos2Nombre: string | null; pedidos2Telefono: string | null
    adminNombre: string | null; adminTelefono: string | null
    diasEntrega: number | null; cbu: string | null; activo: boolean; logoKey: string | null
  }>>`
    SELECT id, "razonSocial", cuit, email, telefono,
           "pedidos1Nombre", "pedidos1Telefono", "pedidos2Nombre", "pedidos2Telefono",
           "adminNombre", "adminTelefono", "diasEntrega", cbu, activo, "logoKey"
      FROM proveedores WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!proveedor) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })

  const estados = [...ESTADOS_COMPRA]

  const [documentos, pagos, porMes, items, saldo] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: string; tipo: string; letra: string | null; numeroCompleto: string | null
      fecha: string | null; total: number | null; estado: string; pagado: number | null
    }>>`
      SELECT d.id, d.tipo::text AS tipo, d.letra::text AS letra, d."numeroCompleto",
             to_char(d."fechaEmision", 'YYYY-MM-DD') AS fecha,
             d.total::float8 AS total, d."estadoRevision"::text AS estado,
             (SELECT SUM(pd."montoAplicado")::float8 FROM pago_documentos pd WHERE pd."documentoId" = d.id) AS pagado
        FROM documentos d
       WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
       ORDER BY d."fechaEmision" DESC NULLS LAST, d."createdAt" DESC
       LIMIT 60
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
       ORDER BY p.fecha DESC, p.numero DESC
       LIMIT 40
    `,
    // Compras por mes: una serie corta para ver la evolución de un vistazo.
    prisma.$queryRaw<Array<{ mes: string; total: number; documentos: bigint }>>`
      SELECT to_char(date_trunc('month', d."fechaEmision"), 'YYYY-MM') AS mes,
             SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(d.total, 0))::float8 AS total,
             COUNT(*)::bigint AS documentos
        FROM documentos d
       WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
         AND d."estadoRevision"::text = ANY(${estados}::text[])
         AND d."fechaEmision" >= date_trunc('month', CURRENT_DATE) - make_interval(months => ${meses - 1})
       GROUP BY 1 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ descripcion: string; veces: bigint; cantidad: number | null; ultimo: number | null; total: number | null }>>`
      SELECT di.descripcion,
             COUNT(*)::bigint AS veces,
             SUM(di.cantidad)::float8 AS cantidad,
             (ARRAY_AGG(di."precioUnitario"::float8 ORDER BY d."fechaEmision" DESC NULLS LAST))[1] AS ultimo,
             SUM(di.subtotal)::float8 AS total
        FROM documento_items di
        JOIN documentos d ON d.id = di."documentoId"
       WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
         AND d."estadoRevision"::text = ANY(${estados}::text[])
       GROUP BY di.descripcion
       ORDER BY SUM(di.subtotal) DESC NULLS LAST
       LIMIT 40
    `,
    // Saldo: facturado menos aplicado en pagos, con las NC restando.
    prisma.$queryRaw<Array<{ facturado: number | null; pagado: number | null; docs: bigint; sinPagar: bigint }>>`
      SELECT SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN -1 ELSE 1 END * COALESCE(d.total, 0))::float8 AS facturado,
             COALESCE((SELECT SUM(pd."montoAplicado")::float8
                         FROM pago_documentos pd JOIN documentos d2 ON d2.id = pd."documentoId"
                        WHERE d2."proveedorId" = ${id}::uuid), 0) AS pagado,
             COUNT(*)::bigint AS docs,
             COUNT(*) FILTER (WHERE d."estadoRevision" <> 'PAGADO')::bigint AS "sinPagar"
        FROM documentos d
       WHERE d."proveedorId" = ${id}::uuid AND d."clienteId" = ${clienteId}::uuid
         AND d."estadoRevision"::text = ANY(${estados}::text[])
    `,
  ])

  // Los montos solo viajan con permiso de importes.
  const $ = (n: number | null | undefined) => (verImportes ? (n ?? null) : null)

  return NextResponse.json({
    verImportes,
    proveedor,
    saldo: {
      facturado: $(saldo[0]?.facturado),
      pagado: $(saldo[0]?.pagado),
      pendiente: $(
        saldo[0] ? (saldo[0].facturado ?? 0) - (saldo[0].pagado ?? 0) : null
      ),
      documentos: Number(saldo[0]?.docs ?? 0),
      sinPagar: Number(saldo[0]?.sinPagar ?? 0),
    },
    documentos: documentos.map((d) => ({ ...d, total: $(d.total), pagado: $(d.pagado) })),
    pagos: pagos.map((p) => ({ ...p, montoTotal: $(p.montoTotal), documentos: Number(p.documentos) })),
    porMes: porMes.map((m) => ({ mes: m.mes, total: $(m.total) ?? 0, documentos: Number(m.documentos) })),
    items: items.map((i) => ({
      descripcion: i.descripcion,
      veces: Number(i.veces),
      cantidad: i.cantidad,
      ultimoPrecio: $(i.ultimo),
      total: $(i.total),
    })),
  })
}
