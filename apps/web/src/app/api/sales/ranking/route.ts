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

  // groupBy=item: agrupamos por (codigo, nombre).
  // Maxirest imprime "****" para ítems sin código numérico (cubiertos, copa
  // champagne, sopa del día, etc.). Si agrupáramos solo por codigo, todos
  // esos productos distintos quedarían sumados bajo un único bucket "****".
  const grouped = await prisma.$queryRaw<
    Array<{
      codigo: string
      nombre: string
      rubroCodigo: string | null
      rubroNombre: string | null
      unidades: number
      importe: number
      dias: bigint
    }>
  >(Prisma.sql`
    SELECT
      i.codigo,
      i.nombre,
      i."rubroCodigo",
      i."rubroNombre",
      SUM(i.unidades)::float as unidades,
      SUM(i.importe)::float as importe,
      COUNT(DISTINCT c.fecha) as dias
    FROM sales_closure_items i
    JOIN sales_closures c ON c.id = i."closureId"
    WHERE c.id = ANY(${closureIds}::uuid[])
    GROUP BY i.codigo, i.nombre, i."rubroCodigo", i."rubroNombre"
    ORDER BY SUM(i.importe) DESC
    LIMIT ${limit}
  `)

  // Master para enriquecer nombres "oficiales" cuando el código es estable.
  const codigosEstables = grouped.filter((g) => g.codigo !== '****').map((g) => g.codigo)
  const masters = codigosEstables.length > 0
    ? await prisma.sales_product_master.findMany({
        where: { clienteId: clienteId!, codigoMaxirest: { in: codigosEstables } },
        select: { codigoMaxirest: true, nombre: true, rubroCodigo: true, rubroNombre: true },
      })
    : []
  const masterByCodigo = new Map(masters.map((m) => [m.codigoMaxirest, m]))

  const ranking = grouped.map((g) => {
    const m = g.codigo !== '****' ? masterByCodigo.get(g.codigo) : undefined
    const unidades = Number(g.unidades)
    const importe = Number(g.importe)
    const dias = Number(g.dias)
    return {
      codigo: g.codigo,
      nombre: m?.nombre ?? g.nombre,
      rubroCodigo: m?.rubroCodigo ?? g.rubroCodigo,
      rubroNombre: m?.rubroNombre ?? g.rubroNombre,
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
