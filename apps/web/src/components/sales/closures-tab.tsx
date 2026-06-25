'use client'

import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Upload, Receipt, ChevronDown, ChevronUp, Loader2, ArrowUp, ArrowDown } from 'lucide-react'
import { toast } from 'sonner'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, fmtFecha, defaultRange, previousRange, TURNO_LABEL, TURNO_BADGE, useSort, type SortDir } from './shared'
import { ClosureDetail } from './closure-detail'

interface ClosureRow {
  id: string
  fecha: string
  nroCierre: number
  turnoNombre: string
  turnoNumero: number | null
  sucursal: string | null
  totalVentas: string | null
  cantTickets: number | null
  cantCubiertos: string | null
  promedioCubierto: string | null
  efectivo: string | null
  ctaCte: string | null
  tarjetas: string | null
  source: string
}

type SortKey = 'fecha' | 'turno' | 'nroCierre' | 'tickets' | 'cubiertos' | 'ticketProm' | 'total'

function sumTotals(closures: ClosureRow[]) {
  return closures.reduce(
    (acc, c) => ({
      ventas: acc.ventas + Number(c.totalVentas ?? 0),
      tickets: acc.tickets + (c.cantTickets ?? 0),
      cubiertos: acc.cubiertos + Number(c.cantCubiertos ?? 0),
    }),
    { ventas: 0, tickets: 0, cubiertos: 0 }
  )
}

export function ClosuresTab() {
  const queryClient = useQueryClient()
  const [{ from, to }, setRange] = useState(defaultRange())
  const [sucursal, setSucursal] = useState('')
  const [turno, setTurno] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const params = useMemo(() => {
    const p = new URLSearchParams({ from, to, pageSize: '200' })
    if (sucursal) p.append('sucursal', sucursal)
    if (turno) p.append('turno', turno)
    return p.toString()
  }, [from, to, sucursal, turno])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-closures', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/closures?${params}`)
      if (!res.ok) throw new Error('Error cargando cierres')
      return res.json() as Promise<{
        closures: ClosureRow[]
        pagination: { total: number; page: number; totalPages: number }
        facets: { sucursales: string[] }
      }>
    },
    staleTime: 60_000,
  })

  const closures = data?.closures ?? []

  const totals = useMemo(() => sumTotals(closures), [closures])

  // Período anterior de la misma longitud (7 días → semana previa, 1 día → día previo, etc.)
  // para mostrar la variación % en cada card.
  const prevParams = useMemo(() => {
    const { from: pf, to: pt } = previousRange(from, to)
    const p = new URLSearchParams({ from: pf, to: pt, pageSize: '200' })
    if (sucursal) p.append('sucursal', sucursal)
    if (turno) p.append('turno', turno)
    return p.toString()
  }, [from, to, sucursal, turno])

  const { data: prevData } = useQuery({
    queryKey: ['sales-closures', prevParams],
    queryFn: async () => {
      const res = await fetch(`/api/sales/closures?${prevParams}`)
      if (!res.ok) throw new Error('Error cargando período anterior')
      return res.json() as Promise<{ closures: ClosureRow[] }>
    },
    staleTime: 60_000,
  })

  const prevClosures = prevData?.closures ?? []
  const prevTotals = useMemo(() => sumTotals(prevClosures), [prevClosures])

  // Series diarias para sparklines (cierres, tickets, cubiertos y ventas totales por día)
  const daily = useMemo(() => {
    const map = new Map<string, { fecha: string; cierres: number; tickets: number; cubiertos: number; ventas: number }>()
    for (const c of closures) {
      const key = c.fecha.slice(0, 10)
      const cur = map.get(key) ?? { fecha: key, cierres: 0, tickets: 0, cubiertos: 0, ventas: 0 }
      cur.cierres += 1
      cur.tickets += c.cantTickets ?? 0
      cur.cubiertos += Number(c.cantCubiertos ?? 0)
      cur.ventas += Number(c.totalVentas ?? 0)
      map.set(key, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [closures])

  // Promedios diarios sobre los días con cierres del rango.
  const nDays = daily.length || 1

  const getValue = (c: ClosureRow, k: SortKey): number | string => {
    switch (k) {
      case 'fecha': return c.fecha
      case 'turno': return `${c.turnoNumero ?? 0}-${c.turnoNombre}`
      case 'nroCierre': return c.nroCierre
      case 'tickets': return c.cantTickets ?? 0
      case 'cubiertos': return Number(c.cantCubiertos ?? 0)
      case 'ticketProm':
        return c.cantTickets && c.cantTickets > 0
          ? Number(c.totalVentas ?? 0) / c.cantTickets
          : 0
      case 'total': return Number(c.totalVentas ?? 0)
    }
  }
  const { sorted, sort, toggle } = useSort<ClosureRow, SortKey>(
    closures,
    getValue,
    { key: 'nroCierre', dir: 'desc' }
  )

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/sales/closures/upload', { method: 'POST', body: form })
      const body = await res.json()
      if (res.ok && body.status === 'OK') {
        toast.success(`Cierre #${body.nroCierre} del ${body.fecha} importado`)
        queryClient.invalidateQueries({ queryKey: ['sales-closures'] })
        queryClient.invalidateQueries({ queryKey: ['sales-ranking'] })
        queryClient.invalidateQueries({ queryKey: ['sales-waiters'] })
        queryClient.invalidateQueries({ queryKey: ['sales-payments'] })
        queryClient.invalidateQueries({ queryKey: ['sales-by-shift'] })
      } else {
        toast.error(body.message || 'No se pudo procesar el PDF')
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros + upload */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DateRange
          from={from}
          to={to}
          onChange={setRange}
          sucursales={data?.facets.sucursales}
          sucursal={sucursal}
          onSucursalChange={setSucursal}
        />
        <div className="flex items-center gap-2">
          <select
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
            className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
          >
            <option value="">Todos los turnos</option>
            <option value="ALMUERZO">Almuerzo</option>
            <option value="CENA">Cena</option>
            <option value="OTRO">Otro</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            size="sm"
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Procesando...</>
            ) : (
              <><Upload className="h-4 w-4 mr-1.5" /> Subir PDF Maxirest</>
            )}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KPI
          label="Cierres"
          value={fmtNumAR(closures.length)}
          current={closures.length}
          previous={prevClosures.length}
          promedio={closures.length / nDays}
          series={daily}
          dataKey="cierres"
          color="#6366f1"
        />
        <KPI
          label="Tickets"
          value={fmtNumAR(totals.tickets)}
          current={totals.tickets}
          previous={prevTotals.tickets}
          promedio={totals.tickets / nDays}
          series={daily}
          dataKey="tickets"
          color="#0ea5e9"
        />
        <KPI
          label="Cubiertos"
          value={fmtNumAR(totals.cubiertos)}
          current={totals.cubiertos}
          previous={prevTotals.cubiertos}
          promedio={totals.cubiertos / nDays}
          series={daily}
          dataKey="cubiertos"
          color="#f59e0b"
        />
        <KPI
          label="Ventas totales"
          value={fmtAR(totals.ventas)}
          current={totals.ventas}
          previous={prevTotals.ventas}
          promedio={totals.ventas / nDays}
          series={daily}
          dataKey="ventas"
          color="#10b981"
          highlight
          isCurrency
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : closures.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">Sin cierres en este rango</p>
            <p className="text-slate-400 text-sm mt-1">
              Los cierres llegan automáticamente por email desde Maxirest,
              o subí un PDF manualmente.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <SortTh label="Fecha" k="fecha" sort={sort} onToggle={toggle} />
                <SortTh label="Turno" k="turno" sort={sort} onToggle={toggle} />
                <SortTh label="Cierre #" k="nroCierre" sort={sort} onToggle={toggle} />
                <SortTh label="Tickets" k="tickets" sort={sort} onToggle={toggle} align="right" />
                <SortTh label="Cubiertos" k="cubiertos" sort={sort} onToggle={toggle} align="right" />
                <SortTh label="Ticket prom." k="ticketProm" sort={sort} onToggle={toggle} align="right" />
                <SortTh label="Total" k="total" sort={sort} onToggle={toggle} align="right" />
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const expanded = expandedId === c.id
                return (
                  <ClosureRowItem
                    key={c.id}
                    row={c}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : c.id)}
                  />
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function KPI({
  label,
  value,
  current,
  previous,
  promedio,
  highlight,
  series,
  dataKey,
  color,
  isCurrency,
}: {
  label: string
  value: string
  current: number
  previous: number
  promedio: number
  highlight?: boolean
  series?: Array<{ fecha: string; cierres: number; tickets: number; cubiertos: number; ventas: number }>
  dataKey?: 'cierres' | 'tickets' | 'cubiertos' | 'ventas'
  color?: string
  isCurrency?: boolean
}) {
  // Variación vs. el período anterior de igual longitud. Si antes no hubo nada,
  // no hay base para un %; lo dejamos sin dato.
  const pct = previous > 0 ? ((current - previous) / previous) * 100 : null
  const up = pct != null && pct >= 0
  const tone = pct == null ? 'text-slate-400' : up ? 'text-emerald-600' : 'text-rose-600'
  const sparkColor = pct == null ? color ?? '#94a3b8' : up ? '#10b981' : '#f43f5e'

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">{label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {series && dataKey && series.length > 1 && (
            <div className="w-14 h-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 3, right: 1, left: 1, bottom: 3 }}>
                  <Line
                    type="monotone"
                    dataKey={dataKey}
                    stroke={sparkColor}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <span className={`text-xs font-medium inline-flex items-center gap-0.5 ${tone}`}>
            {pct != null ? (
              <>
                {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {`${up ? '+' : ''}${pct.toFixed(0)}%`}
              </>
            ) : (
              's/d'
            )}
          </span>
        </div>
      </div>
      <p className={`text-2xl font-semibold mt-1 ${highlight ? 'text-emerald-700' : 'text-slate-800'}`}>
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        Prom. {isCurrency ? fmtAR(promedio) : fmtNumAR(promedio, 1)}
        <span className="text-slate-400"> /día</span>
      </p>
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
    <th className={`px-4 py-3 font-medium ${cls}`}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 ${
          active ? 'text-slate-700' : ''
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        <span>{label}</span>
        {active ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <span className="w-3" />
        )}
      </button>
    </th>
  )
}

function ClosureRowItem({
  row,
  expanded,
  onToggle,
}: {
  row: ClosureRow
  expanded: boolean
  onToggle: () => void
}) {
  const ticketProm =
    row.cantTickets && row.cantTickets > 0
      ? Number(row.totalVentas ?? 0) / row.cantTickets
      : 0
  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-slate-700">{fmtFecha(row.fecha)}</td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded border ${TURNO_BADGE[row.turnoNombre] ?? TURNO_BADGE.OTRO}`}>
            {TURNO_LABEL[row.turnoNombre] ?? row.turnoNombre}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-600">#{row.nroCierre}</td>
        <td className="px-4 py-3 text-right text-slate-600">{fmtNumAR(row.cantTickets)}</td>
        <td className="px-4 py-3 text-right text-slate-600">{fmtNumAR(Number(row.cantCubiertos ?? 0))}</td>
        <td className="px-4 py-3 text-right text-slate-600">{fmtAR(ticketProm)}</td>
        <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtAR(row.totalVentas)}</td>
        <td className="px-4 py-3 text-slate-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={8} className="p-0">
            <ClosureDetail closureId={row.id} />
          </td>
        </tr>
      )}
    </>
  )
}
