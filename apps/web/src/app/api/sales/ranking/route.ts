import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Ranking de productos vendidos en un rango de fechas.
 * groupBy=item (default) | rubro
 * Devuelve top N + cantidad de días con ventas por producto/rubro.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const groupBy = sp.get('groupBy') === 'rubro' ? 'rubro' : 'item'
  const limit = Math.min(parseInt(sp.get('limit') || '50'), 500)
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

    // Días distintos con ventas por rubro
    const diasByRubro = await prisma.$queryRaw<Array<{ rubroCodigo: string | null; dias: bigint }>>(
      Prisma.sql`
        SELECT i."rubroCodigo" as "rubroCodigo", COUNT(DISTINCT c.fecha) as dias
        FROM sales_closure_items i
        JOIN sales_closures c ON c.id = i."closureId"
        WHERE c.id = ANY(${closureIds}::uuid[])
        GROUP BY i."rubroCodigo"
      `
    )
    const diasMap = new Map(diasByRubro.map((d) => [d.rubroCodigo ?? '__null__', Number(d.dias)]))

    const ranking = grouped.map((g) => {
      const unidades = Number(g._sum.unidades ?? 0)
      const importe = Number(g._sum.importe ?? 0)
      const dias = diasMap.get(g.rubroCodigo ?? '__null__') ?? 0
      return {
        rubroCodigo: g.rubroCodigo,
        rubroNombre: g.rubroNombre,
        unidades,
        importe,
        dias,
        promedioDiario: dias > 0 ? importe / dias : 0,
        unidadesDia: dias > 0 ? unidades / dias : 0,
      }
    })
    const total = ranking.reduce(
      (acc, r) => ({ unidades: acc.unidades + r.unidades, importe: acc.importe + r.importe }),
      { unidades: 0, importe: 0 }
    )
    return NextResponse.json({ ranking, groupBy, total })
  }

  // groupBy=item: agrupamos por código.
  const grouped = await prisma.sales_closure_items.groupBy({
    by: ['codigo'],
    where: { closureId: { in: closureIds } },
    _sum: { unidades: true, importe: true },
    orderBy: { _sum: { importe: 'desc' } },
    take: limit,
  })

  const codigos = grouped.map((g) => g.codigo)
  const [masters, diasByCodigo] = await Promise.all([
    prisma.sales_product_master.findMany({
      where: { clienteId: clienteId!, codigoMaxirest: { in: codigos } },
      select: { codigoMaxirest: true, nombre: true, rubroCodigo: true, rubroNombre: true },
    }),
    prisma.$queryRaw<Array<{ codigo: string; dias: bigint }>>(
      Prisma.sql`
        SELECT i.codigo, COUNT(DISTINCT c.fecha) as dias
        FROM sales_closure_items i
        JOIN sales_closures c ON c.id = i."closureId"
        WHERE c.id = ANY(${closureIds}::uuid[])
          AND i.codigo = ANY(${codigos}::text[])
        GROUP BY i.codigo
      `
    ),
  ])
  const masterByCodigo = new Map(masters.map((m) => [m.codigoMaxirest, m]))
  const diasMap = new Map(diasByCodigo.map((d) => [d.codigo, Number(d.dias)]))

  const ranking = grouped.map((g) => {
    const m = masterByCodigo.get(g.codigo)
    const unidades = Number(g._sum.unidades ?? 0)
    const importe = Number(g._sum.importe ?? 0)
    const dias = diasMap.get(g.codigo) ?? 0
    return {
      codigo: g.codigo,
      nombre: m?.nombre ?? g.codigo,
      rubroCodigo: m?.rubroCodigo ?? null,
      rubroNombre: m?.rubroNombre ?? null,
      unidades,
      importe,
      dias,
      promedioDiario: dias > 0 ? importe / dias : 0,
      unidadesDia: dias > 0 ? unidades / dias : 0,
    }
  })

  const total = ranking.reduce(
    (acc, r) => ({ unidades: acc.unidades + r.unidades, importe: acc.importe + r.importe }),
    { unidades: 0, importe: 0 }
  )

  return NextResponse.json({ ranking, groupBy, total })
}
