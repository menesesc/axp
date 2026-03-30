'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Clock, CheckCircle, DollarSign, Sparkles } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface KpiCardsProps {
  documentosHoy: number
  pendientes: number
  confirmados: number
  montoPendiente: number
  confidencePromedio: number
  confidencePorDia?: { date: string; score: number }[]
  documentosEsteMes?: number
  documentosMesLimite?: number | null
  isLoading?: boolean
}

export function KpiCards({
  documentosHoy,
  pendientes,
  confirmados,
  montoPendiente,
  confidencePromedio,
  confidencePorDia = [],
  documentosEsteMes = 0,
  documentosMesLimite,
  isLoading,
}: KpiCardsProps) {
  const porcentajeUsado = documentosMesLimite
    ? Math.min(100, Math.round((documentosEsteMes / documentosMesLimite) * 100))
    : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Documentos Hoy */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-slate-500">Hoy</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : documentosHoy.toLocaleString('es-AR')}
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

      {/* A Pagar */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-500">A Pagar</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums truncate">
                {isLoading ? '-' : formatCurrency(montoPendiente)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {isLoading ? '' : `${confirmados} doc${confirmados !== 1 ? 's' : ''} pendientes`}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-orange-50">
              <DollarSign className="h-4 w-4 text-orange-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confianza OCR con Sparkline */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500">Confianza OCR</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                {isLoading ? '-' : `${confidencePromedio.toFixed(0)}%`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Promedio 30 días</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50">
              <Sparkles className="h-4 w-4 text-blue-600" />
            </div>
          </div>
          {!isLoading && confidencePorDia.length > 1 && (
            <div className="mt-2 h-10">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={confidencePorDia}>
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
