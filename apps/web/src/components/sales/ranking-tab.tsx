'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, fmtFechaShort, fmtFecha, fmtCompactAR, defaultRange, groupByWeekday, useSort, type SortDir } from './shared'
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

type SortKey = 'idx' | 'nombre' | 'rubro' | 'unidades' | 'importe' | 'promedioDiario' | 'unidadesDia' | 'dias'

export function RankingTab() {
  const [{ from, to }, setRange] = useState(defaultRange())
  const [groupBy, setGroupBy] = useState<'item' | 'rubro'>('item')
  const [search, setSearch] = useState('')
  // Clave compuesta codigo|nombre porque "****" se reusa para varios productos.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

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
      case 'unidadesDia': return it.unidadesDia
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
              onClick={() => { setGroupBy('item'); setExpandedKey(null) }}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                groupBy === 'item' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Por producto
            </button>
            <button
              onClick={() => { setGroupBy('rubro'); setExpandedKey(null) }}
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
                <SortTh label="Unid./día" k="unidadesDia" sort={sort} onToggle={toggle} align="right" />
                <SortTh label="$/día" k="promedioDiario" sort={sort} onToggle={toggle} align="right" />
                <th className="px-4 py-2.5 w-40">Participación</th>
                {groupBy === 'item' && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((it, idx) => {
                const pct = maxImporte > 0 ? (it.importe / maxImporte) * 100 : 0
                const itemKey = `${it.codigo ?? ''}|${it.nombre ?? ''}`
                const expanded = groupBy === 'item' && itemKey === expandedKey
                return (
                  <RankingRow
                    key={`${itemKey}-${it.rubroCodigo ?? ''}-${idx}`}
                    idx={idx}
                    item={it}
                    groupBy={groupBy}
                    pct={pct}
                    expanded={expanded}
                    onToggle={
                      groupBy === 'item' && it.codigo
                        ? () => setExpandedKey(expanded ? null : itemKey)
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
        <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(item.unidadesDia, 1)}</td>
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
          <td colSpan={10} className="p-0">
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
  const [view, setView] = useState<'fecha' | 'weekday'>('fecha')
  const [wdMetric, setWdMetric] = useState<'avg' | 'total'>('avg')

  const { data, isLoading } = useQuery({
    queryKey: ['sales-ranking-product', codigo, nombre, from, to],
    queryFn: async () => {
      const sp = new URLSearchParams({ codigo, from, to })
      // Cuando el código no es único (Maxirest imprime **** para ítems sin
      // código numérico), enviamos el nombre para desambiguar.
      if (codigo === '****' && nombre) sp.append('nombre', nombre)
      const res = await fetch(`/api/sales/ranking/product?${sp.toString()}`)
      if (!res.ok) throw new Error('Error cargando detalle')
      return res.json() as Promise<ProductDetailData>
    },
    staleTime: 60_000,
  })

  const weekdayData = useMemo(() => {
    if (!data) return []
    const grouped = groupByWeekday(data.series, [
      'ALMUERZO_u', 'ALMUERZO_i', 'CENA_u', 'CENA_i', 'OTRO_u', 'OTRO_i', 'unidades', 'importe',
    ])
    return grouped.map((g) => {
      const divisor = wdMetric === 'avg' && g.count > 0 ? g.count : 1
      return {
        short: g.short,
        label: g.label,
        count: g.count,
        ALMUERZO_u: g.ALMUERZO_u / divisor,
        ALMUERZO_i: g.ALMUERZO_i / divisor,
        CENA_u: g.CENA_u / divisor,
        CENA_i: g.CENA_i / divisor,
        OTRO_u: g.OTRO_u / divisor,
        OTRO_i: g.OTRO_i / divisor,
        unidades: g.unidades / divisor,
        importe: g.importe / divisor,
      }
    })
  }, [data, wdMetric])

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Cargando movimiento diario...</div>
  if (!data || data.series.length === 0) {
    return <div className="p-6 text-sm text-slate-400">Sin movimiento en el rango</div>
  }

  const fmtVal = (v: number) =>
    metric === 'importe'
      ? fmtAR(v)
      : fmtNumAR(v, view === 'weekday' && wdMetric === 'avg' ? 1 : 0)
  const showOtro = data.porTurno.OTRO.unidades > 0
  const suf = metric === 'unidades' ? '_u' : '_i'

  // Promedios por turno: total / cantidad de días en los que apareció el producto en ese turno.
  const diasPorTurno = data.series.reduce(
    (acc, s) => ({
      ALMUERZO: acc.ALMUERZO + (s.ALMUERZO_u > 0 ? 1 : 0),
      CENA: acc.CENA + (s.CENA_u > 0 ? 1 : 0),
    }),
    { ALMUERZO: 0, CENA: 0 }
  )
  const promAlmuerzoU = diasPorTurno.ALMUERZO > 0 ? data.porTurno.ALMUERZO.unidades / diasPorTurno.ALMUERZO : 0
  const promCenaU = diasPorTurno.CENA > 0 ? data.porTurno.CENA.unidades / diasPorTurno.CENA : 0
  const promAlmuerzoI = diasPorTurno.ALMUERZO > 0 ? data.porTurno.ALMUERZO.importe / diasPorTurno.ALMUERZO : 0
  const promCenaI = diasPorTurno.CENA > 0 ? data.porTurno.CENA.importe / diasPorTurno.CENA : 0
  const totalDias = data.series.length
  const promTotalU = totalDias > 0 ? data.totals.unidades / totalDias : 0
  const promTotalI = totalDias > 0 ? data.totals.importe / totalDias : 0

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">{data.rubroNombre ?? 'Producto'}</p>
          <h4 className="text-sm font-medium text-slate-800">{nombre ?? data.nombre ?? codigo}</h4>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setView('fecha')}
              className={`px-2.5 py-1 text-xs rounded-md ${
                view === 'fecha' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
              }`}
            >
              Por fecha
            </button>
            <button
              onClick={() => setView('weekday')}
              className={`px-2.5 py-1 text-xs rounded-md ${
                view === 'weekday' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
              }`}
            >
              Por día de semana
            </button>
          </div>
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
          {view === 'weekday' ? (
            <div className="inline-flex bg-white border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => setWdMetric('avg')}
                className={`px-2.5 py-1 text-xs rounded-md ${
                  wdMetric === 'avg' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
                }`}
              >
                Promedio
              </button>
              <button
                onClick={() => setWdMetric('total')}
                className={`px-2.5 py-1 text-xs rounded-md ${
                  wdMetric === 'total' ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
                }`}
              >
                Total
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={byShift}
                onChange={(e) => setByShift(e.target.checked)}
                className="rounded border-slate-300"
              />
              Desglosar por turno
            </label>
          )}
        </div>
      </div>

      {/* Mini KPIs por turno: total + promedio por día con ventas */}
      <div className="grid grid-cols-3 gap-3">
        <MiniKPI
          label="Total"
          unidades={data.totals.unidades}
          importe={data.totals.importe}
          promU={promTotalU}
          promI={promTotalI}
        />
        <MiniKPI
          label="Almuerzo"
          unidades={data.porTurno.ALMUERZO.unidades}
          importe={data.porTurno.ALMUERZO.importe}
          promU={promAlmuerzoU}
          promI={promAlmuerzoI}
          color="amber"
        />
        <MiniKPI
          label="Cena"
          unidades={data.porTurno.CENA.unidades}
          importe={data.porTurno.CENA.importe}
          promU={promCenaU}
          promI={promCenaI}
          color="indigo"
        />
      </div>

      {/* Gráfico de barras */}
      <div className="bg-white rounded border border-slate-200 p-3" style={{ height: 280 }}>
        <ResponsiveContainer>
          <BarChart
            data={view === 'fecha' ? data.series : weekdayData}
            margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
            {view === 'fecha' ? (
              <XAxis dataKey="fecha" tickFormatter={fmtFechaShort} tick={{ fontSize: 11 }} />
            ) : (
              <XAxis dataKey="short" tick={{ fontSize: 11 }} />
            )}
            <YAxis
              tickFormatter={metric === 'importe' ? fmtCompactAR : (v) => fmtNumAR(v)}
              tick={{ fontSize: 11 }}
              width={56}
              allowDecimals={view === 'weekday' && wdMetric === 'avg'}
            />
            <Tooltip
              labelFormatter={(l, payload) => {
                if (view === 'fecha') return fmtFecha(String(l))
                const p = payload?.[0]?.payload as { label?: string; count?: number } | undefined
                return p ? `${p.label} (${p.count ?? 0} cierres)` : String(l)
              }}
              formatter={((v: number, name: string) => [fmtVal(v), name]) as never}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {view === 'fecha' && !byShift ? (
              <Bar dataKey={metric === 'importe' ? 'importe' : 'unidades'} name="Total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            ) : (
              <>
                <Bar dataKey={`ALMUERZO${suf}`} stackId="t" name="Almuerzo" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey={`CENA${suf}`} stackId="t" name="Cena" fill="#6366f1" radius={[2, 2, 0, 0]} />
                {showOtro && (
                  <Bar dataKey={`OTRO${suf}`} stackId="t" name="Otro" fill="#94a3b8" radius={[0, 0, 0, 0]} />
                )}
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {view === 'weekday' && (
        <p className="text-xs text-slate-400 -mt-2">
          {wdMetric === 'avg'
            ? 'Promedio = total del día de la semana / cantidad de cierres del producto para ese día.'
            : 'Suma de ventas del producto para cada día de la semana en el rango seleccionado.'}
        </p>
      )}

      {/* Tabla */}
      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">
                {view === 'fecha' ? 'Fecha' : 'Día'}
              </th>
              <th className="text-right px-3 py-2 font-medium">Almuerzo (u/$)</th>
              <th className="text-right px-3 py-2 font-medium">Cena (u/$)</th>
              <th className="text-right px-3 py-2 font-medium">Total unid.</th>
              <th className="text-right px-3 py-2 font-medium">Total $</th>
            </tr>
          </thead>
          <tbody>
            {view === 'fecha'
              ? data.series.map((s) => (
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
                ))
              : weekdayData.map((w) => {
                  const dec = wdMetric === 'avg' ? 1 : 0
                  return (
                    <tr key={w.short} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-600">
                        {w.label}{' '}
                        <span className="text-slate-400">({w.count})</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-amber-700">
                        {fmtNumAR(w.ALMUERZO_u, dec)} <span className="text-slate-400">/</span> {fmtAR(w.ALMUERZO_i)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-indigo-700">
                        {fmtNumAR(w.CENA_u, dec)} <span className="text-slate-400">/</span> {fmtAR(w.CENA_i)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-700">{fmtNumAR(w.unidades, dec)}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-slate-800">{fmtAR(w.importe)}</td>
                    </tr>
                  )
                })}
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
  promU,
  promI,
  color,
}: {
  label: string
  unidades: number
  importe: number
  promU?: number
  promI?: number
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
      {(promU != null || promI != null) && (
        <p className="text-[10px] text-slate-500 mt-1">
          Prom. {promU != null ? `${fmtNumAR(promU, 1)} u` : ''}
          {promU != null && promI != null ? ' · ' : ''}
          {promI != null ? fmtAR(promI) : ''}
          <span className="text-slate-400"> /día</span>
        </p>
      )}
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
