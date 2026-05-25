'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, fmtFecha, useSort, type SortDir } from './shared'
import { AlertTriangle, Trash2, Tag, FileText, Loader2, ArrowUp, ArrowDown } from 'lucide-react'
import { toast } from 'sonner'

interface SummaryResp {
  totals: Record<string, { count: number; totalMonto: number }>
  descuentosPorMozo: Array<{ mozo: string | null; count: number; totalMonto: number }>
  eliminacionesPorMozo: Array<{ mozo: string | null; count: number }>
  productosEliminados: Array<{ productoNombre: string | null; count: number }>
}

interface AuditEvent {
  id: string
  closureId: string
  tipo: 'EMISION' | 'DESCUENTO' | 'ELIMINACION' | 'ESPECIFICACION' | 'OTRO'
  fuente: 'CAJERO' | 'MOZO'
  mesa: string | null
  mozo: string | null
  comprobante: string | null
  hora: string | null
  detalle: string
  monto: number | null
  porcentaje: number | null
  productoNombre: string | null
  productoCodigo: string | null
  fechaCierre: string | null
  turnoCierre: string | null
  sucursalCierre: string | null
  nroCierre: number | null
}

interface EventsResp {
  events: AuditEvent[]
  pagination: { total: number; page: number; totalPages: number }
}

function defaultRange() {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { from, to }
}

const TIPO_LABEL: Record<string, string> = {
  EMISION: 'Emisión',
  DESCUENTO: 'Descuento',
  ELIMINACION: 'Eliminación',
  ESPECIFICACION: 'Especif. manual',
  OTRO: 'Otro',
}

const TIPO_BADGE: Record<string, string> = {
  EMISION: 'bg-slate-100 text-slate-600',
  DESCUENTO: 'bg-amber-100 text-amber-800',
  ELIMINACION: 'bg-rose-100 text-rose-800',
  ESPECIFICACION: 'bg-sky-100 text-sky-800',
  OTRO: 'bg-slate-100 text-slate-500',
}

export function AuditTab() {
  const queryClient = useQueryClient()
  const [{ from, to }, setRange] = useState(defaultRange())
  const [tipoFilter, setTipoFilter] = useState<'' | 'DESCUENTO' | 'ELIMINACION' | 'ESPECIFICACION' | 'EMISION'>('')
  const [mozoFilter, setMozoFilter] = useState('')
  const [reparsingAll, setReparsingAll] = useState(false)

  const summaryParams = useMemo(
    () => new URLSearchParams({ from, to, summary: 'true' }).toString(),
    [from, to]
  )
  const eventsParams = useMemo(() => {
    const p = new URLSearchParams({ from, to, pageSize: '200' })
    if (tipoFilter) p.append('tipo', tipoFilter)
    if (mozoFilter) p.append('mozo', mozoFilter)
    return p.toString()
  }, [from, to, tipoFilter, mozoFilter])

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['sales-audit-summary', summaryParams],
    queryFn: async () => {
      const res = await fetch(`/api/sales/audit?${summaryParams}`)
      if (!res.ok) throw new Error('Error cargando resumen')
      return res.json() as Promise<SummaryResp>
    },
    staleTime: 60_000,
  })

  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['sales-audit-events', eventsParams],
    queryFn: async () => {
      const res = await fetch(`/api/sales/audit?${eventsParams}`)
      if (!res.ok) throw new Error('Error cargando eventos')
      return res.json() as Promise<EventsResp>
    },
    staleTime: 60_000,
  })

  async function reparseAll() {
    if (!confirm('Re-parsear TODOS los cierres aplicará el parser actual a los rawText guardados. Útil para aplicar mejoras como auditoría a cierres viejos. ¿Continuar?')) return
    setReparsingAll(true)
    try {
      const res = await fetch('/api/sales/closures/reparse-all', { method: 'POST' })
      const body = await res.json()
      if (res.ok) {
        toast.success(`Re-parseados ${body.ok}/${body.total} cierres (${body.failed} con error)`)
        queryClient.invalidateQueries({ queryKey: ['sales-audit-summary'] })
        queryClient.invalidateQueries({ queryKey: ['sales-audit-events'] })
        queryClient.invalidateQueries({ queryKey: ['sales-closures'] })
      } else {
        toast.error(body.error || 'Error re-parseando')
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setReparsingAll(false)
    }
  }

  const totals = summary?.totals ?? {}

  const eventsList = events?.events ?? []
  type SortKey = 'fecha' | 'hora' | 'tipo' | 'mesa' | 'mozo' | 'detalle' | 'monto'
  const getValue = (e: AuditEvent, k: SortKey): number | string => {
    switch (k) {
      case 'fecha': return e.fechaCierre ?? ''
      case 'hora': return e.hora ?? ''
      case 'tipo': return e.tipo
      case 'mesa': return e.mesa ?? ''
      case 'mozo': return e.mozo ?? ''
      case 'detalle': return e.productoNombre ?? e.detalle ?? ''
      case 'monto': return e.monto ?? 0
    }
  }
  const { sorted: sortedEvents, sort, toggle } = useSort<AuditEvent, SortKey>(
    eventsList,
    getValue,
    { key: 'fecha', dir: 'desc' }
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DateRange from={from} to={to} onChange={setRange} />
        <Button onClick={reparseAll} disabled={reparsingAll} variant="outline" size="sm">
          {reparsingAll ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Re-parseando...</>
          ) : (
            <>Re-parsear todos los cierres</>
          )}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          icon={<Tag className="h-4 w-4" />}
          label="Descuentos aplicados"
          count={totals.DESCUENTO?.count ?? 0}
          monto={totals.DESCUENTO?.totalMonto ?? 0}
          color="amber"
        />
        <KPI
          icon={<Trash2 className="h-4 w-4" />}
          label="Items eliminados"
          count={totals.ELIMINACION?.count ?? 0}
          color="rose"
        />
        <KPI
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Especif. manuales"
          count={totals.ESPECIFICACION?.count ?? 0}
          color="sky"
        />
        <KPI
          icon={<FileText className="h-4 w-4" />}
          label="Tickets emitidos"
          count={totals.EMISION?.count ?? 0}
          monto={totals.EMISION?.totalMonto ?? 0}
          color="slate"
        />
      </div>

      {/* Top mozos */}
      {!loadingSummary && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Descuentos por mozo" icon={<Tag className="h-4 w-4 text-amber-500" />}>
            {summary.descuentosPorMozo.length === 0 ? (
              <Empty>Sin descuentos en este rango</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="text-left py-1.5 font-medium">Mozo</th>
                    <th className="text-right py-1.5 font-medium">Cant.</th>
                    <th className="text-right py-1.5 font-medium">Total $</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.descuentosPorMozo.map((d) => (
                    <tr key={d.mozo ?? 'null'} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-700">{d.mozo ?? '—'}</td>
                      <td className="py-1.5 text-right text-slate-600">{d.count}</td>
                      <td className="py-1.5 text-right font-medium text-amber-700">{fmtAR(d.totalMonto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Eliminaciones por mozo" icon={<Trash2 className="h-4 w-4 text-rose-500" />}>
            {summary.eliminacionesPorMozo.length === 0 ? (
              <Empty>Sin items eliminados en este rango</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="text-left py-1.5 font-medium">Mozo</th>
                    <th className="text-right py-1.5 font-medium">Items eliminados</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.eliminacionesPorMozo.map((d) => (
                    <tr key={d.mozo ?? 'null'} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-700">{d.mozo ?? '—'}</td>
                      <td className="py-1.5 text-right font-medium text-rose-700">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {/* Productos más eliminados */}
      {!loadingSummary && summary && summary.productosEliminados.length > 0 && (
        <Card title="Productos más eliminados" icon={<Trash2 className="h-4 w-4 text-rose-500" />}>
          <div className="flex flex-wrap gap-2">
            {summary.productosEliminados.map((p) => (
              <span
                key={p.productoNombre ?? 'null'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-full text-xs"
              >
                <span className="text-rose-800 font-medium">{p.productoNombre ?? '—'}</span>
                <span className="text-rose-600">×{p.count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Filtros + tabla de eventos */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Filtrar eventos:</span>
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value as typeof tipoFilter)}
            className="border border-slate-200 rounded-md px-2 py-1 text-sm bg-white"
          >
            <option value="">Todos los tipos</option>
            <option value="DESCUENTO">Descuentos</option>
            <option value="ELIMINACION">Eliminaciones</option>
            <option value="ESPECIFICACION">Especif. manuales</option>
            <option value="EMISION">Emisiones</option>
          </select>
          <input
            type="text"
            placeholder="Código mozo..."
            value={mozoFilter}
            onChange={(e) => setMozoFilter(e.target.value)}
            className="border border-slate-200 rounded-md px-2 py-1 text-sm bg-white w-32"
          />
        </div>

        {loadingEvents ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : !events || events.events.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">Sin eventos para los filtros aplicados</p>
            <p className="text-slate-400 text-sm mt-1">
              Si recién agregaste auditoría, ejecutá "Re-parsear todos" para incluir cierres viejos
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <SortTh label="Fecha" k="fecha" sort={sort} onToggle={toggle} />
                  <SortTh label="Hora" k="hora" sort={sort} onToggle={toggle} />
                  <SortTh label="Tipo" k="tipo" sort={sort} onToggle={toggle} />
                  <SortTh label="Mesa" k="mesa" sort={sort} onToggle={toggle} />
                  <SortTh label="Mozo" k="mozo" sort={sort} onToggle={toggle} />
                  <SortTh label="Detalle" k="detalle" sort={sort} onToggle={toggle} />
                  <SortTh label="Monto" k="monto" sort={sort} onToggle={toggle} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {e.fechaCierre ? fmtFecha(e.fechaCierre) : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{e.hora ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded ${TIPO_BADGE[e.tipo] ?? TIPO_BADGE.OTRO}`}>
                        {TIPO_LABEL[e.tipo] ?? e.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{e.mesa ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{e.mozo ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700 max-w-md">
                      {e.tipo === 'ELIMINACION' && e.productoNombre ? (
                        <span className="text-rose-700">{e.productoNombre}</span>
                      ) : e.tipo === 'ESPECIFICACION' && e.productoNombre ? (
                        <span><span className="text-slate-400">{e.productoCodigo}</span> · {e.productoNombre.trim()}</span>
                      ) : (
                        <span className="text-slate-600 text-xs">{e.detalle}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {e.monto != null ? (
                        <span className={e.tipo === 'DESCUENTO' ? 'text-amber-700 font-medium' : 'text-slate-700'}>
                          {e.porcentaje != null && <span className="text-xs text-slate-400 mr-1.5">{e.porcentaje}%</span>}
                          {fmtAR(e.monto)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.pagination.total > events.events.length && (
              <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                Mostrando {events.events.length} de {events.pagination.total} eventos
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KPI({
  icon,
  label,
  count,
  monto,
  color,
}: {
  icon: React.ReactNode
  label: string
  count: number
  monto?: number | undefined
  color: 'amber' | 'rose' | 'sky' | 'slate'
}) {
  const colorMap = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
    slate: 'border-slate-200 bg-white text-slate-800',
  }
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 text-xs opacity-80">
        {icon}
        <span className="uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold mt-2">{fmtNumAR(count)}</p>
      {monto != null && monto > 0 && (
        <p className="text-sm opacity-80 mt-0.5">{fmtAR(monto)}</p>
      )}
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 text-center py-3">{children}</p>
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
    <th className={`px-4 py-2 font-medium ${cls}`}>
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
