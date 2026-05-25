'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, defaultRange } from './shared'
import { Users } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

interface Waiter {
  codigo: string
  nombre: string
  importe: number
  cantVentas: number
  cantCubiertos: number
  ticketPromedio: number
  promedioCubierto: number
}

export function WaitersTab() {
  const [{ from, to }, setRange] = useState(defaultRange())

  const params = useMemo(() => new URLSearchParams({ from, to }).toString(), [from, to])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-waiters', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/waiters?${params}`)
      if (!res.ok) throw new Error('Error cargando mozos')
      return res.json() as Promise<{ waiters: Waiter[] }>
    },
    staleTime: 60_000,
  })

  const waiters = data?.waiters ?? []
  const chartData = waiters.map((w) => ({ nombre: w.nombre, importe: w.importe }))

  return (
    <div className="space-y-4">
      <DateRange from={from} to={to} onChange={setRange} />

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
      ) : waiters.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-lg border border-slate-200">
          <Users className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Sin ventas de mozos en este rango</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gráfico */}
          <div className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">Ventas por mozo</h3>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 16 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => fmtAR(v).replace('$', '').trim()} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={((v: number) => fmtAR(v)) as never} />
                  <Bar dataKey="importe" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Mozo</th>
                  <th className="text-right px-4 py-2.5 font-medium">Ventas</th>
                  <th className="text-right px-4 py-2.5 font-medium">Cubiertos</th>
                  <th className="text-right px-4 py-2.5 font-medium">Ticket prom.</th>
                  <th className="text-right px-4 py-2.5 font-medium">$/cubierto</th>
                  <th className="text-right px-4 py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {waiters.map((w) => (
                  <tr key={w.codigo} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className="text-slate-400 text-xs mr-2">#{w.codigo}</span>
                      <span className="text-slate-700">{w.nombre}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(w.cantVentas)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(w.cantCubiertos)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtAR(w.ticketPromedio)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtAR(w.promedioCubierto)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtAR(w.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
