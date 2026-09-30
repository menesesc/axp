import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'
import { cargarPedido, serializarPedido } from '@/lib/stock/pedidos'

export const dynamic = 'force-dynamic'

/**
 * El central registra el envío de un pedido: lo que efectivamente mandó de
 * cada insumo (puede ser más o menos de lo pedido, o un insumo no pedido).
 * Desde `fechaEnvio` esas cantidades salen del central y entran al destino.
 * Body: { items: [{ insumoId, cantidadEnviada }], fechaEnvio?: 'YYYY-MM-DD' }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, clienteId, error } = await requireSeccion(SECCION.CONCILIACION_DESPACHO, 'edit')
  if (error) return error
  const pedido = await cargarPedido(params.id, clienteId!)
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (pedido.estado !== 'pendiente') return NextResponse.json({ error: 'El pedido no está pendiente' }, { status: 409 })

  const body = await request.json().catch(() => null)
  const items: Array<{ insumoId: string; cantidadEnviada: number }> = Array.isArray(body?.items) ? body.items : []
  const fechaEnvio = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.fechaEnvio || '')) ? String(body.fechaEnvio) : hoyAR()
  if (fechaEnvio > hoyAR()) return NextResponse.json({ error: 'La fecha de envío no puede ser futura' }, { status: 400 })
  if (items.some((it) => !Number.isFinite(Number(it.cantidadEnviada)) || Number(it.cantidadEnviada) < 0)) {
    return NextResponse.json({ error: 'Hay cantidades inválidas' }, { status: 400 })
  }

  const propios = new Set(
    (
      await prisma.insumos.findMany({ where: { clienteId: clienteId!, id: { in: items.map((i) => i.insumoId) } }, select: { id: true } })
    ).map((i) => i.id)
  )
  const actuales = new Map(pedido.items.map((it) => [it.insumoId, it]))
  const enviados = new Map(items.filter((i) => propios.has(i.insumoId)).map((i) => [i.insumoId, Number(i.cantidadEnviada)]))

  await prisma.$transaction([
    // Líneas pedidas: lo enviado (0 si no se mandó).
    ...pedido.items.map((it) =>
      prisma.pedido_interno_items.update({ where: { id: it.id }, data: { cantidadEnviada: enviados.get(it.insumoId) ?? 0 } })
    ),
    // Insumos enviados que no estaban pedidos.
    ...[...enviados.entries()]
      .filter(([insumoId, q]) => !actuales.has(insumoId) && q > 0)
      .map(([insumoId, q]) =>
        prisma.pedido_interno_items.create({
          data: { pedidoId: pedido.id, insumoId, cantidadPedida: 0, cantidadEnviada: q, manual: true },
        })
      ),
    prisma.pedidos_internos.update({
      where: { id: pedido.id },
      data: {
        estado: 'enviado',
        fechaEnvio: new Date(fechaEnvio),
        enviadoAt: new Date(),
        enviadoPor: user?.id ?? null,
        updatedAt: new Date(),
      },
    }),
  ])

  const actualizado = await cargarPedido(pedido.id, clienteId!)
  return NextResponse.json({ pedido: serializarPedido(actualizado!) })
}

/** Anula el envío: el pedido vuelve a pendiente y deja de mover stock. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_DESPACHO, 'edit')
  if (error) return error
  const pedido = await cargarPedido(params.id, clienteId!)
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (pedido.estado !== 'enviado') return NextResponse.json({ error: 'El pedido no fue enviado' }, { status: 409 })

  await prisma.$transaction([
    prisma.pedido_interno_items.deleteMany({ where: { pedidoId: pedido.id, cantidadPedida: 0 } }),
    prisma.pedido_interno_items.updateMany({ where: { pedidoId: pedido.id }, data: { cantidadEnviada: null } }),
    prisma.pedidos_internos.update({
      where: { id: pedido.id },
      data: { estado: 'pendiente', fechaEnvio: null, enviadoAt: null, enviadoPor: null, updatedAt: new Date() },
    }),
  ])
  const actualizado = await cargarPedido(pedido.id, clienteId!)
  return NextResponse.json({ pedido: serializarPedido(actualizado!) })
}
