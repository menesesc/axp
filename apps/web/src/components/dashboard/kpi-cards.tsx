'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { ConfidenceAverage } from '@/components/ui/confidence-badge'
import { FileText, Clock, CheckCircle, Sparkles } from 'lucide-react'

interface KpiCardsProps {
  totalDocumentos: number
  pendientes: number
  confirmados: number
  confidencePromedio: number
  documentosEsteMes?: number
  documentosMesLimite?: number | null
  isLoading?: boolean
}

export function KpiCards({
  totalDocumentos,
  pendientes,
  confirmados,
  confidencePromedio,
  documentosEsteMes = 0,
  documentosMesLimite,
  isLoading,
}: KpiCardsProps) {
  const porcentajeUsado = documentosMesLimite
    ? Math.min(100, Math.round((documentosEsteMes / documentosMesLimite) * 100))
    : 0

  const kpis = [
    {
      label: 'Pendientes',
      value: pendientes,
      icon: Clock,
      description: 'Por confirmar',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Confirmados',
      value: confirmados,
      icon: CheckCircle,
      description: 'Listos para contabilidad',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Documentos Card con límite */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-slate-500">Documentos</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : (
                  documentosMesLimite
                    ? `${documentosEsteMes} / ${documentosMesLimite}`
                    : documentosEsteMes.toLocaleString('es-AR')
                )}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {documentosMesLimite ? 'Límite este mes' : 'Este mes'}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-100">
              <FileText className="h-4 w-4 text-slate-600" />
            </div>
          </div>
          {documentosMesLimite && !isLoading && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">{totalDocumentos.toLocaleString('es-AR')} total en sistema</span>
                <span className="font-medium text-slate-700">{porcentajeUsado}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    porcentajeUsado >= 90 ? 'bg-red-500' : porcentajeUsado >= 75 ? 'bg-amber-500' : 'bg-slate-600'
                  )}
                  style={{ width: `${porcentajeUsado}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {kpis.map((kpi) => {
        const Icon = kpi.icon
        return (
          <Card key={kpi.label} className="border shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{kpi.label}</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                    {isLoading ? '-' : kpi.value.toLocaleString('es-AR')}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{kpi.description}</p>
                </div>
                <div className={cn('p-2 rounded-lg', kpi.bgColor)}>
                  <Icon className={cn('h-4 w-4', kpi.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* Confidence Card */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-slate-500">Confianza OCR</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : `${confidencePromedio.toFixed(0)}%`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Promedio últimos 30 días</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50">
              <Sparkles className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          <div className="mt-3">
            <ConfidenceAverage score={confidencePromedio} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
