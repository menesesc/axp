'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ReportLayout } from '@/components/informes/report-layout'
import { useUser } from '@/hooks/use-user'
import { formatCurrency } from '@/lib/utils'
import type { ReportFilters } from '@/components/informes/report-layout'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DollarSign,
  FileText,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']

function formatMonth(mes: string) {
  const [year, month] = mes.split('-')
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${months[parseInt(month!) - 1]} ${year!.slice(2)}`
}

function KpiCard({
  label,
  value,
  icon: Icon,
  variacion,
  color = 'text-slate-900',
}: {
  label: string
  value: string
  icon: React.ComponentType<any>
  variacion?: number
  color?: string
}) {
  return (
    <div className="bg-white border rounded-lg p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-500">{label}</span>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {variacion !== undefined && variacion !== 0 && (
        <div className={`flex items-center gap-1 mt-1 text-sm ${variacion > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {variacion > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          {variacion > 0 ? '+' : ''}{variacion}% vs período anterior
        </div>
      )}
    </div>
  )
}

function AlertCard({
  title,
  items,
  severity,
}: {
  title: string
  items: Array<{ descripcion: string; proveedor: string; precio_anterior: number; precio_actual: number; variacion_pct: number }>
  severity: 'critical' | 'warning' | 'info'
}) {
  if (!items.length) return null

  const colors = {
    critical: 'border-red-200 bg-red-50',
    warning: 'border-amber-200 bg-amber-50',
    info: 'border-blue-200 bg-blue-50',
  }
  const textColors = {
    critical: 'text-red-800',
    warning: 'text-amber-800',
    info: 'text-blue-800',
  }

  return (
    <div className={`border rounded-lg p-4 ${colors[severity]}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className={`h-4 w-4 ${textColors[severity]}`} />
        <h4 className={`font-medium text-sm ${textColors[severity]}`}>{title}</h4>
        <span className={`text-xs ${textColors[severity]} opacity-70`}>({items.length})</span>
      </div>
      <div className="space-y-2">
        {items.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="min-w-0 flex-1">
              <span className="font-medium truncate block">{item.descripcion}</span>
              <span className="text-xs opacity-70">{item.proveedor}</span>
            </div>
            <div className="text-right ml-4">
              <span className="text-xs opacity-70">{formatCurrency(item.precio_anterior)}</span>
              <span className="mx-1">→</span>
              <span className="font-medium">{formatCurrency(item.precio_actual)}</span>
              <span className={`ml-2 font-bold ${textColors[severity]}`}>+{item.variacion_pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ResumenEjecutivoPage() {
  const { clienteId } = useUser()
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [filters, setFilters] = useState<ReportFilters>({
    desde: monthStart.toISOString().split('T')[0]!,
    hasta: today.toISOString().split('T')[0]!,
  })

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.desde) params.set('desde', filters.desde)
    if (filters.hasta) params.set('hasta', filters.hasta)
    return params.toString()
  }, [filters])

  const { data, isLoading } = useQuery({
    queryKey: ['informe-resumen', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/informes/resumen?${queryString}`)
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    enabled: !!clienteId && !!filters.desde && !!filters.hasta,
    staleTime: 60000,
  })

  const pieData = useMemo(() => {
    if (!data?.proveedores) return []
    const top5 = data.proveedores.slice(0, 5)
    const otrosTotal = data.proveedores.slice(5).reduce((s: number, p: any) => s + p.total, 0)
    const result = top5.map((p: any) => ({ name: p.razon_social, value: p.total }))
    if (otrosTotal > 0) result.push({ name: 'Otros', value: otrosTotal })
    return result
  }, [data?.proveedores])

  return (
    <ReportLayout
      title="Resumen Ejecutivo"
      description="Vista panorámica de la situación financiera"
      filters={filters}
      onFiltersChange={setFilters}
    >
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total Facturado"
              value={formatCurrency(data.kpis.totalFacturado)}
              icon={DollarSign}
              variacion={data.kpis.variacionFacturado}
              color="text-slate-900"
            />
            <KpiCard
              label="Total Pagado"
              value={formatCurrency(data.kpis.totalPagado)}
              icon={DollarSign}
              color="text-emerald-600"
            />
            <KpiCard
              label="Saldo Pendiente"
              value={formatCurrency(data.kpis.saldoPendiente)}
              icon={Clock}
              color={data.kpis.saldoPendiente > 0 ? 'text-amber-600' : 'text-emerald-600'}
            />
            <KpiCard
              label="Documentos"
              value={data.kpis.cantidadDocumentos.toLocaleString()}
              icon={FileText}
            />
          </div>

          {/* Alertas */}
          {(data.alertas.preciosCriticos.length > 0 || data.alertas.preciosWarning.length > 0 || data.alertas.documentosVencidos.length > 0) && (
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Alertas
              </h3>

              {data.alertas.documentosVencidos.length > 0 && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-red-800" />
                    <h4 className="font-medium text-sm text-red-800">
                      Documentos vencidos sin pagar ({data.alertas.documentosVencidos.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {data.alertas.documentosVencidos.slice(0, 5).map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{doc.proveedor}</span>
                          <span className="text-xs text-red-700 ml-2">
                            {doc.tipo} {doc.letra && `${doc.letra}-`}{doc.numero_completo || 'S/N'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{formatCurrency(doc.total)}</span>
                          <span className="text-xs text-red-700 ml-2">{doc.dias_vencido}d vencido</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <AlertCard
                title="Aumentos de precio críticos (>100%)"
                items={data.alertas.preciosCriticos}
                severity="critical"
              />
              <AlertCard
                title="Aumentos de precio altos (>50%)"
                items={data.alertas.preciosWarning}
                severity="warning"
              />
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Facturación mensual */}
            <div className="lg:col-span-2 bg-white border rounded-lg p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Facturación Mensual</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.facturacionMensual}>
                  <XAxis dataKey="mes" tickFormatter={formatMonth} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(value), 'Total']}
                    labelFormatter={(label: any) => formatMonth(String(label))}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Distribución por proveedor */}
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Por Proveedor</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {pieData.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]!} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {pieData.slice(0, 5).map((p: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="truncate flex-1">{p.name}</span>
                    <span className="font-medium">{formatCurrency(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla proveedores */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-slate-900">Top Proveedores</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Proveedor</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Total</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">% Gasto</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Docs</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Variación</th>
                </tr>
              </thead>
              <tbody>
                {data.proveedores.map((p: any, i: number) => (
                  <tr key={p.proveedor_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="font-medium">{p.razon_social}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(p.total)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{p.porcentaje}%</td>
                    <td className="px-5 py-3 text-right text-slate-500">{p.cantidad}</td>
                    <td className="px-5 py-3 text-right">
                      {p.variacion !== 0 && (
                        <span className={`flex items-center justify-end gap-0.5 ${p.variacion > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {p.variacion > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {p.variacion > 0 ? '+' : ''}{p.variacion}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </ReportLayout>
  )
}
