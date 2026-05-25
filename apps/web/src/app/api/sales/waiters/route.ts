import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Ranking de mozos en un rango: importe total, # ventas, # cubiertos, ticket promedio.
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

  const closureWhere: Record<string, unknown> = { clienteId: clienteId! }
  if (Object.keys(dateFilter).length > 0) closureWhere.fecha = dateFilter
  if (sucursal) closureWhere.sucursal = sucursal

  const closures = await prisma.sales_closures.findMany({
    where: closureWhere,
    select: { id: true },
  })
  const closureIds = closures.map((c) => c.id)
  if (closureIds.length === 0) {
    return NextResponse.json({ waiters: [] })
  }

  const grouped = await prisma.sales_closure_waiters.groupBy({
    by: ['codigo', 'nombre'],
    where: { closureId: { in: closureIds } },
    _sum: { importe: true, cantVentas: true, cantCubiertos: true },
    orderBy: { _sum: { importe: 'desc' } },
  })

  const waiters = grouped.map((g) => {
    const importe = Number(g._sum.importe ?? 0)
    const ventas = g._sum.cantVentas ?? 0
    const cubiertos = g._sum.cantCubiertos ?? 0
    return {
      codigo: g.codigo,
      nombre: g.nombre,
      importe,
      cantVentas: ventas,
      cantCubiertos: cubiertos,
      ticketPromedio: ventas > 0 ? importe / ventas : 0,
      promedioCubierto: cubiertos > 0 ? importe / cubiertos : 0,
    }
  })

  return NextResponse.json({ waiters })
}
