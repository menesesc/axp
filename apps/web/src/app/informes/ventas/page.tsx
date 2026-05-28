'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { DateRange } from '@/components/sales/date-range'
import { fmtAR, fmtNumAR, fmtFecha } from '@/components/sales/shared'
import { Input } from '@/components/ui/input'
import { Search, X, Package, Sun, Moon, ChevronDown, ChevronUp, Calendar, SlidersHorizontal } from 'lucide-react'
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

type Frec = 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'CUSTOM'

interface RubroItem {
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

interface RubroBlock {
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

interface ApiResponse {
  rango: { from: string; to: string; dias: number }
  totales: { unidades: number; importe: number; tickets: number; almuerzo: number; cena: number; otro: number }
  rubros: RubroBlock[]
}

function ayer(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function InformeVentasPage() {
  // useSearchParams requiere Suspense boundary en Next.js 14 para no romper
  // el prerender en build time.
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="p-12 text-center text-slate-400">Cargando...</div>
        </DashboardLayout>
      }
    >
      <InformeVentasContent />
    </Suspense>
  )
}

function InformeVentasContent() {
  const sp = useSearchParams()
  const router = useRouter()

  const initialFrom = sp.get('from') || ayer()
  const initialTo = sp.get('to') || ayer()
  const initialFrec = (sp.get('frec') as Frec | null) || 'DIARIA'
  const initialSucursal = sp.get('sucursal') || ''

  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [frec, setFrec] = useState<Frec>(initialFrec)
  const [sucursal, setSucursal] = useState(initialSucursal)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [expandedRubro, setExpandedRubro] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Toggles de columnas. Persistimos en localStorage para que el usuario no
  // tenga que reactivar lo suyo cada vez que abre el informe desde el mail.
  const [showTurnos, setShowTurnos] = useState(true)
  const [showUnidades, setShowUnidades] = useState(true)
  const [showPctRubro, setShowPctRubro] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('informe-ventas:cols')
      if (raw) {
        const cfg = JSON.parse(raw) as { turnos?: boolean; unidades?: boolean; pct?: boolean }
        if (typeof cfg.turnos === 'boolean') setShowTurnos(cfg.turnos)
        if (typeof cfg.unidades === 'boolean') setShowUnidades(cfg.unidades)
        if (typeof cfg.pct === 'boolean') setShowPctRubro(cfg.pct)
      }
    } catch { /* localStorage puede fallar en modo privado */ }
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('informe-ventas:cols', JSON.stringify({
        turnos: showTurnos, unidades: showUnidades, pct: showPctRubro,
      }))
    } catch { /* ignore */ }
  }, [showTurnos, showUnidades, showPctRubro])

  // Debounce de búsqueda (client-side: el filtro corre tanto en el server
  // como localmente para resaltar; mandamos al server para sumar bien
  // los itemsRestantes).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Mantener URL sincronizada para que se pueda compartir / refrescar.
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('from', from)
    url.searchParams.set('to', to)
    url.searchParams.set('frec', frec)
    if (sucursal) url.searchParams.set('sucursal', sucursal)
    else url.searchParams.delete('sucursal')
    router.replace(url.pathname + '?' + url.searchParams.toString(), { scroll: false })
  }, [from, to, frec, sucursal, router])

  const params = useMemo(() => {
    const p = new URLSearchParams({ from, to, topN: '200' })
    if (sucursal) p.set('sucursal', sucursal)
    if (debouncedSearch) p.set('search', debouncedSearch)
    return p.toString()
  }, [from, to, sucursal, debouncedSearch])

  const { data, isLoading } = useQuery<ApiResponse>({
    queryKey: ['informe-ventas-by-rubro', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/ranking/by-rubro?${params}`)
      if (!res.ok) throw new Error('Error cargando informe')
      return res.json()
    },
  })

  const isMultiDay = from !== to

  // Atajos de frecuencia: ajustan from/to.
  function applyFrec(f: Frec) {
    const now = new Date()
    if (f === 'DIARIA') {
      const a = ayer()
      setFrom(a)
      setTo(a)
    } else if (f === 'SEMANAL') {
      // Semana anterior cerrada lun-dom.
      const dow = now.getDay() === 0 ? 7 : now.getDay()
      const ultimoDom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
      const primerLun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - 6)
      setFrom(toISO(primerLun))
      setTo(toISO(ultimoDom))
    } else if (f === 'MENSUAL') {
      const primerEsteMes = new Date(now.getFullYear(), now.getMonth(), 1)
      const ultimoMesAnt = new Date(primerEsteMes.getTime() - 24 * 60 * 60 * 1000)
      const primerMesAnt = new Date(ultimoMesAnt.getFullYear(), ultimoMesAnt.getMonth(), 1)
      setFrom(toISO(primerMesAnt))
      setTo(toISO(ultimoMesAnt))
    }
    setFrec(f)
  }

  function highlight(text: string, q: string) {
    if (!q) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-slate-900 px-0.5 rounded">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <Header
          title="Informe de ventas"
          description={
            data
              ? `${fmtFecha(data.rango.from)}${data.rango.from !== data.rango.to ? ` al ${fmtFecha(data.rango.to)}` : ''} · ${data.rango.dias} día${data.rango.dias === 1 ? '' : 's'} con cierres`
              : 'Cargando...'
          }
        />

        {/* Filtros — en mobile arrancan colapsados detrás del botón "Filtros".
            En md+ siempre visibles. La búsqueda queda afuera del colapsable
            porque es la acción más usada cuando entrás desde el mail. */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <span className="text-xs text-slate-500 truncate">
              {frec === 'DIARIA' ? 'Diario' : frec === 'SEMANAL' ? 'Semanal' : frec === 'MENSUAL' ? 'Mensual' : 'Personalizado'}
              {sucursal && ` · ${sucursal}`}
            </span>
          </div>
          <div className={`${filtersOpen ? 'block' : 'hidden'} md:block`}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex bg-slate-100 rounded-md p-0.5">
                {(['DIARIA', 'SEMANAL', 'MENSUAL'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => applyFrec(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded ${
                      frec === f ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                    }`}
                  >
                    {f === 'DIARIA' ? 'Diario' : f === 'SEMANAL' ? 'Semanal' : 'Mensual'}
                  </button>
                ))}
                <button
                  onClick={() => setFrec('CUSTOM')}
                  className={`px-3 py-1.5 text-xs font-medium rounded ${
                    frec === 'CUSTOM' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                  }`}
                >
                  Personalizado
                </button>
              </div>
              <DateRange
                from={from}
                to={to}
                onChange={(r) => {
                  setFrom(r.from)
                  setTo(r.to)
                  setFrec('CUSTOM')
                }}
              />
              <Input
                placeholder="Sucursal (vacío = todas)"
                value={sucursal}
                onChange={(e) => setSucursal(e.target.value)}
                className="w-44 h-9 text-sm"
              />
            </div>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder='Buscar producto o rubro... (ej. "BIF")'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 h-9 text-sm"
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
        </div>

        {/* KPIs — 2 cols en mobile (4 mas grandes priorizadas) */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
            <KPI label="Ventas totales" value={fmtAR(data.totales.importe)} accent />
            <KPI label="Tickets" value={fmtNumAR(data.totales.tickets)} />
            <KPI
              label="Mediodía"
              value={fmtAR(data.totales.almuerzo)}
              icon={<Sun className="h-4 w-4 text-amber-500" />}
            />
            <KPI
              label="Noche"
              value={fmtAR(data.totales.cena)}
              icon={<Moon className="h-4 w-4 text-indigo-500" />}
            />
            <KPI
              label="Días"
              value={fmtNumAR(data.rango.dias)}
              icon={<Calendar className="h-4 w-4 text-slate-400" />}
            />
          </div>
        )}

        {/* Gráfico por día (solo si rango > 1 día) */}
        {data && isMultiDay && <DiarioChart from={from} to={to} sucursal={sucursal || null} />}

        {/* Toggles de columnas — solo afectan render, no la query. */}
        {data && data.rubros.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
            <span className="text-slate-400">Mostrar:</span>
            <ColToggle active={showTurnos} onClick={() => setShowTurnos((v) => !v)}>Por turno</ColToggle>
            <ColToggle active={showUnidades} onClick={() => setShowUnidades((v) => !v)}>Cantidades</ColToggle>
            <ColToggle active={showPctRubro} onClick={() => setShowPctRubro((v) => !v)}>% rubro</ColToggle>
          </div>
        )}

        {/* Lista de rubros */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">Cargando...</div>
        ) : !data || data.rubros.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
            <Package className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">
              {debouncedSearch
                ? `Sin resultados para "${debouncedSearch}"`
                : 'Sin datos en este rango'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.rubros.map((rubro) => {
              const key = rubro.rubroCodigo ?? '__null__'
              const expanded = expandedRubro === key
              return (
                <RubroCard
                  key={key}
                  rubro={rubro}
                  highlight={(t) => highlight(t, debouncedSearch)}
                  expanded={expanded}
                  onToggle={() => setExpandedRubro(expanded ? null : key)}
                  showTurnos={showTurnos}
                  showUnidades={showUnidades}
                  showPctRubro={showPctRubro}
                />
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

function KPI({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: string
  accent?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{label}</p>
        {icon}
      </div>
      <p className={`text-lg font-semibold mt-1 tabular-nums ${accent ? 'text-indigo-700' : 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  )
}

function ColToggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

function RubroCard({
  rubro,
  highlight,
  expanded,
  onToggle,
  showTurnos,
  showUnidades,
  showPctRubro,
}: {
  rubro: RubroBlock
  highlight: (s: string) => React.ReactNode
  expanded: boolean
  onToggle: () => void
  showTurnos: boolean
  showUnidades: boolean
  showPctRubro: boolean
}) {
  // Formato de celda M/N: dependiendo de qué quiere ver el usuario.
  // - showUnidades + importes (default): "12u · $1.234"
  // - solo unidades: "12u"
  // - solo importes: "$1.234"
  function turnoCell(u: number, i: number): string {
    if (u === 0) return '—'
    if (showUnidades) return `${fmtNumAR(u)}u · ${fmtAR(i)}`
    return fmtAR(i)
  }
  const colCount = 2 + (showTurnos ? 2 : 0) + (showUnidades ? 1 : 0) + (showPctRubro ? 1 : 0)
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Package className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 truncate">
              {highlight(rubro.rubroNombre ?? '(Sin rubro)')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {fmtAR(rubro.totales.importe)} · {fmtNumAR(rubro.totales.unidades)} unidades · {rubro.items.length} productos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-xs text-slate-500 hidden md:flex items-center gap-3">
            <span className="text-amber-700">{fmtAR(rubro.totales.almuerzo_i)}</span>
            <span className="text-indigo-700">{fmtAR(rubro.totales.cena_i)}</span>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-200">
          {/* Tabla en md+ */}
          <table className="w-full text-sm hidden md:table">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Producto</th>
                {showTurnos && (
                  <th className="text-right px-4 py-2 font-medium text-amber-700">
                    Mediodía{showUnidades ? ' (u · $)' : ''}
                  </th>
                )}
                {showTurnos && (
                  <th className="text-right px-4 py-2 font-medium text-indigo-700">
                    Noche{showUnidades ? ' (u · $)' : ''}
                  </th>
                )}
                {showUnidades && <th className="text-right px-4 py-2 font-medium">Total unid.</th>}
                <th className="text-right px-4 py-2 font-medium">Total $</th>
                {showPctRubro && <th className="text-right px-4 py-2 font-medium w-20">% rubro</th>}
              </tr>
            </thead>
            <tbody>
              {rubro.items.map((it) => (
                <tr key={`${it.codigo}|${it.nombre}`} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-700">
                    {highlight(it.nombre)}
                    {it.codigo !== '****' && (
                      <span className="text-xs text-slate-400 ml-1.5">({it.codigo})</span>
                    )}
                  </td>
                  {showTurnos && (
                    <td className="px-4 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">
                      {turnoCell(it.almuerzo_u, it.almuerzo_i)}
                    </td>
                  )}
                  {showTurnos && (
                    <td className="px-4 py-2 text-right text-indigo-700 tabular-nums whitespace-nowrap">
                      {turnoCell(it.cena_u, it.cena_i)}
                    </td>
                  )}
                  {showUnidades && (
                    <td className="px-4 py-2 text-right text-slate-700 tabular-nums">
                      {fmtNumAR(it.unidades)}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right font-semibold text-slate-800 tabular-nums">
                    {fmtAR(it.importe)}
                  </td>
                  {showPctRubro && (
                    <td className="px-4 py-2 text-right text-slate-500 tabular-nums">
                      {(it.participacionRubro * 100).toFixed(1)}%
                    </td>
                  )}
                </tr>
              ))}
              {rubro.itemsRestantes > 0 && (
                <tr className="border-t border-slate-100 bg-slate-50">
                  <td colSpan={colCount} className="px-4 py-2 text-xs text-slate-500 italic text-center">
                    + {rubro.itemsRestantes} producto{rubro.itemsRestantes === 1 ? '' : 's'} más por debajo del top 200
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Cards apiladas en mobile */}
          <div className="md:hidden divide-y divide-slate-100">
            {rubro.items.map((it) => (
              <div key={`${it.codigo}|${it.nombre}`} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm text-slate-800 font-medium flex-1 min-w-0">
                    {highlight(it.nombre)}
                    {it.codigo !== '****' && (
                      <span className="text-xs text-slate-400 ml-1.5">({it.codigo})</span>
                    )}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                    {fmtAR(it.importe)}
                  </p>
                </div>
                {showTurnos && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-amber-50 px-2 py-1 text-amber-800">
                      <span className="text-[10px] uppercase tracking-wide text-amber-700/70">Mediodía</span>
                      <div className="tabular-nums">{turnoCell(it.almuerzo_u, it.almuerzo_i)}</div>
                    </div>
                    <div className="rounded bg-indigo-50 px-2 py-1 text-indigo-800">
                      <span className="text-[10px] uppercase tracking-wide text-indigo-700/70">Noche</span>
                      <div className="tabular-nums">{turnoCell(it.cena_u, it.cena_i)}</div>
                    </div>
                  </div>
                )}
                {(showUnidades || showPctRubro) && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                    {showUnidades ? <span>{fmtNumAR(it.unidades)} unid.</span> : <span />}
                    {showPctRubro ? <span>{(it.participacionRubro * 100).toFixed(1)}% del rubro</span> : <span />}
                  </div>
                )}
              </div>
            ))}
            {rubro.itemsRestantes > 0 && (
              <div className="px-4 py-2 text-xs text-slate-500 italic text-center bg-slate-50">
                + {rubro.itemsRestantes} producto{rubro.itemsRestantes === 1 ? '' : 's'} más
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Series diarias separadas por turno para el gráfico (rango > 1 día).
function DiarioChart({
  from,
  to,
  sucursal,
}: {
  from: string
  to: string
  sucursal: string | null
}) {
  const params = useMemo(() => {
    const p = new URLSearchParams({ from, to })
    if (sucursal) p.set('sucursal', sucursal)
    return p.toString()
  }, [from, to, sucursal])

  const { data, isLoading } = useQuery<{
    series: Array<{ fecha: string; almuerzo: number; cena: number; total: number; tickets: number }>
  }>({
    queryKey: ['informe-by-shift', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/by-shift?${params}`)
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
  })

  if (isLoading || !data || data.series.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-700 mb-3">Ventas por día y turno</h3>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={data.series}>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
            <XAxis dataKey="fecha" tickFormatter={(s) => fmtFecha(s).slice(0, 5)} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={56} />
            <Tooltip
              labelFormatter={(l) => fmtFecha(String(l))}
              formatter={((v: number, name: string) => [fmtAR(v), name]) as never}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="almuerzo" name="Mediodía" stackId="t" fill="#f59e0b" />
            <Bar dataKey="cena" name="Noche" stackId="t" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function toISO(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0')
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}
