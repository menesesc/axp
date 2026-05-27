import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendSalesReport } from '@/lib/sales/send-report'
import { computeReportRange } from '@/lib/sales/report-period'

export const dynamic = 'force-dynamic'

/**
 * Dispara el envío "ahora" de una subscripción (saltea el scheduler).
 * Registra la corrida en sales_report_runs igual que el cron — útil para
 * forzar el envío del día al activar una subscripción nueva o cuando se
 * detecta una falla.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const sub = await prisma.sales_report_subscriptions.findFirst({
    where: { id: params.id, clienteId: user.clienteId },
    select: { id: true, frecuencia: true, tz: true },
  })
  if (!sub) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const baseUrl = _request.nextUrl.origin
  const range = computeReportRange(sub.frecuencia, new Date())

  // Si ya hay un run para este período, lo dejamos correr igual (es disparo
  // manual del admin, debe poder reenviar). Pero respetamos el UNIQUE
  // borrando el run previo del mismo período.
  await prisma.sales_report_runs.deleteMany({
    where: {
      subscriptionId: sub.id,
      fechaInformeDesde: new Date(`${range.from}T00:00:00Z`),
    },
  })

  const result = await sendSalesReport({ subscriptionId: sub.id, baseUrl, rangeOverride: range })

  await prisma.sales_report_runs.create({
    data: {
      subscriptionId: sub.id,
      fechaInformeDesde: new Date(`${range.from}T00:00:00Z`),
      fechaInformeHasta: new Date(`${range.to}T00:00:00Z`),
      status: result.status,
      destinatariosCount: result.destinatariosCount,
      resendMessageIds: result.resendMessageIds,
      error: result.error ?? null,
    },
  })

  if (result.status === 'FAIL') {
    return NextResponse.json({ error: result.error ?? 'Error', range }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    destinatariosCount: result.destinatariosCount,
    range,
  })
}
