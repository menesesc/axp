'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'

interface MonthlyAmountPoint {
  mes: string // YYYY-MM
  total: number
}

interface MonthlyAmountChartProps {
  data: MonthlyAmountPoint[]
  isLoading?: boolean
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatMonth(mes: string): string {
  const [year, month] = mes.split('-')
  return `${MESES[parseInt(month!, 10) - 1]} ${year!.slice(2)}`
}

export function MonthlyAmountChart({ data, isLoading }: MonthlyAmountChartProps) {
  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Importe por mes · últimos 12 meses</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="h-[240px] flex items-center justify-center">
            <div className="animate-pulse h-32 w-full rounded-md bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasData = data && data.some((d) => d.total > 0)
  const lastIndex = data.length - 1

  // Promedio sobre los meses con actividad
  const nonZero = data.filter((d) => d.total > 0)
  const average = nonZero.length > 0
    ? nonZero.reduce((sum, d) => sum + d.total, 0) / nonZero.length
    : 0

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-sm font-medium">Importe por mes · últimos 12 meses</CardTitle>
          {average > 0 && (
            <span className="text-xs text-slate-500">
              Prom.: {formatCurrency(Math.round(average))}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {!hasData ? (
          <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">
            Sin datos
          </div>
        ) : (
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="mes"
                  tickFormatter={formatMonth}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                  formatter={(value) => [formatCurrency(value as number), 'Importe']}
                  labelFormatter={(label) => formatMonth(String(label))}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    fontSize: '12px',
                  }}
                />
                {average > 0 && (
                  <ReferenceLine y={average} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
                )}
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={i === lastIndex ? '#2563eb' : '#93c5fd'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
