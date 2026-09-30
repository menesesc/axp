import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

/**
 * Envío masivo: marca varios pedidos pendientes como enviados hoy, mandando
 * exactamente lo pedido. Body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.CONCILIACION_DESPACHO, 'edit')
  if (error) return error
  const body = await request.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : []
  if (ids.length === 0) return NextResponse.json({ error: 'No hay pedidos seleccionados' }, { status: 400 })

  const pedidos = await prisma.pedidos_internos.findMany({
    where: { id: { in: ids }, clienteId: clienteId!, estado: 'pendiente' },
    select: { id: true },
  })
  const hoy = new Date(hoyAR())
  const ahora = new Date()

  await prisma.$transaction(
    pedidos.flatMap((p) => [
      prisma.$executeRaw`UPDATE pedido_interno_items SET "cantidadEnviada" = "cantidadPedida" WHERE "pedidoId" = ${p.id}::uuid`,
      prisma.pedidos_internos.update({
        where: { id: p.id },
        data: { estado: 'enviado', fechaEnvio: hoy, enviadoAt: ahora, enviadoPor: user?.id ?? null, updatedAt: ahora },
      }),
    ])
  )
  return NextResponse.json({ enviados: pedidos.length })
}
