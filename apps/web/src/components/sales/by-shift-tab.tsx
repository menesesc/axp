'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtFecha, defaultRange } from './shared'
import { Sun, Moon } from 'lucide-react'
import {
  LineChart,
  Line,
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

export function ByShiftTab() {
  const [{ from, to }, setRange] = useState(defaultRange())

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
              <LineChart data={series}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmtAR(v).replace(/[ $]/g, '').trim()} tick={{ fontSize: 11 }} />
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
