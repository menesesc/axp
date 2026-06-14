import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Borra una receta (y sus ingredientes en cascade). Solo admin. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  // Verificar que la receta pertenece a un producto del cliente.
  const receta = await prisma.sales_recipes.findFirst({
    where: { id: params.id, productMaster: { clienteId } },
    select: { id: true },
  })
  if (!receta) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

  await prisma.sales_recipes.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
