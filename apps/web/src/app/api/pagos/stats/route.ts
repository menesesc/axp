import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { user, error } = await getAuthUser()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const fin7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    proveedoresConSaldo,
    documentosConfirmados,
    porEstado,
    pagadoMes,
    proximos7,
    chequesHoy,
    ordenesRecientes,
  ] = await Promise.all([
    prisma.proveedores.count({
      where: {
        clienteId: user.clienteId,
        activo: true,
        documentos: { some: { estadoRevision: 'CONFIRMADO' } },
      },
    }),
    prisma.documentos.aggregate({
      where: { clienteId: user.clienteId, estadoRevision: 'CONFIRMADO' },
      _sum: { total: true },
    }),
    prisma.pagos.groupBy({
      by: ['estado'],
      where: { clienteId: user.clienteId },
      _sum: { montoTotal: true },
      _count: { _all: true },
    }),
    prisma.pagos.aggregate({
      where: {
        clienteId: user.clienteId,
        estado: 'PAGADO',
        fecha: { gte: inicioMes },
      },
      _sum: { montoTotal: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ total: number; cantidad: bigint }>>`
      SELECT
        COALESCE(SUM(pm.monto), 0)::float as total,
        COUNT(DISTINCT p.id) as cantidad
      FROM pago_metodos pm
      JOIN pagos p ON pm."pagoId" = p.id
      WHERE p."clienteId" = ${user.clienteId}::uuid
        AND p.estado IN ('BORRADOR', 'EMITIDA')
        AND CASE
          WHEN pm.tipo IN ('CHEQUE', 'ECHEQ') AND pm.meta->>'fecha' IS NOT NULL
            THEN (pm.meta->>'fecha')::date
          ELSE p.fecha
        END BETWEEN ${ahora}::date AND ${fin7dias}::date
    `,
    // Cheques y eCheq cuyo vencimiento (fecha efectiva) es HOY.
    prisma.$queryRaw<Array<{ tipo: string; total: number; cantidad: bigint }>>`
      SELECT
        pm.tipo::text as tipo,
        COALESCE(SUM(pm.monto), 0)::float as total,
        COUNT(*) as cantidad
      FROM pago_metodos pm
      JOIN pagos p ON pm."pagoId" = p.id
      WHERE p."clienteId" = ${user.clienteId}::uuid
        AND p.estado IN ('BORRADOR', 'EMITIDA')
        AND pm.tipo IN ('CHEQUE', 'ECHEQ')
        AND CASE
          WHEN pm.meta->>'fecha' IS NOT NULL THEN (pm.meta->>'fecha')::date
          ELSE p.fecha
        END = ${ahora}::date
      GROUP BY pm.tipo
    `,
    prisma.pagos.findMany({
      where: { clienteId: user.clienteId },
      include: { proveedores: { select: { razonSocial: true } } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
  ])

  const estados = {
    BORRADOR: { count: 0, total: 0 },
    EMITIDA: { count: 0, total: 0 },
    PAGADO: { count: 0, total: 0 },
  }
  for (const e of porEstado) {
    const key = e.estado as keyof typeof estados
    if (estados[key]) {
      estados[key] = {
        count: e._count._all,
        total: Number(e._sum.montoTotal ?? 0),
      }
    }
  }

  // Desglose de vencimientos de hoy por tipo (cheque / echeq)
  const cheque = chequesHoy.find((r) => r.tipo === 'CHEQUE')
  const echeq = chequesHoy.find((r) => r.tipo === 'ECHEQ')
  const hoyCheque = { cantidad: Number(cheque?.cantidad ?? 0), total: Number(cheque?.total ?? 0) }
  const hoyEcheq = { cantidad: Number(echeq?.cantidad ?? 0), total: Number(echeq?.total ?? 0) }

  return NextResponse.json({
    proveedoresConSaldo,
    montoPendiente: documentosConfirmados._sum?.total || 0,
    estados,
    pagadoMes: {
      count: pagadoMes._count._all,
      total: Number(pagadoMes._sum.montoTotal ?? 0),
    },
    proximos7: {
      total: Number(proximos7[0]?.total ?? 0),
      cantidad: Number(proximos7[0]?.cantidad ?? 0),
    },
    chequesHoy: {
      cantidad: hoyCheque.cantidad + hoyEcheq.cantidad,
      total: hoyCheque.total + hoyEcheq.total,
      cheque: hoyCheque,
      echeq: hoyEcheq,
    },
    ordenesRecientes: ordenesRecientes.map((o) => ({
      id: o.id,
      fecha: o.fecha,
      estado: o.estado,
      total: o.montoTotal,
      proveedor: o.proveedores,
    })),
  })
}
