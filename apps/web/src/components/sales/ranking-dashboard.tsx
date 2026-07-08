'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { RankingTab } from './ranking-tab'
import { fmtNumAR, fmtFechaShort, fmtFecha, defaultRange, TURNO_LABEL } from './shared'
import { Package, TrendingUp, CalendarDays, Layers } from 'lucide-react'
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

interface DailyPoint {
  fecha: string
  ALMUERZO: number
  CENA: number
  OTRO: number
  total: number
}

interface DailyData {
  series: DailyPoint[]
  totals: {
    unidades: number
    dias: number
    unidadesDia: number
    porTurno: { ALMUERZO: number; CENA: number; OTRO: number }
  }
}

/**
 * Panel de ventas para usuarios restringidos (permiso ventas.ranking): SIN montos.
 * Filtros compartidos (rango + turno + rubro) que alimentan tanto los KPIs y el
 * gráfico día a día como la tabla de ranking por unidades.
 */
export function RankingDashboard() {
  const [range, setRange] = useState(defaultRange())
  const [turno, setTurno] = useState('')
  const [rubro, setRubro] = useState('')

  const params = useMemo(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to })
    if (turno) p.set('turno', turno)
    if (rubro) p.set('rubro', rubro)
    return p.toString()
  }, [range, turno, rubro])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-units-daily', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/units-daily?${params}`)
      if (!res.ok) throw new Error('Error cargando ventas por día')
      return res.json() as Promise<DailyData>
    },
    staleTime: 60_000,
  })

  // Rubros para el filtro (desde el ranking agrupado por rubro en el rango).
  const { data: rubrosData } = useQuery({
    queryKey: ['sales-rubros', range.from, range.to],
    queryFn: async () => {
      const res = await fetch(
        `/api/sales/ranking?from=${range.from}&to=${range.to}&groupBy=rubro&limit=500`
      )
      if (!res.ok) throw new Error('Error cargando rubros')
      return res.json() as Promise<{ ranking: Array<{ rubroCodigo: string | null; rubroNombre: string | null }> }>
    },
    staleTime: 5 * 60_000,
  })
  const rubros = useMemo(
    () =>
      (rubrosData?.ranking ?? [])
        .filter((r) => r.rubroCodigo && r.rubroNombre)
        .map((r) => ({ codigo: r.rubroCodigo as string, nombre: r.rubroNombre as string }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [rubrosData]
  )

  const t = data?.totals
  const showOtro = (t?.porTurno.OTRO ?? 0) > 0
  const series = data?.series ?? []
  // Un solo día seleccionado → el gráfico por fecha no aporta; ya está en KPIs.
  const showChart = series.length > 1

  return (
    <div className="space-y-5">
      {/* Filtros compartidos */}
      <div className="flex items-center gap-2 flex-wrap">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <select
          value={turno}
          onChange={(e) => setTurno(e.target.value)}
          className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
          aria-label="Filtrar por turno"
        >
          <option value="">Todos los turnos</option>
          <option value="ALMUERZO">Almuerzo</option>
          <option value="CENA">Cena</option>
          <option value="OTRO">Otro</option>
        </select>
        <select
          value={rubro}
          onChange={(e) => setRubro(e.target.value)}
          className="border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white max-w-[11rem]"
          aria-label="Filtrar por rubro"
        >
          <option value="">Todos los rubros</option>
          {rubros.map((r) => (
            <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Package}
          label="Unidades vendidas"
          value={fmtNumAR(t?.unidades ?? 0)}
          hint={`${fmtNumAR(t?.dias ?? 0)} día${(t?.dias ?? 0) === 1 ? '' : 's'} con venta`}
          loading={isLoading}
        />
        <KpiCard
          icon={TrendingUp}
          label="Promedio por día"
          value={fmtNumAR(t?.unidadesDia ?? 0, 1)}
          hint="unidades/día"
          loading={isLoading}
        />
        <KpiCard
          icon={CalendarDays}
          label={TURNO_LABEL.ALMUERZO ?? 'Almuerzo'}
          value={fmtNumAR(t?.porTurno.ALMUERZO ?? 0)}
          hint="unidades"
          accent="amber"
          loading={isLoading}
        />
        <KpiCard
          icon={Layers}
          label={TURNO_LABEL.CENA ?? 'Cena'}
          value={fmtNumAR(t?.porTurno.CENA ?? 0)}
          hint="unidades"
          accent="indigo"
          loading={isLoading}
        />
      </div>

      {/* Gráfico día a día */}
      {showChart && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-700">Unidades vendidas por día</h3>
            <span className="text-xs text-slate-400">apiladas por turno</span>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tickFormatter={fmtFechaShort} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmtNumAR(v)} tick={{ fontSize: 11 }} width={48} />
                <Tooltip
                  labelFormatter={(l) => fmtFecha(String(l))}
                  formatter={((v: number, name: string) => [fmtNumAR(v), name]) as never}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ALMUERZO" stackId="t" name="Almuerzo" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="CENA" stackId="t" name="Cena" fill="#6366f1" radius={showOtro ? [0, 0, 0, 0] : [2, 2, 0, 0]} />
                {showOtro && (
                  <Bar dataKey="OTRO" stackId="t" name="Otro" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Ranking de productos por unidades (sin montos), comparte filtros */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Ranking de productos</h3>
        <RankingTab hideMontos range={range} turno={turno} rubro={rubro} hideOwnFilters />
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  loading,
}: {
  icon: React.ComponentType<any>
  label: string
  value: string
  hint?: string
  accent?: 'amber' | 'indigo'
  loading?: boolean
}) {
  const accentCls =
    accent === 'amber'
      ? 'text-amber-600 bg-amber-50'
      : accent === 'indigo'
        ? 'text-indigo-600 bg-indigo-50'
        : 'text-slate-600 bg-slate-100'
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${accentCls}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-800 tabular-nums">
        {loading ? '—' : value}
      </p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}
