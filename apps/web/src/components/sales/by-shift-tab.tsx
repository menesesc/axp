'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtFecha, fmtFechaShort, fmtCompactAR, defaultRange, groupByWeekday } from './shared'
import { Sun, Moon } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface ShiftData {
  series: Array<{ fecha: string; almuerzo: number; cena: number; otro: number; total: number; tickets: number }>
  totals: { almuerzo: number; cena: number; otro: number; total: number }
  promedioPorTurno: { almuerzo: number; cena: number; otro: number }
  cierres: { almuerzo: number; cena: number; otro: number }
}

type WeekdayMetric = 'avg' | 'total'

export function ByShiftTab() {
  const [{ from, to }, setRange] = useState(defaultRange())
  const [wdMetric, setWdMetric] = useState<WeekdayMetric>('avg')

  const params = useMemo(() => new URLSearchParams({ from, to }).toString(), [from, to])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-by-shift', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/by-shift?${params}`)
      if (!res.ok) throw new Error('Error cargando datos por turno')
      return res.json() as Promise<ShiftData>
    },
    staleTime: 60_000,
  })

  const series = data?.series ?? []
  const totals = data?.totals ?? { almuerzo: 0, cena: 0, otro: 0, total: 0 }
  const proms = data?.promedioPorTurno ?? { almuerzo: 0, cena: 0, otro: 0 }
  const cierres = data?.cierres ?? { almuerzo: 0, cena: 0, otro: 0 }

  // Agrupar por día de la semana (suma de almuerzo + cena por weekday)
  const weekdayData = useMemo(() => {
    const grouped = groupByWeekday(series, ['almuerzo', 'cena', 'otro', 'total'])
    return grouped.map((g) => {
      const divisor = wdMetric === 'avg' && g.count > 0 ? g.count : 1
      return {
        short: g.short,
        label: g.label,
        count: g.count,
        almuerzo: g.almuerzo / divisor,
        cena: g.cena / divisor,
        otro: g.otro / divisor,
        total: g.total / divisor,
      }
    })
  }, [series, wdMetric])

  const hayWeekdayData = weekdayData.some((d) => d.count > 0)

  return (
    <div className="space-y-4">
      <DateRange from={from} to={to} onChange={setRange} />

      {/* KPIs por turno */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ShiftCard
          icon={<Sun className="h-5 w-5 text-amber-500" />}
          label="Almuerzo"
          total={totals.almuerzo}
          promedio={proms.almuerzo}
          cierres={cierres.almuerzo}
        />
        <ShiftCard
          icon={<Moon className="h-5 w-5 text-indigo-500" />}
          label="Cena"
          total={totals.cena}
          promedio={proms.cena}
          cierres={cierres.cena}
        />
        <ShiftCard
          label="Total"
          total={totals.total}
          promedio={(proms.almuerzo + proms.cena) / Math.max(2, 1)}
          cierres={cierres.almuerzo + cierres.cena}
        />
      </div>

      {/* Gráfico de línea */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">Ventas por día y turno</h3>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : series.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Sin datos para graficar</div>
        ) : (
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tickFormatter={fmtFechaShort} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtCompactAR} tick={{ fontSize: 11 }} width={56} />
                <Tooltip
                  labelFormatter={(l) => fmtFecha(String(l))}
                  formatter={((v: number, name: string) => [fmtAR(v), name]) as never}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="almuerzo"
                  name="Almuerzo"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="cena"
                  name="Cena"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Gráfico por día de la semana */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-700">Ventas por día de la semana</h3>
          <div className="inline-flex bg-slate-100 rounded-md p-0.5">
            <button
              onClick={() => setWdMetric('avg')}
              className={`px-2.5 py-1 text-xs rounded ${
                wdMetric === 'avg' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Promedio
            </button>
            <button
              onClick={() => setWdMetric('total')}
              className={`px-2.5 py-1 text-xs rounded ${
                wdMetric === 'total' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}
            >
              Total
            </button>
          </div>
        </div>
        {!hayWeekdayData ? (
          <div className="p-8 text-center text-slate-400 text-sm">Sin datos para agrupar</div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={weekdayData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                <XAxis dataKey="short" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtCompactAR} tick={{ fontSize: 11 }} width={56} />
                <Tooltip
                  labelFormatter={(_l, payload) => {
                    const p = payload?.[0]?.payload as { label?: string; count?: number } | undefined
                    return p ? `${p.label} (${p.count ?? 0} cierres)` : ''
                  }}
                  formatter={((v: number, name: string) => [fmtAR(v), name]) as never}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="almuerzo" name="Almuerzo" stackId="d" fill="#f59e0b" />
                <Bar dataKey="cena" name="Cena" stackId="d" fill="#6366f1" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">
          {wdMetric === 'avg'
            ? 'Promedio = total del día de la semana / cantidad de cierres para ese día.'
            : 'Suma de ventas para cada día de la semana en el rango seleccionado.'}
        </p>
      </div>
    </div>
  )
}

function ShiftCard({
  icon,
  label,
  total,
  promedio,
  cierres,
}: {
  icon?: React.ReactNode
  label: string
  total: number
  promedio: number
  cierres: number
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-800">{fmtAR(total)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div>
          <p className="text-[10px] uppercase tracking-wide">Cierres</p>
          <p className="text-slate-700 font-medium">{cierres}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide">Promedio/cierre</p>
          <p className="text-slate-700 font-medium">{fmtAR(promedio)}</p>
        </div>
      </div>
    </div>
  )
}
