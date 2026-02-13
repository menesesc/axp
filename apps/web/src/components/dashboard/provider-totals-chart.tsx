'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface ProviderTotal {
  proveedorId: string
  proveedor: string
  total: number
  count: number
  pendientes: number
  confirmados: number
  pagados: number
  errores: number
  duplicados: number
}

interface ProviderTotalsChartProps {
  data: ProviderTotal[]
  isLoading?: boolean
}

const STATE_COLORS: Record<string, { bg: string; label: string }> = {
  pagados: { bg: 'bg-blue-500', label: 'Pagados' },
  confirmados: { bg: 'bg-emerald-500', label: 'Confirmados' },
  pendientes: { bg: 'bg-amber-400', label: 'Pendientes' },
  errores: { bg: 'bg-red-500', label: 'Errores' },
  duplicados: { bg: 'bg-slate-400', label: 'Duplicados' },
}

export function ProviderTotalsChart({ data, isLoading }: ProviderTotalsChartProps) {
  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">
            Top proveedores (7 días)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-pulse h-32 w-full rounded-md bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasData = data && data.length > 0
  const items = data.slice(0, 8)
  const maxCount = items.length > 0 ? Math.max(...items.map((d) => d.count)) : 0

  // Detect which states are present across all data
  const activeStates = (['pagados', 'confirmados', 'pendientes', 'errores', 'duplicados'] as const).filter(
    (state) => items.some((d) => d[state] > 0)
  )

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium">
          Top proveedores (7 días)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {!hasData ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
            Sin datos
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.proveedorId}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-slate-700 truncate max-w-[60%]" title={item.proveedor}>
                    {item.proveedor}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                    <span>{item.count} docs</span>
                    <span className="font-medium text-slate-700">{formatCurrency(item.total)}</span>
                  </div>
                </div>
                {/* Stacked bar: ancho total proporcional a maxCount, interior proporcional al estado */}
                <div className="h-2.5 rounded-full overflow-hidden bg-slate-100">
                  <div
                    className="flex h-full rounded-full overflow-hidden"
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  >
                    {(['pagados', 'confirmados', 'pendientes', 'errores', 'duplicados'] as const).map((state) => {
                      const value = item[state]
                      if (value === 0) return null
                      const widthPercent = (value / item.count) * 100
                      const stateConfig = STATE_COLORS[state]!
                      return (
                        <div
                          key={state}
                          className={`${stateConfig.bg}`}
                          style={{ width: `${widthPercent}%` }}
                          title={`${stateConfig.label}: ${value}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Legend */}
            {activeStates.length > 1 && (
              <div className="flex items-center gap-3 pt-1 border-t mt-2">
                {activeStates.map((state) => {
                  const cfg = STATE_COLORS[state]!
                  return (
                    <div key={state} className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${cfg.bg}`} />
                      <span className="text-[10px] text-slate-500">{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
