'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfidenceAverage } from '@/components/ui/confidence-badge'
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
  confidencePromedio: number
  isLoading?: boolean
}

const COLORS = {
  pendiente: '#f59e0b',
  confirmado: '#10b981',
}

export function StatusChart({
  pendientes,
  confirmados,
  confidencePromedio,
  isLoading,
}: StatusChartProps) {
  const data = [
    { name: 'Pendientes', value: pendientes, color: COLORS.pendiente },
    { name: 'Confirmados', value: confirmados, color: COLORS.confirmado },
  ]

  const total = pendientes + confirmados

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
          <>
            <div className="h-[180px]">
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
            <div className="border-t pt-3 mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Confianza OCR promedio</span>
                <span className="font-medium text-slate-700">
                  {confidencePromedio.toFixed(0)}%
                </span>
              </div>
              <div className="mt-2">
                <ConfidenceAverage score={confidencePromedio} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
