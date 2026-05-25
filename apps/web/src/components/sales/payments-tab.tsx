'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, defaultRange } from './shared'
import { CreditCard } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface Payment {
  formaCobro: string
  total: number
  cantidad: number
  porcentaje: number
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

export function PaymentsTab() {
  const [{ from, to }, setRange] = useState(defaultRange())

  const params = useMemo(() => new URLSearchParams({ from, to }).toString(), [from, to])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-payments', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/payments?${params}`)
      if (!res.ok) throw new Error('Error cargando pagos')
      return res.json() as Promise<{ payments: Payment[]; total: number }>
    },
    staleTime: 60_000,
  })

  const payments = data?.payments ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-4">
      <DateRange from={from} to={to} onChange={setRange} />

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
      ) : payments.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-lg border border-slate-200">
          <CreditCard className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Sin datos de cobros en este rango</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">Distribución de cobros</h3>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={payments}
                    dataKey="total"
                    nameKey="formaCobro"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {payments.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={((v: number) => fmtAR(v)) as never} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-center text-sm text-slate-500 mt-2">
              Total: <span className="font-semibold text-slate-800">{fmtAR(total)}</span>
            </p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Forma</th>
                  <th className="text-right px-4 py-2.5 font-medium">#</th>
                  <th className="text-right px-4 py-2.5 font-medium">Total</th>
                  <th className="text-right px-4 py-2.5 font-medium w-20">%</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={p.formaCobro} className="border-b border-slate-100">
                    <td className="px-4 py-2.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: COLORS[i % COLORS.length] }} />
                      {p.formaCobro}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(p.cantidad)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtAR(p.total)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{Math.round(p.porcentaje)}%</td>
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
