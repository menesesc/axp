'use client'

import { Fragment, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fmtAR, fmtNumAR, fmtFecha, fmtFechaShort, useSort, type SortDir } from '@/components/sales/shared'
import { Search, X, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Package, Truck } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

interface Line {
  fecha: string | null
  proveedorId: string | null
  proveedor: string | null
  codigo: string | null
  descripcion: string
  unidad: string | null
  cantidad: number | null
  precioUnitario: number | null
}

interface ItemAgg {
  key: string
  descripcion: string
  codigo: string | null
  unidad: string | null
  proveedores: string[]
  compras: number
  cantidadTotal: number
  primerPrecio: number
  ultimoPrecio: number
  minPrecio: number
  maxPrecio: number
  variacionPct: number
  ultimaFecha: string
  lines: Line[] // asc por fecha
}

function isoWeekAgo(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10)
  return { from, to }
}

const itemKeyOf = (l: Line) => (l.descripcion || '').trim().toUpperCase()

function aggregateItems(lines: Line[]): ItemAgg[] {
  const map = new Map<string, Line[]>()
  for (const l of lines) {
    if (l.precioUnitario == null) continue
    const k = itemKeyOf(l)
    if (!k) continue
    const arr = map.get(k)
    if (arr) arr.push(l)
    else map.set(k, [l])
  }
  const out: ItemAgg[] = []
  for (const [key, ls] of map) {
    // asc por fecha para leer evolución de precio
    const asc = [...ls].sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''))
    const precios = asc.map((l) => l.precioUnitario as number)
    const primerPrecio = precios[0] ?? 0
    const ultimoPrecio = precios[precios.length - 1] ?? 0
    const last = asc[asc.length - 1]
    out.push({
      key,
      descripcion: last?.descripcion ?? key,
      codigo: [...asc].reverse().find((l) => l.codigo)?.codigo ?? null,
      unidad: [...asc].reverse().find((l) => l.unidad)?.unidad ?? null,
      proveedores: [...new Set(asc.map((l) => l.proveedor).filter(Boolean) as string[])],
      compras: asc.length,
      cantidadTotal: asc.reduce((s, l) => s + (l.cantidad ?? 0), 0),
      primerPrecio,
      ultimoPrecio,
      minPrecio: Math.min(...precios),
      maxPrecio: Math.max(...precios),
      variacionPct: primerPrecio > 0 ? ((ultimoPrecio - primerPrecio) / primerPrecio) * 100 : 0,
      ultimaFecha: last?.fecha ?? '',
      lines: asc,
    })
  }
  return out
}

export function ComprasPreciosDashboard() {
  const [{ from, to }, setRange] = useState(isoWeekAgo)
  const [groupBy, setGroupBy] = useState<'item' | 'proveedor'>('item')
  const [search, setSearch] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['compras-precios', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/informes/compras/precios?desde=${from}&hasta=${to}`)
      if (!res.ok) throw new Error('Error cargando precios de compra')
      return res.json() as Promise<{ lines: Line[]; capped: boolean }>
    },
    staleTime: 60_000,
  })

  const lines = data?.lines ?? []
  const items = useMemo(() => aggregateItems(lines), [lines])

  const q = search.trim().toLowerCase()
  const matchItem = (it: ItemAgg) =>
    !q ||
    it.descripcion.toLowerCase().includes(q) ||
    (it.codigo ?? '').toLowerCase().includes(q) ||
    it.proveedores.some((p) => p.toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ComprasDateRange from={from} to={to} onChange={setRange} />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar item o proveedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-slate-200 rounded-md pl-8 pr-7 py-1.5 text-sm bg-white w-48 sm:w-60"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="inline-flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => { setGroupBy('item'); setExpandedKey(null) }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition ${
                groupBy === 'item' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              <Package className="h-3.5 w-3.5" /> Por item
            </button>
            <button
              onClick={() => { setGroupBy('proveedor'); setExpandedKey(null) }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition ${
                groupBy === 'proveedor' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              <Truck className="h-3.5 w-3.5" /> Por proveedor
            </button>
          </div>
        </div>
      </div>

      {data?.capped && (
        <p className="text-xs text-amber-600">
          Mostrando los primeros resultados del rango (acotá las fechas para ver todo).
        </p>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <Package className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Sin compras en este rango</p>
        </div>
      ) : groupBy === 'item' ? (
        <ItemsTable
          items={items.filter(matchItem)}
          expandedKey={expandedKey}
          onToggle={(k) => setExpandedKey(expandedKey === k ? null : k)}
        />
      ) : (
        <ProveedoresTable
          items={items}
          search={q}
          expandedKey={expandedKey}
          onToggle={(k) => setExpandedKey(expandedKey === k ? null : k)}
        />
      )}
    </div>
  )
}

type ItemSortKey = 'descripcion' | 'ultimoPrecio' | 'variacionPct' | 'cantidadTotal' | 'ultimaFecha' | 'compras'

function ItemsTable({
  items,
  expandedKey,
  onToggle,
}: {
  items: ItemAgg[]
  expandedKey: string | null
  onToggle: (k: string) => void
}) {
  const getValue = (it: ItemAgg, k: ItemSortKey): number | string => {
    switch (k) {
      case 'descripcion': return it.descripcion
      case 'ultimoPrecio': return it.ultimoPrecio
      case 'variacionPct': return it.variacionPct
      case 'cantidadTotal': return it.cantidadTotal
      case 'ultimaFecha': return it.ultimaFecha
      case 'compras': return it.compras
    }
  }
  const { sorted, sort, toggle } = useSort<ItemAgg, ItemSortKey>(items, getValue, {
    key: 'ultimaFecha',
    dir: 'desc',
  })

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
            <SortTh label="Item" k="descripcion" sort={sort} onToggle={toggle} />
            <SortTh label="Últ. precio" k="ultimoPrecio" sort={sort} onToggle={toggle} align="right" />
            <SortTh label="Variación" k="variacionPct" sort={sort} onToggle={toggle} align="right" />
            <SortTh label="Cant." k="cantidadTotal" sort={sort} onToggle={toggle} align="right" />
            <SortTh label="Últ. compra" k="ultimaFecha" sort={sort} onToggle={toggle} align="right" />
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((it, idx) => {
            const expanded = it.key === expandedKey
            return (
              <ItemRow key={it.key} idx={idx} it={it} expanded={expanded} onToggle={() => onToggle(it.key)} />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ItemRow({ idx, it, expanded, onToggle }: { idx: number; it: ItemAgg; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
        <td className="px-4 py-2.5">
          <div className="text-slate-700">{it.descripcion}</div>
          <div className="text-[11px] text-slate-400">
            {it.codigo ? `${it.codigo} · ` : ''}{it.proveedores.length === 1 ? it.proveedores[0] : `${it.proveedores.length} prov.`}
            {it.unidad ? ` · ${it.unidad}` : ''}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right font-medium text-slate-800 whitespace-nowrap">{fmtAR(it.ultimoPrecio)}</td>
        <td className="px-4 py-2.5 text-right"><VarBadge pct={it.variacionPct} single={it.compras < 2} /></td>
        <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(it.cantidadTotal)}</td>
        <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{it.ultimaFecha ? fmtFecha(it.ultimaFecha) : '—'}</td>
        <td className="px-4 py-2.5 text-slate-400">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={7} className="p-0"><ItemDetail it={it} /></td>
        </tr>
      )}
    </>
  )
}

function ItemDetail({ it }: { it: ItemAgg }) {
  // Serie de precio por fecha (promedio si hubo varias compras el mismo día).
  const serie = useMemo(() => {
    const byDate = new Map<string, { sum: number; n: number }>()
    for (const l of it.lines) {
      if (!l.fecha || l.precioUnitario == null) continue
      const cur = byDate.get(l.fecha) ?? { sum: 0, n: 0 }
      cur.sum += l.precioUnitario
      cur.n += 1
      byDate.set(l.fecha, cur)
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, v]) => ({ fecha, precio: v.sum / v.n }))
  }, [it])

  const rows = [...it.lines].reverse() // más reciente primero

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
        <span>Mín: <b className="text-slate-700">{fmtAR(it.minPrecio)}</b></span>
        <span>Máx: <b className="text-slate-700">{fmtAR(it.maxPrecio)}</b></span>
        <span>Compras: <b className="text-slate-700">{fmtNumAR(it.compras)}</b></span>
        <span>Proveedores: <b className="text-slate-700">{it.proveedores.join(', ') || '—'}</b></span>
      </div>

      {serie.length > 1 && (
        <div className="bg-white rounded border border-slate-200 p-3" style={{ height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={serie} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
              <XAxis dataKey="fecha" tickFormatter={fmtFechaShort} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmtAR(v)} tick={{ fontSize: 11 }} width={72} />
              <Tooltip labelFormatter={(l) => fmtFecha(String(l))} formatter={((v: number) => [fmtAR(v), 'Precio unit.']) as never} />
              <Line type="monotone" dataKey="precio" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[420px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Fecha</th>
              <th className="text-left px-3 py-2 font-medium">Proveedor</th>
              <th className="text-right px-3 py-2 font-medium">Cantidad</th>
              <th className="text-right px-3 py-2 font-medium">Precio unit.</th>
              <th className="text-right px-3 py-2 font-medium">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l, i) => {
              // Δ contra la compra anterior (cronológica) del mismo item.
              const prev = rows[i + 1]
              const delta = prev && prev.precioUnitario ? (l.precioUnitario! - prev.precioUnitario) / prev.precioUnitario * 100 : null
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{l.fecha ? fmtFecha(l.fecha) : '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600">{l.proveedor ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right text-slate-600">{fmtNumAR(l.cantidad ?? 0)}{l.unidad ? ` ${l.unidad}` : ''}</td>
                  <td className="px-3 py-1.5 text-right font-medium text-slate-800">{fmtAR(l.precioUnitario)}</td>
                  <td className="px-3 py-1.5 text-right">{delta == null ? <span className="text-slate-300">—</span> : <VarBadge pct={delta} />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type ProvSortKey = 'proveedor' | 'itemsDistintos' | 'compras' | 'ultimaFecha'
interface ProvAgg { key: string; proveedor: string; items: ItemAgg[]; compras: number; ultimaFecha: string }

function ProveedoresTable({
  items,
  search,
  expandedKey,
  onToggle,
}: {
  items: ItemAgg[]
  search: string
  expandedKey: string | null
  onToggle: (k: string) => void
}) {
  const provs = useMemo(() => {
    // Reconstruir agregados por proveedor a partir de las líneas de cada item.
    const map = new Map<string, Line[]>()
    for (const it of items) {
      for (const l of it.lines) {
        const k = l.proveedor ?? '—'
        const arr = map.get(k)
        if (arr) arr.push(l)
        else map.set(k, [l])
      }
    }
    const out: ProvAgg[] = []
    for (const [proveedor, ls] of map) {
      const its = aggregateItems(ls)
      out.push({
        key: proveedor,
        proveedor,
        items: its,
        compras: ls.length,
        ultimaFecha: ls.reduce((mx, l) => ((l.fecha ?? '') > mx ? l.fecha ?? '' : mx), ''),
      })
    }
    return out
  }, [items])

  const filtered = search
    ? provs.filter((p) => p.proveedor.toLowerCase().includes(search) || p.items.some((i) => i.descripcion.toLowerCase().includes(search)))
    : provs

  const getValue = (p: ProvAgg, k: ProvSortKey): number | string => {
    switch (k) {
      case 'proveedor': return p.proveedor
      case 'itemsDistintos': return p.items.length
      case 'compras': return p.compras
      case 'ultimaFecha': return p.ultimaFecha
    }
  }
  const { sorted, sort, toggle } = useSort<ProvAgg, ProvSortKey>(filtered, getValue, { key: 'ultimaFecha', dir: 'desc' })

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[520px]">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
            <SortTh label="Proveedor" k="proveedor" sort={sort} onToggle={toggle} />
            <SortTh label="Items" k="itemsDistintos" sort={sort} onToggle={toggle} align="right" />
            <SortTh label="Compras" k="compras" sort={sort} onToggle={toggle} align="right" />
            <SortTh label="Últ. compra" k="ultimaFecha" sort={sort} onToggle={toggle} align="right" />
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, idx) => {
            const expanded = p.key === expandedKey
            return (
              <Fragment key={p.key}>
                <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onToggle(p.key)}>
                  <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
                  <td className="px-4 py-2.5 text-slate-700">{p.proveedor}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(p.items.length)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(p.compras)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{p.ultimaFecha ? fmtFecha(p.ultimaFecha) : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</td>
                </tr>
                {expanded && (
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td colSpan={6} className="p-0">
                      <div className="p-3 sm:p-4">
                        <ProvItems items={p.items} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProvItems({ items }: { items: ItemAgg[] }) {
  const sorted = [...items].sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha))
  return (
    <div className="bg-white rounded border border-slate-200 overflow-x-auto">
      <table className="w-full text-xs min-w-[420px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Item</th>
            <th className="text-right px-3 py-2 font-medium">Últ. precio</th>
            <th className="text-right px-3 py-2 font-medium">Variación</th>
            <th className="text-right px-3 py-2 font-medium">Cant.</th>
            <th className="text-right px-3 py-2 font-medium">Últ. compra</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((it) => (
            <tr key={it.key} className="border-t border-slate-100">
              <td className="px-3 py-1.5 text-slate-700">
                {it.descripcion}
                {it.codigo ? <span className="text-slate-400"> · {it.codigo}</span> : ''}
              </td>
              <td className="px-3 py-1.5 text-right font-medium text-slate-800">{fmtAR(it.ultimoPrecio)}</td>
              <td className="px-3 py-1.5 text-right"><VarBadge pct={it.variacionPct} single={it.compras < 2} /></td>
              <td className="px-3 py-1.5 text-right text-slate-600">{fmtNumAR(it.cantidadTotal)}</td>
              <td className="px-3 py-1.5 text-right text-slate-500 whitespace-nowrap">{it.ultimaFecha ? fmtFecha(it.ultimaFecha) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Badge de variación de precio: sube = rojo (aumento), baja = verde. */
function VarBadge({ pct, single }: { pct: number; single?: boolean }) {
  if (single || Math.abs(pct) < 0.05) {
    return <span className="text-slate-400 text-xs">{single ? '—' : '0%'}</span>
  }
  const up = pct > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-red-600' : 'text-emerald-600'}`}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {fmtNumAR(Math.abs(pct), 1)}%
    </span>
  )
}

function ComprasDateRange({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const today = () => iso(new Date())
  const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000))
  const startOfMonth = () => { const d = new Date(); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))) }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white w-36" />
        <span className="text-slate-400 text-sm">→</span>
        <input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white w-36" />
      </div>
      <div className="flex gap-1 flex-wrap">
        <QuickBtn label="Semana" onClick={() => onChange({ from: daysAgo(6), to: today() })} />
        <QuickBtn label="14d" onClick={() => onChange({ from: daysAgo(13), to: today() })} />
        <QuickBtn label="30d" onClick={() => onChange({ from: daysAgo(29), to: today() })} />
        <QuickBtn label="Este mes" onClick={() => onChange({ from: startOfMonth(), to: today() })} />
      </div>
    </div>
  )
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="border border-slate-200 rounded-md px-2.5 py-1.5 text-sm bg-white text-slate-600 hover:bg-slate-50">
      {label}
    </button>
  )
}

function SortTh<K extends string>({ label, k, sort, onToggle, align }: { label: string; k: K; sort: { key: K; dir: SortDir }; onToggle: (k: K) => void; align?: 'right' | 'left' }) {
  const active = sort.key === k
  const cls = align === 'right' ? 'text-right' : 'text-left'
  return (
    <th className={`px-4 py-2.5 font-medium ${cls}`}>
      <button type="button" onClick={() => onToggle(k)} className={`inline-flex items-center gap-1 hover:text-slate-700 ${active ? 'text-slate-700' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <span>{label}</span>
        {active ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <span className="w-3" />}
      </button>
    </th>
  )
}
