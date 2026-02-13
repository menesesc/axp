'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

interface StatusChartProps {
  pendientes: number
  confirmados: number
  pagados: number
  errores: number
  duplicados: number
  isLoading?: boolean
}

const COLORS: Record<string, string> = {
  Pendientes: '#f59e0b',
  Confirmados: '#10b981',
  Pagados: '#3b82f6',
  Errores: '#ef4444',
  Duplicados: '#94a3b8',
}

export function StatusChart({
  pendientes,
  confirmados,
  pagados,
  errores,
  duplicados,
  isLoading,
}: StatusChartProps) {
  const allStates = [
    { name: 'Pendientes', value: pendientes },
    { name: 'Confirmados', value: confirmados },
    { name: 'Pagados', value: pagados },
    { name: 'Errores', value: errores },
    { name: 'Duplicados', value: duplicados },
  ]

  const data = allStates
    .filter((s) => s.value > 0)
    .map((s) => ({ ...s, color: COLORS[s.name] || '#94a3b8' }))

  const total = data.reduce((sum, s) => sum + s.value, 0)

  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Documentos por estado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse h-32 w-32 rounded-full bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Documentos por estado
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
            Sin datos
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    (value as number).toLocaleString('es-AR'),
                    'Documentos',
                  ]}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-xs text-slate-600">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
