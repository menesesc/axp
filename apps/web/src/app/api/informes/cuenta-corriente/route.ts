import { prisma } from '@/lib/prisma'
import { NextResponse, NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const proveedorId = searchParams.get('proveedorId')

    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Parámetros desde y hasta son requeridos' }, { status: 400 })
    }

    const fechaDesde = new Date(`${desde}T00:00:00-03:00`)
    const fechaHasta = new Date(`${hasta}T23:59:59-03:00`)

    // Si hay proveedor seleccionado, mostrar detalle
    if (proveedorId) {
      const [movimientos, saldoAnterior, proveedor] = await Promise.all([
        // Movimientos: facturas (debe) + notas de crédito (haber) + pagos (haber)
        prisma.$queryRaw<Array<{
          fecha: Date
          tipo: string
          referencia: string
          debe: number
          haber: number
        }>>`
          SELECT fecha, tipo, referencia, debe, haber FROM (
            -- Facturas (debe)
            SELECT
              d."fechaEmision" as fecha,
              'FACTURA' as tipo,
              COALESCE(d.letra || '-', '') || COALESCE(d."numeroCompleto", 'S/N') as referencia,
              d.total::float as debe,
              0::float as haber
            FROM documentos d
            WHERE d."clienteId" = ${clienteId}::uuid
              AND d."proveedorId" = ${proveedorId}::uuid
              AND d.tipo = 'FACTURA'
              AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
              AND d."fechaEmision" >= ${fechaDesde}
              AND d."fechaEmision" <= ${fechaHasta}

            UNION ALL

            -- Notas de crédito (haber)
            SELECT
              d."fechaEmision" as fecha,
              'NOTA_CREDITO' as tipo,
              COALESCE(d.letra || '-', '') || COALESCE(d."numeroCompleto", 'S/N') as referencia,
              0::float as debe,
              d.total::float as haber
            FROM documentos d
            WHERE d."clienteId" = ${clienteId}::uuid
              AND d."proveedorId" = ${proveedorId}::uuid
              AND d.tipo = 'NOTA_CREDITO'
              AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
              AND d."fechaEmision" >= ${fechaDesde}
              AND d."fechaEmision" <= ${fechaHasta}

            UNION ALL

            -- Pagos (haber)
            SELECT
              p.fecha,
              'PAGO' as tipo,
              'OP #' || LPAD(p.numero::text, 6, '0') as referencia,
              0::float as debe,
              pd."montoAplicado"::float as haber
            FROM pagos p
            JOIN pago_documentos pd ON pd."pagoId" = p.id
            JOIN documentos d ON pd."documentoId" = d.id
            WHERE p."clienteId" = ${clienteId}::uuid
              AND p."proveedorId" = ${proveedorId}::uuid
              AND p.estado IN ('EMITIDA', 'PAGADO')
              AND p.fecha >= ${fechaDesde}
              AND p.fecha <= ${fechaHasta}
          ) movimientos
          ORDER BY fecha ASC, tipo ASC
        `,

        // Saldo anterior al período
        prisma.$queryRaw<[{ saldo: number }]>`
          SELECT COALESCE(
            (SELECT COALESCE(SUM(CASE WHEN tipo = 'FACTURA' THEN total ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN tipo = 'NOTA_CREDITO' THEN total ELSE 0 END), 0)
            FROM documentos
            WHERE "clienteId" = ${clienteId}::uuid
              AND "proveedorId" = ${proveedorId}::uuid
              AND "estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
              AND "fechaEmision" < ${fechaDesde})
          -
            (SELECT COALESCE(SUM(pd."montoAplicado"), 0)
            FROM pagos p
            JOIN pago_documentos pd ON pd."pagoId" = p.id
            WHERE p."clienteId" = ${clienteId}::uuid
              AND p."proveedorId" = ${proveedorId}::uuid
              AND p.estado IN ('EMITIDA', 'PAGADO')
              AND p.fecha < ${fechaDesde})
          , 0)::float as saldo
        `,

        // Datos del proveedor
        prisma.proveedores.findUnique({
          where: { id: proveedorId },
          select: { razonSocial: true, cuit: true },
        }),
      ])

      const saldoInicial = saldoAnterior[0]?.saldo || 0

      return NextResponse.json({
        proveedor: proveedor ? { razonSocial: proveedor.razonSocial, cuit: proveedor.cuit } : null,
        saldoInicial,
        movimientos,
      })
    }

    // Sin proveedor: resumen de saldos de todos los proveedores
    const saldos = await prisma.$queryRaw<Array<{
      proveedor_id: string
      razon_social: string
      total_facturado: number
      total_nc: number
      total_pagado: number
      saldo: number
      ultima_factura: Date | null
    }>>`
      SELECT
        p.id as proveedor_id,
        p."razonSocial" as razon_social,
        COALESCE(SUM(CASE WHEN d.tipo = 'FACTURA' THEN d.total ELSE 0 END), 0)::float as total_facturado,
        COALESCE(SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN d.total ELSE 0 END), 0)::float as total_nc,
        COALESCE(pagos.total_pagado, 0)::float as total_pagado,
        (COALESCE(SUM(CASE WHEN d.tipo = 'FACTURA' THEN d.total ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN d.total ELSE 0 END), 0)
          - COALESCE(pagos.total_pagado, 0))::float as saldo,
        MAX(CASE WHEN d.tipo = 'FACTURA' THEN d."fechaEmision" END) as ultima_factura
      FROM proveedores p
      LEFT JOIN documentos d ON d."proveedorId" = p.id
        AND d."clienteId" = ${clienteId}::uuid
        AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd."montoAplicado"), 0) as total_pagado
        FROM pagos pg
        JOIN pago_documentos pd ON pd."pagoId" = pg.id
        WHERE pg."proveedorId" = p.id
          AND pg."clienteId" = ${clienteId}::uuid
          AND pg.estado IN ('EMITIDA', 'PAGADO')
      ) pagos ON true
      WHERE p."clienteId" = ${clienteId}::uuid
        AND p.activo = true
      GROUP BY p.id, p."razonSocial", pagos.total_pagado
      HAVING (COALESCE(SUM(CASE WHEN d.tipo = 'FACTURA' THEN d.total ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN d.tipo = 'NOTA_CREDITO' THEN d.total ELSE 0 END), 0)
        - COALESCE(pagos.total_pagado, 0)) <> 0
        OR SUM(d.total) > 0
      ORDER BY saldo DESC
    `

    return NextResponse.json({ saldos })
  } catch (error) {
    console.error('Error fetching cuenta corriente:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
