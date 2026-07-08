import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermiso } from '@/lib/auth'
import { PERMISO } from '@/lib/permisos'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const TURNOS_VALIDOS = new Set(['ALMUERZO', 'CENA', 'OTRO'])

interface Row {
  fecha: string
  turno: 'ALMUERZO' | 'CENA' | 'OTRO'
  unidades: number
}

/**
 * Unidades vendidas por día (con desglose por turno), SIN montos.
 * Alimenta el gráfico "día a día" del panel de ventas restringido.
 * Filtros: from, to, turno, rubro, sucursal.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requirePermiso(PERMISO.VENTAS_RANKING)
  if (error) return error

  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const sucursal = sp.get('sucursal')
  const turnoParam = sp.get('turno')
  const turno = turnoParam && TURNOS_VALIDOS.has(turnoParam) ? turnoParam : null
  const rubro = sp.get('rubro') || null

  const conds: Prisma.Sql[] = [Prisma.sql`c."clienteId" = ${clienteId}::uuid`]
  if (from) conds.push(Prisma.sql`c.fecha >= ${new Date(`${from}T00:00:00Z`)}`)
  if (to) conds.push(Prisma.sql`c.fecha <= ${new Date(`${to}T23:59:59Z`)}`)
  if (sucursal) conds.push(Prisma.sql`c.sucursal = ${sucursal}`)
  if (turno) conds.push(Prisma.sql`c."turnoNombre" = ${turno}::"TurnoNombre"`)
  if (rubro) conds.push(Prisma.sql`i."rubroCodigo" = ${rubro}`)
  const where = Prisma.join(conds, ' AND ')

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT to_char(c.fecha, 'YYYY-MM-DD') as fecha,
           c."turnoNombre" as turno,
           SUM(i.unidades)::float as unidades
    FROM sales_closure_items i
    JOIN sales_closures c ON c.id = i."closureId"
    WHERE ${where}
    GROUP BY c.fecha, c."turnoNombre"
    ORDER BY c.fecha ASC
  `)

  const dayMap = new Map<string, { ALMUERZO: number; CENA: number; OTRO: number }>()
  const totalsByTurno = { ALMUERZO: 0, CENA: 0, OTRO: 0 }
  for (const r of rows) {
    const cur = dayMap.get(r.fecha) ?? { ALMUERZO: 0, CENA: 0, OTRO: 0 }
    const u = Number(r.unidades) || 0
    cur[r.turno] += u
    totalsByTurno[r.turno] += u
    dayMap.set(r.fecha, cur)
  }

  const series = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      ALMUERZO: v.ALMUERZO,
      CENA: v.CENA,
      OTRO: v.OTRO,
      total: v.ALMUERZO + v.CENA + v.OTRO,
    }))

  const totalUnidades = totalsByTurno.ALMUERZO + totalsByTurno.CENA + totalsByTurno.OTRO
  const dias = series.length

  return NextResponse.json({
    series,
    totals: {
      unidades: totalUnidades,
      dias,
      unidadesDia: dias > 0 ? totalUnidades / dias : 0,
      porTurno: totalsByTurno,
    },
  })
}
