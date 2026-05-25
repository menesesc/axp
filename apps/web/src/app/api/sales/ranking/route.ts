import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Ranking de productos vendidos en un rango de fechas.
 * groupBy=item (default) | rubro
 * Devuelve top 50.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const groupBy = sp.get('groupBy') === 'rubro' ? 'rubro' : 'item'
  const limit = Math.min(parseInt(sp.get('limit') || '50'), 200)
  const sucursal = sp.get('sucursal')

  const dateFilter: Record<string, Date> = {}
  if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`)
  if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`)

  // Filtramos por closure (no por item) — necesitamos pasar clienteId via la relación
  const closureWhere: Record<string, unknown> = { clienteId: clienteId! }
  if (Object.keys(dateFilter).length > 0) closureWhere.fecha = dateFilter
  if (sucursal) closureWhere.sucursal = sucursal

  const closures = await prisma.sales_closures.findMany({
    where: closureWhere,
    select: { id: true },
  })
  const closureIds = closures.map((c) => c.id)
  if (closureIds.length === 0) {
    return NextResponse.json({ ranking: [], groupBy, total: { unidades: 0, importe: 0 } })
  }

  if (groupBy === 'rubro') {
    const grouped = await prisma.sales_closure_items.groupBy({
      by: ['rubroCodigo', 'rubroNombre'],
      where: { closureId: { in: closureIds } },
      _sum: { unidades: true, importe: true },
      orderBy: { _sum: { importe: 'desc' } },
      take: limit,
    })
    const ranking = grouped.map((g) => ({
      rubroCodigo: g.rubroCodigo,
      rubroNombre: g.rubroNombre,
      unidades: Number(g._sum.unidades ?? 0),
      importe: Number(g._sum.importe ?? 0),
    }))
    const total = ranking.reduce(
      (acc, r) => ({ unidades: acc.unidades + r.unidades, importe: acc.importe + r.importe }),
      { unidades: 0, importe: 0 }
    )
    return NextResponse.json({ ranking, groupBy, total })
  }

  // groupBy=item: agrupamos por código (más confiable que nombre, que puede truncarse)
  const grouped = await prisma.sales_closure_items.groupBy({
    by: ['codigo'],
    where: { closureId: { in: closureIds } },
    _sum: { unidades: true, importe: true },
    orderBy: { _sum: { importe: 'desc' } },
    take: limit,
  })

  // Mejor nombre/rubro: el más reciente para ese código en este conjunto.
  // Estrategia simple: traemos masters por código.
  const codigos = grouped.map((g) => g.codigo)
  const masters = await prisma.sales_product_master.findMany({
    where: { clienteId: clienteId!, codigoMaxirest: { in: codigos } },
    select: { codigoMaxirest: true, nombre: true, rubroCodigo: true, rubroNombre: true },
  })
  const masterByCodigo = new Map(masters.map((m) => [m.codigoMaxirest, m]))

  const ranking = grouped.map((g) => {
    const m = masterByCodigo.get(g.codigo)
    return {
      codigo: g.codigo,
      nombre: m?.nombre ?? g.codigo,
      rubroCodigo: m?.rubroCodigo ?? null,
      rubroNombre: m?.rubroNombre ?? null,
      unidades: Number(g._sum.unidades ?? 0),
      importe: Number(g._sum.importe ?? 0),
    }
  })

  const total = ranking.reduce(
    (acc, r) => ({ unidades: acc.unidades + r.unidades, importe: acc.importe + r.importe }),
    { unidades: 0, importe: 0 }
  )

  return NextResponse.json({ ranking, groupBy, total })
}
