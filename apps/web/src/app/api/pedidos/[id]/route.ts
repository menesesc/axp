import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { cargarPedido, serializarPedido } from '@/lib/stock/pedidos'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS)
  if (error) return error
  const pedido = await cargarPedido(params.id, clienteId!)
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  return NextResponse.json({ pedido: serializarPedido(pedido) })
}

/**
 * Edita un pedido pendiente.
 * Body: {
 *   items?: [{ insumoId, cantidadPedida }],   // lista completa: las que faltan se quitan
 *   nota?: string | null,
 *   estado?: 'cancelado' | 'pendiente',       // cancelar / reabrir un cancelado
 * }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_PEDIDOS, 'edit')
  if (error) return error
  const pedido = await cargarPedido(params.id, clienteId!)
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (body.estado === 'pendiente' && pedido.estado === 'cancelado') {
    await prisma.pedidos_internos.update({ where: { id: pedido.id }, data: { estado: 'pendiente', updatedAt: new Date() } })
  } else if (pedido.estado !== 'pendiente') {
    return NextResponse.json({ error: 'Solo se pueden editar pedidos pendientes' }, { status: 409 })
  }

  const ops = []
  if (Array.isArray(body.items)) {
    const items: Array<{ insumoId: string; cantidadPedida: number }> = body.items
    if (items.some((it) => !Number.isFinite(Number(it.cantidadPedida)) || Number(it.cantidadPedida) < 0)) {
      return NextResponse.json({ error: 'Hay cantidades inválidas' }, { status: 400 })
    }
    const propios = new Set(
      (
        await prisma.insumos.findMany({
          where: { clienteId: clienteId!, id: { in: items.map((i) => i.insumoId) } },
          select: { id: true },
        })
      ).map((i) => i.id)
    )
    const actuales = new Map(pedido.items.map((it) => [it.insumoId, it]))
    const nuevos = new Set(items.map((i) => i.insumoId))
    for (const it of pedido.items) {
      if (!nuevos.has(it.insumoId)) ops.push(prisma.pedido_interno_items.delete({ where: { id: it.id } }))
    }
    for (const it of items) {
      if (!propios.has(it.insumoId)) continue
      const q = Number(it.cantidadPedida)
      const act = actuales.get(it.insumoId)
      if (!act) {
        ops.push(prisma.pedido_interno_items.create({ data: { pedidoId: pedido.id, insumoId: it.insumoId, cantidadPedida: q, manual: true } }))
      } else if (Math.abs(Number(act.cantidadPedida) - q) > 1e-9) {
        // Editada a mano: la sincronización con ventas ya no pisa la cantidad.
        ops.push(prisma.pedido_interno_items.update({ where: { id: act.id }, data: { cantidadPedida: q, manual: true } }))
      }
    }
  }

  const data: Record<string, unknown> = { updatedAt: new Date() }
  if (body.nota !== undefined) data.nota = body.nota ? String(body.nota).trim() : null
  if (body.estado === 'cancelado') data.estado = 'cancelado'
  ops.push(prisma.pedidos_internos.update({ where: { id: pedido.id }, data }))
  await prisma.$transaction(ops)

  const actualizado = await cargarPedido(pedido.id, clienteId!)
  return NextResponse.json({ pedido: serializarPedido(actualizado!) })
}
