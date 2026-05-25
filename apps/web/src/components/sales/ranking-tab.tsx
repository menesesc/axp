'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, fmtFechaShort, fmtFecha, fmtCompactAR, defaultRange, useSort, type SortDir } from './shared'
import { Package, Search, X, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface RankingItem {
  codigo?: string
  nombre?: string
  rubroCodigo: string | null
  rubroNombre: string | null
  unidades: number
  importe: number
  dias: number
  promedioDiario: number
  unidadesDia: number
}

type SortKey = 'idx' | 'nombre' | 'rubro' | 'unidades' | 'importe' | 'promedioDiario' | 'dias'

export function RankingTab() {
  const [{ from, to }, setRange] = useState(defaultRange())
  const [groupBy, setGroupBy] = useState<'item' | 'rubro'>('item')
  const [search, setSearch] = useState('')
  const [expandedCodigo, setExpandedCodigo] = useState<string | null>(null)

  const params = useMemo(() => {
    const p = new URLSearchParams({ from, to, groupBy, limit: '200' })
    return p.toString()
  }, [from, to, groupBy])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-ranking', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/ranking?${params}`)
      if (!res.ok) throw new Error('Error cargando ranking')
      return res.json() as Promise<{
        ranking: RankingItem[]
        groupBy: 'item' | 'rubro'
        total: { unidades: number; importe: number }
      }>
    },
    staleTime: 60_000,
  })

  const items = data?.ranking ?? []

  // Filtrar por búsqueda (case-insensitive sobre nombre y rubro)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const nombre = (groupBy === 'item' ? it.nombre : it.rubroNombre) ?? ''
      const rubro = it.rubroNombre ?? ''
      return nombre.toLowerCase().includes(q) || rubro.toLowerCase().includes(q)
    })
  }, [items, search, groupBy])

  const getValue = (it: RankingItem, k: SortKey): number | string => {
    switch (k) {
      case 'idx': return items.indexOf(it)
      case 'nombre': return (groupBy === 'item' ? it.nombre : it.rubroNombre) ?? ''
      case 'rubro': return it.rubroNombre ?? ''
      case 'unidades': return it.unidades
      case 'importe': return it.importe
      case 'promedioDiario': return it.promedioDiario
      case 'dias': return it.dias
    }
  }
  const { sorted, sort, toggle } = useSort<RankingItem, SortKey>(
    filtered,
    getValue,
    { key: 'importe', dir: 'desc' }
  )

  const maxImporte = sorted[0]?.importe ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DateRange from={from} to={to} onChange={setRange} />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar (ej. BIF)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-slate-200 rounded-md pl-8 pr-7 py-1.5 text-sm bg-white w-56"
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
              onClick={() => { setGroupBy('item'); setExpandedCodigo(null) }}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                groupBy === 'item' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Por producto
            </button>
            <button
              onClick={() => { setGroupBy('rubro'); setExpandedCodigo(null) }}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                groupBy === 'rubro' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Por rubro
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">
              {search ? `Sin resultados para "${search}"` : 'Sin datos en este rango'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium w-10">#</th>
                <SortTh label={groupBy === 'item' ? 'Producto' : 'Rubro'} k="nombre" sort={sort} onToggle={toggle} />
                {groupBy === 'item' && <SortTh label="Rubro" k="rubro" sort={sort} onToggle={toggle} />}
                <SortTh label="Unidades" k="unidades" sort={sort} onToggle={toggle} align="right" />
                <SortTh label="Importe" k="importe" sort={sort} onToggle={toggle} align="right" />
                <SortTh label="Días" k="dias" sort={sort} onToggle={toggle} align="right" />
                <SortTh label="Prom. diario" k="promedioDiario" sort={sort} onToggle={toggle} align="right" />
                <th className="px-4 py-2.5 w-40">Participación</th>
                {groupBy === 'item' && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((it, idx) => {
                const pct = maxImporte > 0 ? (it.importe / maxImporte) * 100 : 0
                const expanded = groupBy === 'item' && it.codigo === expandedCodigo
                return (
                  <RankingRow
                    key={`${it.codigo ?? ''}-${it.rubroCodigo ?? ''}-${idx}`}
                    idx={idx}
                    item={it}
                    groupBy={groupBy}
                    pct={pct}
                    expanded={expanded}
                    onToggle={
                      groupBy === 'item' && it.codigo
                        ? () => setExpandedCodigo(expanded ? null : it.codigo!)
                        : undefined
                    }
                    from={from}
                    to={to}
                  />
                )
              })}
              {data?.total && (
                <tr className="bg-slate-50 font-medium">
                  <td colSpan={groupBy === 'item' ? 3 : 2} className="px-4 py-2.5 text-slate-600 text-right">Total mostrado</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtNumAR(data.total.unidades)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">{fmtAR(data.total.importe)}</td>
                  <td />
                  <td />
                  <td />
                  {groupBy === 'item' && <td />}
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function RankingRow({
  idx,
  item,
  groupBy,
  pct,
  expanded,
  onToggle,
  from,
  to,
}: {
  idx: number
  item: RankingItem
  groupBy: 'item' | 'rubro'
  pct: number
  expanded: boolean
  onToggle: (() => void) | undefined
  from: string
  to: string
}) {
  return (
    <>
      <tr
        className={`border-b border-slate-100 ${onToggle ? 'hover:bg-slate-50 cursor-pointer' : ''}`}
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
        <td className="px-4 py-2.5 text-slate-700">
          {groupBy === 'item' ? item.nombre : item.rubroNombre}
        </td>
        {groupBy === 'item' && (
          <td className="px-4 py-2.5 text-slate-500 text-xs">{item.rubroNombre ?? '—'}</td>
        )}
        <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(item.unidades)}</td>
        <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtAR(item.importe)}</td>
        <td className="px-4 py-2.5 text-right text-slate-500">{fmtNumAR(item.dias)}</td>
        <td className="px-4 py-2.5 text-right text-slate-600">{fmtAR(item.promedioDiario)}</td>
        <td className="px-4 py-2.5">
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </td>
        {groupBy === 'item' && (
          <td className="px-4 py-2.5 text-slate-400">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </td>
        )}
      </tr>
      {expanded && item.codigo && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={9} className="p-0">
            <ProductDetail codigo={item.codigo} nombre={item.nombre} from={from} to={to} />
          </td>
        </tr>
      )}
    </>
  )
}

interface ProductSeriesPoint {
  fecha: string
  ALMUERZO_u: number
  ALMUERZO_i: number
  CENA_u: number
  CENA_i: number
  OTRO_u: number
  OTRO_i: number
  unidades: number
  importe: number
}

interface ProductDetailData {
  codigo: string
  nombre: string | null
  rubroNombre: string | null
  series: ProductSeriesPoint[]
  totals: { unidades: number; importe: number }
  porTurno: {
    ALMUERZO: { unidades: number; importe: number }
    CENA: { unidades: number; importe: number }
    OTRO: { unidades: number; importe: number }
  }
}

function ProductDetail({
  codigo,
  nombre,
  from,
  to,
}: {
  codigo: string
  nombre: string | undefined
  from: string
  to: string
}) {
  const [byShift, setByShift] = useState(true)
  const [metric, setMetric] = useState<'unidades' | 'importe'>('unidades')

  const { data, isLoading } = useQuery({
    queryKey: ['sales-ranking-product', codigo, from, to],
    queryFn: async () => {
      const sp = new URLSearchParams({ codigo, from, to })
      const res = await fetch(`/api/sales/ranking/product?${sp.toString()}`)
      if (!res.ok) throw new Error('Error cargando detalle')
      return res.json() as Promise<ProductDetailData>
    },
    staleTime: 60_000,
  })

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Cargando movimiento diario...</div>
  if (!data || data.series.length === 0) {
    return <div className="p-6 text-sm text-slate-400">Sin movimiento en el rango</div>
  }

  const fmtVal = (v: number) => (metric === 'importe' ? fmtAR(v) : fmtNumAR(v))
  const showOtro = data.porTurno.OTRO.unidades > 0

  // dataKeys según métrica
  const suf = metric === 'unidades' ? '_u' : '_i'

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">{data.rubroNombre ?? 'Producto'}</p>
          <h4 className="text-sm font-medium text-slate-800">{nombre ?? data.nombre ?? codigo}</h4>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setMetric('unidades')}
              className={`px-2.5 py-1 text-xs rounded-md ${
                metric === 'unidades' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
              }`}
            >
              Unidades
            </button>
            <button
              onClick={() => setMetric('importe')}
              className={`px-2.5 py-1 text-xs rounded-md ${
                metric === 'importe' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
              }`}
            >
              Importe
            </button>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={byShift}
              onChange={(e) => setByShift(e.target.checked)}
              className="rounded border-slate-300"
            />
            Desglosar por turno
          </label>
        </div>
      </div>

      {/* Mini KPIs por turno */}
      <div className="grid grid-cols-3 gap-3">
        <MiniKPI label="Total" unidades={data.totals.unidades} importe={data.totals.importe} />
        <MiniKPI label="Almuerzo" unidades={data.porTurno.ALMUERZO.unidades} importe={data.porTurno.ALMUERZO.importe} color="amber" />
        <MiniKPI label="Cena" unidades={data.porTurno.CENA.unidades} importe={data.porTurno.CENA.importe} color="indigo" />
      </div>

      {/* Gráfico de barras diario */}
      <div className="bg-white rounded border border-slate-200 p-3" style={{ height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data.series} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
            <XAxis dataKey="fecha" tickFormatter={fmtFechaShort} tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={metric === 'importe' ? fmtCompactAR : (v) => fmtNumAR(v)}
              tick={{ fontSize: 11 }}
              width={56}
              allowDecimals={false}
            />
            <Tooltip
              labelFormatter={(l) => fmtFecha(String(l))}
              formatter={((v: number, name: string) => [fmtVal(v), name]) as never}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {byShift ? (
              <>
                <Bar dataKey={`ALMUERZO${suf}`} stackId="t" name="Almuerzo" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey={`CENA${suf}`} stackId="t" name="Cena" fill="#6366f1" radius={[2, 2, 0, 0]} />
                {showOtro && (
                  <Bar dataKey={`OTRO${suf}`} stackId="t" name="Otro" fill="#94a3b8" radius={[0, 0, 0, 0]} />
                )}
              </>
            ) : (
              <Bar dataKey={metric === 'importe' ? 'importe' : 'unidades'} name="Total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla diaria */}
      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Fecha</th>
              <th className="text-right px-3 py-2 font-medium">Almuerzo (u/$)</th>
              <th className="text-right px-3 py-2 font-medium">Cena (u/$)</th>
              <th className="text-right px-3 py-2 font-medium">Total unid.</th>
              <th className="text-right px-3 py-2 font-medium">Total $</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((s) => (
              <tr key={s.fecha} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-600">{fmtFecha(s.fecha)}</td>
                <td className="px-3 py-1.5 text-right text-amber-700">
                  {fmtNumAR(s.ALMUERZO_u)} <span className="text-slate-400">/</span> {fmtAR(s.ALMUERZO_i)}
                </td>
                <td className="px-3 py-1.5 text-right text-indigo-700">
                  {fmtNumAR(s.CENA_u)} <span className="text-slate-400">/</span> {fmtAR(s.CENA_i)}
                </td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-700">{fmtNumAR(s.unidades)}</td>
                <td className="px-3 py-1.5 text-right font-medium text-slate-800">{fmtAR(s.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MiniKPI({
  label,
  unidades,
  importe,
  color,
}: {
  label: string
  unidades: number
  importe: number
  color?: 'amber' | 'indigo'
}) {
  const colorMap = {
    amber: 'border-amber-200 bg-amber-50',
    indigo: 'border-indigo-200 bg-indigo-50',
  }
  const cls = color ? colorMap[color] : 'border-slate-200 bg-white'
  return (
    <div className={`rounded border ${cls} px-3 py-2`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-base font-semibold text-slate-800">{fmtNumAR(unidades)}</span>
        <span className="text-xs text-slate-500">u · {fmtAR(importe)}</span>
      </div>
    </div>
  )
}

function SortTh<K extends string>({
  label,
  k,
  sort,
  onToggle,
  align,
}: {
  label: string
  k: K
  sort: { key: K; dir: SortDir }
  onToggle: (k: K) => void
  align?: 'right' | 'left'
}) {
  const active = sort.key === k
  const cls = align === 'right' ? 'text-right' : 'text-left'
  return (
    <th className={`px-4 py-2.5 font-medium ${cls}`}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 ${
          active ? 'text-slate-700' : ''
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        <span>{label}</span>
        {active ? (
          sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <span className="w-3" />
        )}
      </button>
    </th>
  )
}
