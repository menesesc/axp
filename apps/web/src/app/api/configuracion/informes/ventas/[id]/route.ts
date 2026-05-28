import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  subscriptionPayloadSchema,
  scheduleDaysFor,
  resolveOrInviteRecipient,
} from '@/lib/sales/report-subscriptions'

export const dynamic = 'force-dynamic'

async function ensureOwned(id: string, clienteId: string) {
  const sub = await prisma.sales_report_subscriptions.findFirst({
    where: { id, clienteId },
    select: { id: true },
  })
  return !!sub
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const owned = await ensureOwned(params.id, user.clienteId)
  if (!owned) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

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

  // Resolver/invitar destinatarios nuevos antes de tocar la DB.
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

  // Reemplazo total de recipients (más simple que un diff y aceptable por el
  // volumen esperado: pocas decenas por subscripción).
  await prisma.$transaction([
    prisma.sales_report_subscriptions.update({
      where: { id: params.id },
      data: {
        nombre: payload.nombre,
        frecuencia: payload.frecuencia,
        diaSemana: dias.diaSemana,
        diaMes: dias.diaMes,
        hora: payload.hora,
        tz: payload.tz,
        sucursal: payload.sucursal ?? null,
        topN: payload.topN,
        activo: payload.activo,
      },
    }),
    prisma.sales_report_subscription_recipients.deleteMany({
      where: { subscriptionId: params.id },
    }),
    prisma.sales_report_subscription_recipients.createMany({
      data: resolved.map((r) => ({ ...r, subscriptionId: params.id })),
    }),
  ])

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const owned = await ensureOwned(params.id, user.clienteId)
  if (!owned) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  await prisma.sales_report_subscriptions.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
