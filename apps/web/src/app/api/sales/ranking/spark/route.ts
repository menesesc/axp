import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermiso } from '@/lib/auth'
import { PERMISO } from '@/lib/permisos'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const TURNOS_VALIDOS = new Set(['ALMUERZO', 'CENA', 'OTRO'])

/**
 * Serie diaria de unidades por producto, para dibujar sparklines en los
 * listados (solo unidades, sin montos). Devuelve un eje de fechas común y,
 * por producto (clave `codigo|nombre`), un array alineado a ese eje.
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

  const rows = await prisma.$queryRaw<Array<{ codigo: string; nombre: string; fecha: string; u: number }>>(Prisma.sql`
    SELECT i.codigo, i.nombre, to_char(c.fecha, 'YYYY-MM-DD') as fecha, SUM(i.unidades)::float as u
    FROM sales_closure_items i
    JOIN sales_closures c ON c.id = i."closureId"
    WHERE ${where}
    GROUP BY i.codigo, i.nombre, c.fecha
  `)

  // Eje de fechas común (días con alguna venta en el rango).
  const dateSet = new Set<string>()
  for (const r of rows) dateSet.add(r.fecha)
  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b))
  const dateIdx = new Map(dates.map((d, i) => [d, i]))

  // Clave estable: por código cuando es único; "****" se reusa, ahí desambigua
  // el nombre. Coincide con cómo el listado identifica cada producto (el ranking
  // renombra desde el master, por eso NO usamos el nombre para códigos estables).
  const series: Record<string, number[]> = {}
  for (const r of rows) {
    const key = r.codigo && r.codigo !== '****' ? r.codigo : `****|${r.nombre}`
    let arr = series[key]
    if (!arr) {
      arr = new Array(dates.length).fill(0)
      series[key] = arr
    }
    const i = dateIdx.get(r.fecha)
    if (i != null) arr[i] += Number(r.u) || 0
  }

  return NextResponse.json({ dates, series })
}
