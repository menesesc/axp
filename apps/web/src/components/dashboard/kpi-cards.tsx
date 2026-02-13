'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { ConfidenceAverage } from '@/components/ui/confidence-badge'
import { FileText, Clock, CheckCircle, CreditCard, Sparkles } from 'lucide-react'

interface KpiCardsProps {
  totalDocumentos: number
  pendientes: number
  confirmados: number
  pagados: number
  confidencePromedio: number
  documentosEsteMes?: number
  documentosMesLimite?: number | null
  isLoading?: boolean
}

export function KpiCards({
  totalDocumentos,
  pendientes,
  confirmados,
  pagados,
  confidencePromedio,
  documentosEsteMes = 0,
  documentosMesLimite,
  isLoading,
}: KpiCardsProps) {
  const porcentajeUsado = documentosMesLimite
    ? Math.min(100, Math.round((documentosEsteMes / documentosMesLimite) * 100))
    : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Total Documentos */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-slate-500">Documentos</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : totalDocumentos.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {documentosMesLimite
                  ? `${documentosEsteMes} / ${documentosMesLimite} este mes`
                  : `${documentosEsteMes} este mes`}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-100">
              <FileText className="h-4 w-4 text-slate-600" />
            </div>
          </div>
          {documentosMesLimite && !isLoading && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">Uso del plan</span>
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

      {/* Pendientes */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Pendientes</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : pendientes.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Por revisar</p>
            </div>
            <div className="p-2 rounded-lg bg-amber-50">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmados */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Confirmados</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : confirmados.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Listos para pagar</p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pagados */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Pagados</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : pagados.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Con orden de pago</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50">
              <CreditCard className="h-4 w-4 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

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
