'use client'

import { cn, formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Clock, CheckCircle, DollarSign, Sparkles, Users, ShoppingCart, Package, TrendingUp } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

// ─── Shared KPI Card ───

function KpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconBg,
  iconColor,
  children,
  isLoading,
}: {
  label: string
  value: string
  subtitle?: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  children?: React.ReactNode
  isLoading?: boolean
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums truncate">
              {isLoading ? '-' : value}
            </p>
            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className={cn('p-2 rounded-lg', iconBg)}>
            <Icon className={cn('h-4 w-4', iconColor)} />
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

// ─── Operations KPIs ───

interface OperationsKpisProps {
  documentosHoy: number
  pendientes: number
  confidencePromedio: number
  confidencePorDia?: { date: string; score: number }[]
  documentosEsteMes?: number
  documentosMesLimite?: number | null
  isLoading?: boolean
}

export function OperationsKpis({
  documentosHoy,
  pendientes,
  confidencePromedio,
  confidencePorDia = [],
  documentosEsteMes = 0,
  documentosMesLimite,
  isLoading,
}: OperationsKpisProps) {
  const porcentajeUsado = documentosMesLimite
    ? Math.min(100, Math.round((documentosEsteMes / documentosMesLimite) * 100))
    : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label="Hoy"
        value={documentosHoy.toLocaleString('es-AR')}
        subtitle={
          documentosMesLimite
            ? `${documentosEsteMes} / ${documentosMesLimite} este mes`
            : `${documentosEsteMes} este mes`
        }
        icon={FileText}
        iconBg="bg-slate-100"
        iconColor="text-slate-600"
        isLoading={isLoading}
      >
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
      </KpiCard>

      <KpiCard
        label="Pendientes"
        value={pendientes.toLocaleString('es-AR')}
        subtitle="Por revisar"
        icon={Clock}
        iconBg="bg-amber-50"
        iconColor="text-amber-600"
        isLoading={isLoading}
      />

      <KpiCard
        label="Confianza OCR"
        value={`${confidencePromedio.toFixed(0)}%`}
        subtitle="Promedio 30 días"
        icon={Sparkles}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        isLoading={isLoading}
      >
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
      </KpiCard>
    </div>
  )
}

// ─── Finance KPIs ───

interface FinanceKpisProps {
  confirmados: number
  montoPendiente: number
  proveedoresConSaldo: number
  isLoading?: boolean
}

export function FinanceKpis({
  confirmados,
  montoPendiente,
  proveedoresConSaldo,
  isLoading,
}: FinanceKpisProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label="Confirmados"
        value={confirmados.toLocaleString('es-AR')}
        subtitle="Listos para pagar"
        icon={CheckCircle}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        isLoading={isLoading}
      />

      <KpiCard
        label="A Pagar"
        value={formatCurrency(montoPendiente)}
        subtitle={isLoading ? '' : `${confirmados} doc${confirmados !== 1 ? 's' : ''} pendientes`}
        icon={DollarSign}
        iconBg="bg-orange-50"
        iconColor="text-orange-600"
        isLoading={isLoading}
      />

      <KpiCard
        label="Proveedores con saldo"
        value={proveedoresConSaldo.toLocaleString('es-AR')}
        subtitle="Con deuda activa"
        icon={Users}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        isLoading={isLoading}
      />
    </div>
  )
}

// ─── Purchasing KPIs ───

interface PurchasingKpisProps {
  compradoEsteMes: number
  itemsActivos: number
  alertasPrecios: number
  isLoading?: boolean
}

export function PurchasingKpis({
  compradoEsteMes,
  itemsActivos,
  alertasPrecios,
  isLoading,
}: PurchasingKpisProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label="Comprado este mes"
        value={formatCurrency(compradoEsteMes)}
        subtitle="Total facturado"
        icon={ShoppingCart}
        iconBg="bg-violet-50"
        iconColor="text-violet-600"
        isLoading={isLoading}
      />

      <KpiCard
        label="Items activos"
        value={itemsActivos.toLocaleString('es-AR')}
        subtitle="Productos/servicios"
        icon={Package}
        iconBg="bg-slate-100"
        iconColor="text-slate-600"
        isLoading={isLoading}
      />

      <KpiCard
        label="Alertas de precio"
        value={alertasPrecios.toLocaleString('es-AR')}
        subtitle="Variación > 30%"
        icon={TrendingUp}
        iconBg={alertasPrecios > 0 ? 'bg-red-50' : 'bg-emerald-50'}
        iconColor={alertasPrecios > 0 ? 'text-red-600' : 'text-emerald-600'}
        isLoading={isLoading}
      />
    </div>
  )
}
