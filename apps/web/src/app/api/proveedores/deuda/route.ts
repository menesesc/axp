import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    // Top proveedores con deuda: saldo = facturas - NC - pagos aplicados
    // Incluye factura impaga más vieja (CONFIRMADO) y fecha último pago
    const deuda = await prisma.$queryRaw<Array<{
      proveedor_id: string
      razon_social: string
      saldo: number
      cantidad_docs: number
      factura_vieja_mas: Date | null
      ultimo_pago: Date | null
    }>>`
      SELECT
        p.id as proveedor_id,
        p."razonSocial" as razon_social,
        (
          COALESCE(SUM(CASE WHEN d.tipo = 'FACTURA' THEN d.total ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN ABS(d.total) ELSE 0 END), 0)
          - COALESCE(pagos.total_pagado, 0)
        )::float as saldo,
        COALESCE(SUM(CASE WHEN d."estadoRevision" = 'CONFIRMADO' THEN 1 ELSE 0 END), 0)::int as cantidad_docs,
        MIN(CASE WHEN d."estadoRevision" = 'CONFIRMADO' AND d.tipo = 'FACTURA' THEN d."fechaEmision" END) as factura_vieja_mas,
        pagos.ultimo_pago
      FROM proveedores p
      LEFT JOIN documentos d ON d."proveedorId" = p.id
        AND d."clienteId" = ${clienteId}::uuid
        AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(pd."montoAplicado"), 0) as total_pagado,
          MAX(pg.fecha) as ultimo_pago
        FROM pagos pg
        JOIN pago_documentos pd ON pd."pagoId" = pg.id
        WHERE pg."proveedorId" = p.id
          AND pg."clienteId" = ${clienteId}::uuid
          AND pg.estado IN ('EMITIDA', 'PAGADO')
      ) pagos ON true
      WHERE p."clienteId" = ${clienteId}::uuid
        AND p.activo = true
      GROUP BY p.id, p."razonSocial", pagos.total_pagado, pagos.ultimo_pago
      HAVING (
        COALESCE(SUM(CASE WHEN d.tipo = 'FACTURA' THEN d.total ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN ABS(d.total) ELSE 0 END), 0)
        - COALESCE(pagos.total_pagado, 0)
      ) > 0
      ORDER BY saldo DESC
      LIMIT 10
    `

    const now = new Date()
    const proveedores = deuda.map(row => {
      const facturaVieja = row.factura_vieja_mas
        ? row.factura_vieja_mas.toISOString().slice(0, 10)
        : null
      const ultimoPago = row.ultimo_pago
        ? row.ultimo_pago.toISOString().slice(0, 10)
        : null

      let diasVencido = 0
      if (row.factura_vieja_mas) {
        diasVencido = Math.floor(
          (now.getTime() - row.factura_vieja_mas.getTime()) / (1000 * 60 * 60 * 24)
        )
      }

      return {
        proveedorId: row.proveedor_id,
        razonSocial: row.razon_social,
        saldo: row.saldo,
        cantidadDocs: Number(row.cantidad_docs),
        facturaViejaMas: facturaVieja,
        diasVencido,
        ultimoPago,
      }
    })

    return NextResponse.json({ proveedores })
  } catch (error) {
    console.error('Error fetching deuda proveedores:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
