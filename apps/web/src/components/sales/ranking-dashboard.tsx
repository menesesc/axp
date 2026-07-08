'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { ProductDetail } from './ranking-tab'
import { fmtNumAR, fmtRangeLabel, yesterdayRange } from './shared'
import { ChevronRight, ChevronLeft, Menu, Search, X, Package } from 'lucide-react'

interface RankingItem {
  codigo?: string
  nombre?: string
  rubroCodigo: string | null
  rubroNombre: string | null
  unidades: number
  unidadesDia: number
}

const TURNOS = [
  { value: '', label: 'Todos' },
  { value: 'ALMUERZO', label: 'Almuerzo' },
  { value: 'CENA', label: 'Cena' },
] as const

const MODOS = [
  { value: 'rubro', label: 'Por rubro' },
  { value: 'general', label: 'General' },
] as const

/**
 * Panel de ventas para usuarios restringidos (permiso ventas.ranking): SIN montos.
 * Pensado para celular/tablet: navegación por niveles en vez de un dashboard.
 *
 *   Rubros  →  Productos del rubro  →  Detalle del producto (gráfico por día)
 *
 * El modo "General" salta el nivel de rubro y lista todos los productos.
 * Filtros siempre a mano: rango de fechas (botón desplegable) y turno (segmentado).
 */
export function RankingDashboard() {
  const [range, setRange] = useState(yesterdayRange())
  const [turno, setTurno] = useState<'' | 'ALMUERZO' | 'CENA'>('')
  const [mode, setMode] = useState<'rubro' | 'general'>('rubro')
  const [selectedRubro, setSelectedRubro] = useState<{ codigo: string; nombre: string } | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<{ codigo: string; nombre: string } | null>(null)
  const [search, setSearch] = useState('')
  const [dateOpen, setDateOpen] = useState(false)

  // ¿Estamos listando productos (item) o rubros?
  const inProductList = mode === 'general' || (mode === 'rubro' && selectedRubro != null)
  const groupBy: 'item' | 'rubro' = inProductList ? 'item' : 'rubro'
  const rubroFilter = mode === 'rubro' && selectedRubro ? selectedRubro.codigo : undefined

  const params = useMemo(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to, groupBy, limit: '500' })
    if (turno) p.set('turno', turno)
    if (rubroFilter) p.set('rubro', rubroFilter)
    return p.toString()
  }, [range, turno, groupBy, rubroFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-ranking-nav', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/ranking?${params}`)
      if (!res.ok) throw new Error('Error cargando ranking')
      return res.json() as Promise<{ ranking: RankingItem[] }>
    },
    staleTime: 60_000,
  })

  const items = data?.ranking ?? []
  const isRubroList = groupBy === 'rubro'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const nombre = (isRubroList ? it.rubroNombre : it.nombre) ?? ''
      return nombre.toLowerCase().includes(q) || (it.rubroNombre ?? '').toLowerCase().includes(q)
    })
  }, [items, search, isRubroList])

  const totalUnidades = useMemo(() => filtered.reduce((a, it) => a + it.unidades, 0), [filtered])

  // --- Handlers de navegación (limpian la búsqueda al cambiar de contexto) ---
  const changeRange = (r: { from: string; to: string }) => {
    setRange(r)
    setDateOpen(false)
  }
  const changeMode = (m: 'rubro' | 'general') => {
    setMode(m)
    setSelectedRubro(null)
    setSearch('')
  }
  const enterRubro = (r: { codigo: string; nombre: string }) => {
    setSelectedRubro(r)
    setSearch('')
  }
  const backToRubros = () => {
    setSelectedRubro(null)
    setSearch('')
  }

  // Botón desplegable (sandwich) para elegir el rango de fechas.
  const dateBar = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDateOpen((o) => !o)}
        aria-expanded={dateOpen}
        className="inline-flex items-center gap-2 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white text-slate-700 active:bg-slate-50"
      >
        <Menu className="h-4 w-4 text-slate-500" />
        <span className="font-medium">{fmtRangeLabel(range.from, range.to)}</span>
      </button>
      {dateOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setDateOpen(false)} />
          <div className="absolute z-20 mt-2 left-0 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-[min(92vw,26rem)]">
            <DateRange from={range.from} to={range.to} onChange={changeRange} />
          </div>
        </>
      )}
    </div>
  )

  // === Nivel 2: detalle del producto (gráfico por día en el rango) ===
  if (selectedProduct) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedProduct(null)}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </button>
          {dateBar}
        </div>
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <ProductDetail
            codigo={selectedProduct.codigo}
            nombre={selectedProduct.nombre || undefined}
            from={range.from}
            to={range.to}
            hideMontos
          />
        </div>
      </div>
    )
  }

  // === Niveles 0/1: lista de rubros o de productos ===
  return (
    <div className="space-y-3">
      {/* Fecha + turno */}
      <div className="flex items-center gap-2 flex-wrap">
        {dateBar}
        <Segmented options={TURNOS} value={turno} onChange={setTurno} />
      </div>

      {/* Breadcrumb del rubro, o toggle rubro/general */}
      {selectedRubro ? (
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={backToRubros}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
            Rubros
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-800 truncate">{selectedRubro.nombre}</span>
        </div>
      ) : (
        <Segmented options={MODOS} value={mode} onChange={changeMode} />
      )}

      {/* Búsqueda por texto (ancho completo) */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder={isRubroList ? 'Buscar rubro…' : 'Buscar producto…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-slate-200 rounded-md pl-9 pr-9 py-2.5 text-sm bg-white"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <Package className="h-9 w-9 mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm">
              {search ? `Sin resultados para “${search}”` : 'Sin ventas en este rango'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <span className="flex-1">{isRubroList ? 'Rubro' : 'Producto'}</span>
              <span>Unidades</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map((it, idx) => {
                const name = (isRubroList ? it.rubroNombre : it.nombre) ?? '—'
                const canTap = isRubroList
                  ? !!(it.rubroCodigo && it.rubroNombre)
                  : !!it.codigo
                const handle = () => {
                  if (!canTap) return
                  if (isRubroList) enterRubro({ codigo: it.rubroCodigo!, nombre: it.rubroNombre! })
                  else setSelectedProduct({ codigo: it.codigo!, nombre: it.nombre ?? '' })
                }
                return (
                  <button
                    key={`${it.codigo ?? it.rubroCodigo ?? 'x'}-${idx}`}
                    type="button"
                    onClick={handle}
                    disabled={!canTap}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 disabled:cursor-default"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{name}</p>
                      {mode === 'general' && it.rubroNombre && (
                        <p className="text-xs text-slate-400 truncate">{it.rubroNombre}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-800 tabular-nums">{fmtNumAR(it.unidades)}</p>
                      <p className="text-[11px] text-slate-400 tabular-nums">{fmtNumAR(it.unidadesDia, 1)}/día</p>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 ${canTap ? 'text-slate-300' : 'text-transparent'}`}
                    />
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Resumen del listado mostrado */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 px-1">
          {filtered.length} {isRubroList ? 'rubros' : 'productos'} · {fmtNumAR(totalUnidades)} unidades
        </p>
      )}
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-sm rounded-md transition ${
            value === o.value ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
