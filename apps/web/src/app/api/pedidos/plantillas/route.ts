import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { guardarItemsPlantilla, validarPlantilla } from '@/lib/stock/plantillas'

export const dynamic = 'force-dynamic'

/** Crea una plantilla. Body: { nombre, destinoId?, items: [{ insumoId, cantidad }] } */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const v = await validarPlantilla(clienteId, await request.json().catch(() => null))
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    const plantilla = await prisma.pedido_plantillas.create({
      data: { clienteId, nombre: v.nombre, destinoId: v.destinoId },
    })
    await guardarItemsPlantilla(plantilla.id, v.items)
    return NextResponse.json({ plantilla }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Ya existe una plantilla con ese nombre' }, { status: 409 })
    throw e
  }
}
