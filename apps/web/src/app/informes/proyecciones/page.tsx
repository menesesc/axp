'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ReportLayout } from '@/components/informes/report-layout'
import { useUser } from '@/hooks/use-user'
import { formatCurrency } from '@/lib/utils'
import type { ReportFilters } from '@/components/informes/report-layout'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
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

const tendenciaConfig = {
  CRECIENTE: { icon: TrendingUp, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Creciente' },
  ESTABLE: { icon: Minus, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Estable' },
  DECRECIENTE: { icon: TrendingDown, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Decreciente' },
}

export default function ProyeccionesPage() {
  const { clienteId } = useUser()
  const today = new Date()
  const yearStart = new Date(today.getFullYear(), 0, 1)

  const [filters, setFilters] = useState<ReportFilters>({
    desde: yearStart.toISOString().split('T')[0]!,
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
    if (filters.proveedorId) params.set('proveedorId', filters.proveedorId)
    return params.toString()
  }, [filters.proveedorId])

  const { data, isLoading } = useQuery({
    queryKey: ['informe-proyecciones', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/informes/proyecciones?${queryString}`)
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 120000, // 2 min cache (IA es costosa)
  })

  // Combinar datos históricos + proyección para el gráfico
  const chartData = useMemo(() => {
    if (!data) return []
    const historico = (data.gastoMensual || []).map((g: any) => ({
      mes: g.mes,
      real: g.total,
      proyectado: null,
    }))
    const proyectado = (data.proyeccion || []).map((p: any) => ({
      mes: p.mes,
      real: null,
      proyectado: p.total,
    }))
    return [...historico, ...proyectado]
  }, [data])

  const ia = data?.analisisIA
  const tendencia = ia?.tendencia ? tendenciaConfig[ia.tendencia as keyof typeof tendenciaConfig] : null

  return (
    <ReportLayout
      title="Proyecciones con IA"
      description="Predicciones y recomendaciones basadas en inteligencia artificial"
      filters={filters}
      onFiltersChange={setFilters}
      showProveedorFilter
      proveedores={proveedoresData?.proveedores || []}
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-72" />
          <Skeleton className="h-48" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Resumen ejecutivo IA */}
          {ia && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <h3 className="font-semibold text-indigo-900">Análisis Inteligente</h3>
                {tendencia && (
                  <span className={`ml-auto flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-medium ${tendencia.bg} ${tendencia.color}`}>
                    <tendencia.icon className="h-4 w-4" />
                    Tendencia {tendencia.label}
                  </span>
                )}
              </div>
              <p className="text-slate-700 leading-relaxed">{ia.resumenEjecutivo}</p>
              {ia.proyeccionTexto && (
                <p className="text-sm text-indigo-700 mt-3 italic">{ia.proyeccionTexto}</p>
              )}
            </div>
          )}

          {/* KPIs de resumen */}
          {data.resumen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border rounded-lg p-4">
                <p className="text-sm text-slate-500">Último mes</p>
                <p className="text-xl font-bold">{formatCurrency(data.resumen.total_1m)}</p>
              </div>
              <div className="bg-white border rounded-lg p-4">
                <p className="text-sm text-slate-500">Últimos 3 meses</p>
                <p className="text-xl font-bold">{formatCurrency(data.resumen.total_3m)}</p>
              </div>
              <div className="bg-white border rounded-lg p-4">
                <p className="text-sm text-slate-500">Últimos 6 meses</p>
                <p className="text-xl font-bold">{formatCurrency(data.resumen.total_6m)}</p>
              </div>
              <div className="bg-white border rounded-lg p-4">
                <p className="text-sm text-slate-500">Último año</p>
                <p className="text-xl font-bold">{formatCurrency(data.resumen.total_12m)}</p>
              </div>
            </div>
          )}

          {/* Gráfico histórico + proyección */}
          {chartData.length > 0 && (
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold text-slate-900 mb-1">Gasto Histórico y Proyección</h3>
              <p className="text-sm text-slate-500 mb-4">Barras = real | Línea punteada = proyectado</p>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData}>
                  <XAxis dataKey="mes" tickFormatter={formatMonth} tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any, name: any) => [
                      formatCurrency(value),
                      name === 'real' ? 'Real' : 'Proyectado',
                    ]}
                    labelFormatter={(label: any) => formatMonth(String(label))}
                  />
                  <Bar dataKey="real" fill="#3b82f6" radius={[4, 4, 0, 0]} name="real" />
                  <Line
                    type="monotone"
                    dataKey="proyectado"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    strokeDasharray="8 4"
                    dot={{ r: 5, fill: '#8b5cf6' }}
                    name="proyectado"
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Alertas y Recomendaciones de IA */}
          {ia && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Alertas */}
              {ia.alertas?.length > 0 && (
                <div className="bg-white border rounded-lg p-5">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Puntos de Atención
                  </h3>
                  <div className="space-y-3">
                    {ia.alertas.map((alerta: string, i: number) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-xs font-bold">
                          {i + 1}
                        </div>
                        <p className="text-slate-700">{alerta}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recomendaciones */}
              {ia.recomendaciones?.length > 0 && (
                <div className="bg-white border rounded-lg p-5">
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-blue-500" />
                    Recomendaciones
                  </h3>
                  <div className="space-y-3">
                    {ia.recomendaciones.map((rec: string, i: number) => (
                      <div key={i} className="flex gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-xs font-bold">
                          {i + 1}
                        </div>
                        <p className="text-slate-700">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Variaciones de precios significativas */}
          {data.variacionesPrecios?.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-slate-900">Variaciones de Precios Detectadas</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Item</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Proveedor</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Anterior</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Actual</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {data.variacionesPrecios.slice(0, 10).map((v: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-medium max-w-[200px] truncate">{v.descripcion}</td>
                      <td className="px-5 py-2.5 text-slate-600">{v.proveedor}</td>
                      <td className="px-5 py-2.5 text-right">{formatCurrency(v.precio_anterior)}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(v.precio_actual)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={`font-bold ${v.variacion_pct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {v.variacion_pct > 0 ? '+' : ''}{v.variacion_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top proveedores tendencia */}
          {data.topProveedores?.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-slate-900">Tendencia por Proveedor (6m vs 3m)</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Proveedor</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Últimos 6 meses</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Últimos 3 meses</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Tendencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProveedores.map((p: any, i: number) => {
                    const ratio = p.total_6m > 0 ? (p.total_3m / (p.total_6m / 2)) : 0
                    const tendencia = ratio > 1.1 ? 'up' : ratio < 0.9 ? 'down' : 'stable'
                    return (
                      <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium">{p.proveedor}</td>
                        <td className="px-5 py-3 text-right">{formatCurrency(p.total_6m)}</td>
                        <td className="px-5 py-3 text-right">{formatCurrency(p.total_3m)}</td>
                        <td className="px-5 py-3 text-right">
                          {tendencia === 'up' && <span className="text-red-600 flex items-center justify-end gap-1"><TrendingUp className="h-4 w-4" /> Creciente</span>}
                          {tendencia === 'down' && <span className="text-emerald-600 flex items-center justify-end gap-1"><TrendingDown className="h-4 w-4" /> Decreciente</span>}
                          {tendencia === 'stable' && <span className="text-blue-600 flex items-center justify-end gap-1"><Minus className="h-4 w-4" /> Estable</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!ia && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              El análisis con IA no está disponible en este momento. Se muestran los datos estadísticos sin análisis narrativo.
            </div>
          )}
        </div>
      ) : null}
    </ReportLayout>
  )
}
