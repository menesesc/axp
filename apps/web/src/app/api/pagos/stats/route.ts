import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { user, error } = await getAuthUser()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  // Proveedores con documentos confirmados
  const proveedoresConSaldo = await prisma.proveedores.count({
    where: {
      clienteId: user.clienteId,
      activo: true,
      documentos: {
        some: {
          estadoRevision: 'CONFIRMADO',
        },
      },
    },
  })

  // Monto total de documentos confirmados
  const documentosConfirmados = await prisma.documentos.aggregate({
    where: {
      clienteId: user.clienteId,
      estadoRevision: 'CONFIRMADO',
    },
    _sum: {
      total: true,
    },
  })

  // Últimas 3 órdenes de pago
  const ordenesRecientes = await prisma.pagos.findMany({
    where: {
      clienteId: user.clienteId,
    },
    include: {
      proveedores: {
        select: {
          razonSocial: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })

  return NextResponse.json({
    proveedoresConSaldo,
    montoPendiente: documentosConfirmados._sum?.total || 0,
    ordenesRecientes: ordenesRecientes.map((o) => ({
      id: o.id,
      fecha: o.fecha,
      estado: o.estado,
      total: o.montoTotal,
      proveedor: o.proveedores,
    })),
  })
}
