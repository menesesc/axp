import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Ventas por forma de cobro en un rango. Incluye % sobre total.
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
    return NextResponse.json({ payments: [], total: 0 })
  }

  const grouped = await prisma.sales_closure_payments.groupBy({
    by: ['formaCobro'],
    where: { closureId: { in: closureIds } },
    _sum: { total: true, cantidad: true },
    orderBy: { _sum: { total: 'desc' } },
  })

  const totalImporte = grouped.reduce((s, g) => s + Number(g._sum.total ?? 0), 0)

  const payments = grouped.map((g) => {
    const importe = Number(g._sum.total ?? 0)
    return {
      formaCobro: g.formaCobro,
      total: importe,
      cantidad: g._sum.cantidad ?? 0,
      porcentaje: totalImporte > 0 ? (importe / totalImporte) * 100 : 0,
    }
  })

  return NextResponse.json({ payments, total: totalImporte })
}
