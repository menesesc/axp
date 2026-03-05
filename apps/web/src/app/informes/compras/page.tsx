'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ReportLayout } from '@/components/informes/report-layout'
import { useUser } from '@/hooks/use-user'
import { formatCurrency } from '@/lib/utils'
import type { ReportFilters } from '@/components/informes/report-layout'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TrendingUp,
  TrendingDown,
  Package,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function formatMonth(mes: string) {
  const [year, month] = mes.split('-')
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${months[parseInt(month!) - 1]} ${year!.slice(2)}`
}

export default function ComprasPage() {
  const { clienteId } = useUser()
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [filters, setFilters] = useState<ReportFilters>({
    desde: monthStart.toISOString().split('T')[0]!,
    hasta: today.toISOString().split('T')[0]!,
    proveedorId: '',
  })

  const { data: proveedoresData } = useQuery<{ proveedores: any[] }>({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 60000,
  })

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.desde) params.set('desde', filters.desde)
    if (filters.hasta) params.set('hasta', filters.hasta)
    if (filters.proveedorId) params.set('proveedorId', filters.proveedorId)
    return params.toString()
  }, [filters])

  const { data, isLoading } = useQuery({
    queryKey: ['informe-compras', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/informes/compras?${queryString}`)
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    enabled: !!clienteId && !!filters.desde && !!filters.hasta,
    staleTime: 60000,
  })

  return (
    <ReportLayout
      title="Compras por Proveedor"
      description="Análisis de gasto y detalle de compras"
      filters={filters}
      onFiltersChange={setFilters}
      showProveedorFilter
      proveedores={proveedoresData?.proveedores || []}
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Total */}
          <div className="bg-white border rounded-lg p-5">
            <p className="text-sm text-slate-500">Total del período</p>
            <p className="text-3xl font-bold text-slate-900">{formatCurrency(data.totalGeneral)}</p>
          </div>

          {/* Gráfico mensual */}
          {data.gastoMensualChart.length > 0 && (
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Gasto Mensual</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.gastoMensualChart}>
                  <XAxis dataKey="mes" tickFormatter={formatMonth} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(value), 'Total']}
                    labelFormatter={(label: any) => formatMonth(String(label))}
                  />
                  <Bar
                    dataKey="total"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ranking proveedores */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="p-5 border-b">
              <h3 className="font-semibold text-slate-900">Ranking de Proveedores</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-5 py-3 font-medium text-slate-600">#</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Proveedor</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Total</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">% Gasto</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Docs</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">Items</th>
                  <th className="text-right px-5 py-3 font-medium text-slate-600">vs Anterior</th>
                </tr>
              </thead>
              <tbody>
                {data.ranking.map((r: any, i: number) => (
                  <tr key={r.proveedor_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-5 py-3 font-medium">{r.razon_social}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.total)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min(r.porcentaje, 100)}%` }}
                          />
                        </div>
                        {r.porcentaje}%
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-500">{r.cantidad}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{r.total_items}</td>
                    <td className="px-5 py-3 text-right">
                      {r.variacion !== 0 && (
                        <span className={`flex items-center justify-end gap-0.5 text-sm ${r.variacion > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {r.variacion > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {r.variacion > 0 ? '+' : ''}{r.variacion}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top items */}
          {data.topItems.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-slate-900">Items Más Comprados</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Descripción</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Proveedor</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Cantidad</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Subtotal</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Compras</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.map((item: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-medium max-w-[250px] truncate" title={item.descripcion}>
                        {item.descripcion}
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">{item.proveedor}</td>
                      <td className="px-5 py-2.5 text-right">{item.cantidad_total.toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(item.subtotal_total)}</td>
                      <td className="px-5 py-2.5 text-right text-slate-500">{item.compras}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.ranking.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>Sin datos de compras en el período seleccionado</p>
            </div>
          )}
        </div>
      ) : null}
    </ReportLayout>
  )
}
