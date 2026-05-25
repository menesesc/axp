import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Ventas por día y turno (almuerzo vs cena). Útil para line/bar chart comparativo.
 * También devuelve agregados por turno (totales y promedio diario).
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const sucursal = sp.get('sucursal')

  const dateFilter: Record<string, Date> = {}
  if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`)
  if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`)

  const where: Record<string, unknown> = { clienteId: clienteId! }
  if (Object.keys(dateFilter).length > 0) where.fecha = dateFilter
  if (sucursal) where.sucursal = sucursal

  const closures = await prisma.sales_closures.findMany({
    where,
    select: {
      fecha: true,
      turnoNombre: true,
      totalVentas: true,
      cantTickets: true,
      cantCubiertos: true,
    },
    orderBy: { fecha: 'asc' },
  })

  // Agrupar por fecha (YYYY-MM-DD) y turno
  const dayMap = new Map<
    string,
    { ALMUERZO: number; CENA: number; OTRO: number; totalTickets: number }
  >()
  let totals = { ALMUERZO: 0, CENA: 0, OTRO: 0 }
  let counts = { ALMUERZO: 0, CENA: 0, OTRO: 0 }

  for (const c of closures) {
    const key = c.fecha.toISOString().slice(0, 10)
    const cur = dayMap.get(key) ?? { ALMUERZO: 0, CENA: 0, OTRO: 0, totalTickets: 0 }
    const importe = Number(c.totalVentas ?? 0)
    cur[c.turnoNombre as keyof typeof totals] += importe
    cur.totalTickets += c.cantTickets ?? 0
    dayMap.set(key, cur)
    totals[c.turnoNombre as keyof typeof totals] += importe
    counts[c.turnoNombre as keyof typeof counts]++
  }

  const series = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      almuerzo: v.ALMUERZO,
      cena: v.CENA,
      otro: v.OTRO,
      total: v.ALMUERZO + v.CENA + v.OTRO,
      tickets: v.totalTickets,
    }))

  return NextResponse.json({
    series,
    totals: {
      almuerzo: totals.ALMUERZO,
      cena: totals.CENA,
      otro: totals.OTRO,
      total: totals.ALMUERZO + totals.CENA + totals.OTRO,
    },
    promedioPorTurno: {
      almuerzo: counts.ALMUERZO > 0 ? totals.ALMUERZO / counts.ALMUERZO : 0,
      cena: counts.CENA > 0 ? totals.CENA / counts.CENA : 0,
      otro: counts.OTRO > 0 ? totals.OTRO / counts.OTRO : 0,
    },
    cierres: {
      almuerzo: counts.ALMUERZO,
      cena: counts.CENA,
      otro: counts.OTRO,
    },
  })
}
