import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const sub = await prisma.sales_report_subscriptions.findFirst({
    where: { id: params.id, clienteId: user.clienteId },
    select: { id: true },
  })
  if (!sub) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const sp = request.nextUrl.searchParams
  const limit = Math.min(parseInt(sp.get('limit') || '30', 10), 100)

  const runs = await prisma.sales_report_runs.findMany({
    where: { subscriptionId: params.id },
    orderBy: { ejecutadoEn: 'desc' },
    take: limit,
    select: {
      id: true,
      fechaInformeDesde: true,
      fechaInformeHasta: true,
      ejecutadoEn: true,
      status: true,
      destinatariosCount: true,
      error: true,
    },
  })

  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      fechaInformeDesde: r.fechaInformeDesde.toISOString().slice(0, 10),
      fechaInformeHasta: r.fechaInformeHasta.toISOString().slice(0, 10),
      ejecutadoEn: r.ejecutadoEn.toISOString(),
      status: r.status,
      destinatariosCount: r.destinatariosCount,
      error: r.error,
    })),
  })
}
