import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { guardarItemsPlantilla, validarPlantilla } from '@/lib/stock/plantillas'

export const dynamic = 'force-dynamic'

/** Reemplaza una plantilla. Body: { nombre, destinoId?, items: [{ insumoId, cantidad }] } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS, 'edit')
  if (error) return error
  const existe = await prisma.pedido_plantillas.findFirst({ where: { id: params.id, clienteId: clienteId! } })
  if (!existe) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  const v = await validarPlantilla(clienteId!, await request.json().catch(() => null))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    await prisma.pedido_plantillas.update({ where: { id: existe.id }, data: { nombre: v.nombre, destinoId: v.destinoId } })
    await guardarItemsPlantilla(existe.id, v.items)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Ya existe una plantilla con ese nombre' }, { status: 409 })
    throw e
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS, 'edit')
  if (error) return error
  await prisma.pedido_plantillas.deleteMany({ where: { id: params.id, clienteId: clienteId! } })
  return NextResponse.json({ ok: true })
}
