import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  subscriptionPayloadSchema,
  scheduleDaysFor,
  resolveOrInviteRecipient,
  fetchSubscriptionsForCliente,
} from '@/lib/sales/report-subscriptions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const subscriptions = await fetchSubscriptionsForCliente(user.clienteId)
  return NextResponse.json({ subscriptions })
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  let payload: ReturnType<typeof subscriptionPayloadSchema.parse>
  try {
    payload = subscriptionPayloadSchema.parse(await request.json())
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: err.errors }, { status: 400 })
    }
    throw err
  }

  const dias = scheduleDaysFor(payload.frecuencia)

  // Resolver/invitar destinatarios antes de crear la subscripción. Si alguno
  // falla, no se crea nada (mejor error claro que subscripción a medias).
  const resolved: Array<{ email: string; nombre: string | null; usuarioId: string | null }> = []
  for (const r of payload.recipients) {
    const res = await resolveOrInviteRecipient({
      email: r.email,
      nombre: r.nombre ?? null,
      clienteId: user.clienteId,
    })
    resolved.push({
      email: r.email.trim().toLowerCase(),
      nombre: r.nombre ?? null,
      usuarioId: res.usuarioId,
    })
  }

  const created = await prisma.sales_report_subscriptions.create({
    data: {
      clienteId: user.clienteId,
      nombre: payload.nombre,
      frecuencia: payload.frecuencia,
      diaSemana: dias.diaSemana,
      diaMes: dias.diaMes,
      hora: payload.hora,
      tz: payload.tz,
      sucursal: payload.sucursal ?? null,
      topN: payload.topN,
      activo: payload.activo,
      recipients: { create: resolved },
    },
    include: { recipients: true },
  })

  return NextResponse.json({ id: created.id }, { status: 201 })
}
