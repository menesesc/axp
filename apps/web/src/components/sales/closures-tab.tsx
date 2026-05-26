'use client'

import { useState, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Upload, Receipt, ChevronDown, ChevronUp, Loader2, ArrowUp, ArrowDown } from 'lucide-react'
import { toast } from 'sonner'
import { LineChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis } from 'recharts'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, fmtFecha, defaultRange, TURNO_LABEL, TURNO_BADGE, useSort, type SortDir } from './shared'
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

  const totals = useMemo(() => {
    return closures.reduce(
      (acc, c) => ({
        ventas: acc.ventas + Number(c.totalVentas ?? 0),
        tickets: acc.tickets + (c.cantTickets ?? 0),
        cubiertos: acc.cubiertos + Number(c.cantCubiertos ?? 0),
      }),
      { ventas: 0, tickets: 0, cubiertos: 0 }
    )
  }, [closures])

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
          series={daily}
          dataKey="cierres"
          color="#6366f1"
        />
        <KPI
          label="Tickets"
          value={fmtNumAR(totals.tickets)}
          series={daily}
          dataKey="tickets"
          color="#0ea5e9"
        />
        <KPI
          label="Cubiertos"
          value={fmtNumAR(totals.cubiertos)}
          series={daily}
          dataKey="cubiertos"
          color="#f59e0b"
        />
        <KPI
          label="Ventas totales"
          value={fmtAR(totals.ventas)}
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
  highlight,
  series,
  dataKey,
  color,
  isCurrency,
}: {
  label: string
  value: string
  highlight?: boolean
  series?: Array<{ fecha: string; cierres: number; tickets: number; cubiertos: number; ventas: number }>
  dataKey?: 'cierres' | 'tickets' | 'cubiertos' | 'ventas'
  color?: string
  isCurrency?: boolean
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${highlight ? 'text-emerald-700' : 'text-slate-800'}`}>
        {value}
      </p>
      {series && dataKey && series.length > 1 && (
        <div className="mt-2 h-10 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
              <XAxis dataKey="fecha" hide />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color ?? '#6366f1'}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <RTooltip
                cursor={false}
                contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6 }}
                labelFormatter={(l) => fmtFecha(String(l))}
                formatter={((v: number) => [isCurrency ? fmtAR(v) : fmtNumAR(v), label]) as never}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
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
