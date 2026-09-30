import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/** Cambia el estado de un pedido a proveedor. Body: { estado: 'recibido' | 'cancelado' | 'enviado' } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_COMPRAS, 'edit')
  if (error) return error
  const body = await request.json().catch(() => null)
  const estado = String(body?.estado || '')
  if (!['recibido', 'cancelado', 'enviado'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }
  const r = await prisma.pedidos_proveedor.updateMany({
    where: { id: params.id, clienteId: clienteId! },
    data: { estado, updatedAt: new Date() },
  })
  if (r.count === 0) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
