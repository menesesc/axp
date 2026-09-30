import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { getCentral } from '@/lib/stock/depositos'
import { lineasSugeridas, PEDIDO_INCLUDE, serializarPedido } from '@/lib/stock/pedidos'

export const dynamic = 'force-dynamic'

const ESTADOS = ['pendiente', 'enviado', 'cancelado']

/** Lista de pedidos internos. Query: ?estado=pendiente|enviado|cancelado|todos&destinoId= */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const estado = sp.get('estado') || 'pendiente'
  const destinoId = sp.get('destinoId')

  const pedidos = await prisma.pedidos_internos.findMany({
    where: {
      clienteId,
      ...(ESTADOS.includes(estado) ? { estado } : {}),
      ...(destinoId ? { destinoId } : {}),
    },
    include: PEDIDO_INCLUDE,
    // Pendientes: los más viejos primero (orden de despacho). Resto: recientes primero.
    orderBy: estado === 'pendiente' ? [{ createdAt: 'asc' }] : [{ updatedAt: 'desc' }],
    take: 100,
  })

  return NextResponse.json({ pedidos: pedidos.map(serializarPedido) })
}

/**
 * Crea un pedido manual al central.
 * Body: { destinoId, fechaVentas?: 'YYYY-MM-DD' | null, plantillaId?: string | null, nota? }
 * Sugiere lo vendido ese día (ventas × receta del depósito) + la plantilla.
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const destino = await prisma.depositos.findFirst({ where: { id: String(body?.destinoId || ''), clienteId, activo: true } })
  if (!destino) return NextResponse.json({ error: 'Depósito de destino inválido' }, { status: 400 })
  const central = await getCentral(clienteId)
  if (destino.id === central.id) {
    return NextResponse.json({ error: 'El central no se hace pedidos a sí mismo' }, { status: 400 })
  }
  const fechaVentas = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fechaVentas || '')) ? String(body.fechaVentas) : null
  const plantillaId = body?.plantillaId ? String(body.plantillaId) : null

  const lineas = await lineasSugeridas(clienteId, destino.id, fechaVentas, plantillaId)

  const pedido = await prisma.pedidos_internos.create({
    data: {
      clienteId,
      origenId: central.id,
      destinoId: destino.id,
      fechaVentas: fechaVentas ? new Date(fechaVentas) : null,
      origen: 'manual',
      nota: body?.nota ? String(body.nota).trim() : null,
      creadoPor: user?.id ?? null,
      items: { create: lineas },
    },
    include: PEDIDO_INCLUDE,
  })
  return NextResponse.json({ pedido: serializarPedido(pedido) }, { status: 201 })
}
