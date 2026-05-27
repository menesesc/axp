import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface RankingByRubroArgs {
  clienteId: string
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
  sucursal?: string | null
  topN?: number
  search?: string
}

export interface RubroItem {
  codigo: string
  nombre: string
  almuerzo_u: number
  almuerzo_i: number
  cena_u: number
  cena_i: number
  otro_u: number
  otro_i: number
  unidades: number
  importe: number
  participacionRubro: number
}

export interface RubroBlock {
  rubroCodigo: string | null
  rubroNombre: string | null
  totales: {
    unidades: number
    importe: number
    almuerzo_u: number
    almuerzo_i: number
    cena_u: number
    cena_i: number
    otro_u: number
    otro_i: number
  }
  items: RubroItem[]
  itemsRestantes: number
}

export interface RankingByRubroResult {
  rango: { from: string; to: string; dias: number }
  totales: {
    unidades: number
    importe: number
    tickets: number
    almuerzo: number
    cena: number
    otro: number
  }
  rubros: RubroBlock[]
}

export async function fetchRankingByRubro(args: RankingByRubroArgs): Promise<RankingByRubroResult> {
  const { clienteId, from, to } = args
  const sucursal = args.sucursal ?? null
  const topN = Math.min(args.topN ?? 10, 200)
  const search = args.search?.trim().toLowerCase() || ''

  const dateFrom = new Date(`${from}T00:00:00Z`)
  const dateTo = new Date(`${to}T23:59:59Z`)

  const closureWhere: Record<string, unknown> = { clienteId, fecha: { gte: dateFrom, lte: dateTo } }
  if (sucursal) closureWhere.sucursal = sucursal

  const closures = await prisma.sales_closures.findMany({
    where: closureWhere,
    select: { id: true, fecha: true, turnoNombre: true, cantTickets: true, totalVentas: true },
  })

  if (closures.length === 0) {
    return {
      rango: { from, to, dias: 0 },
      totales: { unidades: 0, importe: 0, tickets: 0, almuerzo: 0, cena: 0, otro: 0 },
      rubros: [],
    }
  }

  const closureIds = closures.map((c) => c.id)
  const diasSet = new Set(closures.map((c) => c.fecha.toISOString().slice(0, 10)))

  const totales = closures.reduce(
    (acc, c) => {
      const v = Number(c.totalVentas ?? 0)
      acc.tickets += c.cantTickets ?? 0
      if (c.turnoNombre === 'ALMUERZO') acc.almuerzo += v
      else if (c.turnoNombre === 'CENA') acc.cena += v
      else acc.otro += v
      return acc
    },
    { tickets: 0, almuerzo: 0, cena: 0, otro: 0 }
  )

  const items = await prisma.$queryRaw<
    Array<{
      rubroCodigo: string | null
      rubroNombre: string | null
      codigo: string
      nombre: string
      turnoNombre: 'ALMUERZO' | 'CENA' | 'OTRO'
      unidades: number
      importe: number
    }>
  >(Prisma.sql`
    SELECT
      i."rubroCodigo",
      i."rubroNombre",
      i.codigo,
      i.nombre,
      c."turnoNombre"::text as "turnoNombre",
      SUM(i.unidades)::float as unidades,
      SUM(i.importe)::float as importe
    FROM sales_closure_items i
    JOIN sales_closures c ON c.id = i."closureId"
    WHERE c.id = ANY(${closureIds}::uuid[])
    GROUP BY i."rubroCodigo", i."rubroNombre", i.codigo, i.nombre, c."turnoNombre"
  `)

  type ItemAgg = Omit<RubroItem, 'participacionRubro'>
  type RubroAgg = {
    rubroCodigo: string | null
    rubroNombre: string | null
    items: Map<string, ItemAgg>
    unidades: number
    importe: number
    almuerzo_u: number
    almuerzo_i: number
    cena_u: number
    cena_i: number
    otro_u: number
    otro_i: number
  }

  const rubroMap = new Map<string, RubroAgg>()
  for (const row of items) {
    const rubroKey = row.rubroCodigo ?? '__null__'
    let rubro = rubroMap.get(rubroKey)
    if (!rubro) {
      rubro = {
        rubroCodigo: row.rubroCodigo,
        rubroNombre: row.rubroNombre,
        items: new Map(),
        unidades: 0,
        importe: 0,
        almuerzo_u: 0,
        almuerzo_i: 0,
        cena_u: 0,
        cena_i: 0,
        otro_u: 0,
        otro_i: 0,
      }
      rubroMap.set(rubroKey, rubro)
    }
    const itemKey = `${row.codigo}|${row.nombre}`
    let it = rubro.items.get(itemKey)
    if (!it) {
      it = {
        codigo: row.codigo,
        nombre: row.nombre,
        almuerzo_u: 0,
        almuerzo_i: 0,
        cena_u: 0,
        cena_i: 0,
        otro_u: 0,
        otro_i: 0,
        unidades: 0,
        importe: 0,
      }
      rubro.items.set(itemKey, it)
    }
    const u = Number(row.unidades)
    const i = Number(row.importe)
    if (row.turnoNombre === 'ALMUERZO') {
      it.almuerzo_u += u
      it.almuerzo_i += i
      rubro.almuerzo_u += u
      rubro.almuerzo_i += i
    } else if (row.turnoNombre === 'CENA') {
      it.cena_u += u
      it.cena_i += i
      rubro.cena_u += u
      rubro.cena_i += i
    } else {
      it.otro_u += u
      it.otro_i += i
      rubro.otro_u += u
      rubro.otro_i += i
    }
    it.unidades += u
    it.importe += i
    rubro.unidades += u
    rubro.importe += i
  }

  const matchesSearch = (it: ItemAgg, rubro: RubroAgg) => {
    if (!search) return true
    return (
      it.nombre.toLowerCase().includes(search) ||
      (rubro.rubroNombre ?? '').toLowerCase().includes(search)
    )
  }

  const rubros: RubroBlock[] = Array.from(rubroMap.values())
    .map((r) => {
      const filtered = Array.from(r.items.values()).filter((it) => matchesSearch(it, r))
      filtered.sort((a, b) => b.importe - a.importe)
      const top = filtered.slice(0, topN)
      const restantes = filtered.length - top.length
      return {
        rubroCodigo: r.rubroCodigo,
        rubroNombre: r.rubroNombre,
        totales: {
          unidades: r.unidades,
          importe: r.importe,
          almuerzo_u: r.almuerzo_u,
          almuerzo_i: r.almuerzo_i,
          cena_u: r.cena_u,
          cena_i: r.cena_i,
          otro_u: r.otro_u,
          otro_i: r.otro_i,
        },
        items: top.map((it) => ({
          ...it,
          participacionRubro: r.importe > 0 ? it.importe / r.importe : 0,
        })),
        itemsRestantes: restantes,
      }
    })
    .filter((r) => !search || r.items.length > 0)
    .sort((a, b) => b.totales.importe - a.totales.importe)

  const totalUnidades = rubros.reduce((acc, r) => acc + r.totales.unidades, 0)
  const totalImporte = rubros.reduce((acc, r) => acc + r.totales.importe, 0)

  return {
    rango: { from, to, dias: diasSet.size },
    totales: {
      unidades: totalUnidades,
      importe: totalImporte,
      tickets: totales.tickets,
      almuerzo: totales.almuerzo,
      cena: totales.cena,
      otro: totales.otro,
    },
    rubros,
  }
}
