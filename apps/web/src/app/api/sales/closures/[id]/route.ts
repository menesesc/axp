import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const closure = await prisma.sales_closures.findFirst({
    where: { id: params.id, clienteId: clienteId! },
    include: {
      payments: { orderBy: { total: 'desc' } },
      waiters: { orderBy: { importe: 'desc' } },
      movements: { orderBy: [{ tipo: 'asc' }, { conceptoCodigo: 'asc' }] },
      items: {
        orderBy: [{ rubroCodigo: 'asc' }, { codigo: 'asc' }],
        select: {
          id: true,
          rubroCodigo: true,
          rubroNombre: true,
          codigo: true,
          nombre: true,
          unidades: true,
          importe: true,
          productMasterId: true,
        },
      },
    },
  })

  if (!closure) {
    return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ closure })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { clienteId, error, user } = await requireClienteId()
  if (error) return error
  if (user?.tipo_acceso !== 'ADMIN') {
    return NextResponse.json({ error: 'Requiere rol admin' }, { status: 403 })
  }

  const closure = await prisma.sales_closures.findFirst({
    where: { id: params.id, clienteId: clienteId! },
    select: { id: true },
  })
  if (!closure) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.sales_closures.delete({ where: { id: closure.id } })
  return NextResponse.json({ deleted: true })
}
