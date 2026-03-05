'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ReportLayout } from '@/components/informes/report-layout'
import { useUser } from '@/hooks/use-user'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ReportFilters } from '@/components/informes/report-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import {
  AlertTriangle,
  TrendingUp,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function AlertSection({
  title,
  items,
  severity,
}: {
  title: string
  items: any[]
  severity: 'critical' | 'warning' | 'info' | 'success'
}) {
  if (!items.length) return null

  const styles = {
    critical: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700' },
    info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
    success: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
  }
  const s = styles[severity]

  return (
    <div className={`border rounded-lg p-4 ${s.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className={`h-4 w-4 ${s.text}`} />
        <h4 className={`font-semibold text-sm ${s.text}`}>{title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full ${s.badge}`}>{items.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-current/10">
              <th className={`text-left py-2 ${s.text} font-medium`}>Item</th>
              <th className={`text-left py-2 ${s.text} font-medium`}>Proveedor</th>
              <th className={`text-right py-2 ${s.text} font-medium`}>Precio Ant.</th>
              <th className={`text-right py-2 ${s.text} font-medium`}>Precio Act.</th>
              <th className={`text-right py-2 ${s.text} font-medium`}>Variación</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, i: number) => (
              <tr key={i} className="border-b border-current/5 last:border-0">
                <td className="py-2 max-w-[200px] truncate font-medium" title={item.descripcion}>
                  <Link
                    href={`/items?q=${encodeURIComponent(item.descripcion)}`}
                    className="hover:underline inline-flex items-center gap-1"
                  >
                    {item.descripcion}
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </Link>
                </td>
                <td className="py-2 text-sm opacity-80">{item.proveedor}</td>
                <td className="py-2 text-right text-sm opacity-80">{formatCurrency(item.precio_anterior)}</td>
                <td className="py-2 text-right font-medium">{formatCurrency(item.precio_actual)}</td>
                <td className="py-2 text-right">
                  <span className={`inline-flex items-center gap-0.5 font-bold ${s.text}`}>
                    {item.variacion_pct > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {item.variacion_pct > 0 ? '+' : ''}{item.variacion_pct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PreciosPage() {
  const { clienteId } = useUser()
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [filters, setFilters] = useState<ReportFilters>({
    desde: monthStart.toISOString().split('T')[0]!,
    hasta: today.toISOString().split('T')[0]!,
    proveedorId: '',
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)

  // Rangos configurables con sliders
  const [umbralCritico, setUmbralCritico] = useState(100)
  const [umbralAlto, setUmbralAlto] = useState(50)
  const [umbralModerado, setUmbralModerado] = useState(30)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (filters.desde) params.set('desde', filters.desde)
    if (filters.hasta) params.set('hasta', filters.hasta)
    if (filters.proveedorId) params.set('proveedorId', filters.proveedorId)
    if (searchQuery) params.set('q', searchQuery)
    return params.toString()
  }, [filters, searchQuery])

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

  const { data, isLoading } = useQuery({
    queryKey: ['informe-precios', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/informes/precios?${queryString}`)
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    enabled: !!clienteId && !!filters.desde && !!filters.hasta,
    staleTime: 60000,
  })

  // Clasificar alertas con umbrales configurables (desde datos crudos del API)
  const alertas = useMemo(() => {
    if (!data?.aumentos) return null
    return {
      criticas: data.aumentos.filter((a: any) => a.variacion_pct >= umbralCritico),
      warning: data.aumentos.filter((a: any) => a.variacion_pct >= umbralAlto && a.variacion_pct < umbralCritico),
      info: data.aumentos.filter((a: any) => a.variacion_pct >= umbralModerado && a.variacion_pct < umbralAlto),
      bajas: data.bajas || [],
    }
  }, [data?.aumentos, data?.bajas, umbralCritico, umbralAlto, umbralModerado])

  // Auto-seleccionar el primer item con historial
  const itemsConHistorial = data?.historiales ? Object.keys(data.historiales) : []
  const currentSelected = selectedItem && itemsConHistorial.includes(selectedItem) ? selectedItem : itemsConHistorial[0] || null

  const totalAlertas = alertas ? alertas.criticas.length + alertas.warning.length + alertas.info.length : 0

  return (
    <ReportLayout
      title="Análisis de Precios"
      description="Detecta variaciones de precios y anomalías"
      filters={filters}
      onFiltersChange={setFilters}
      showProveedorFilter
      proveedores={proveedoresData?.proveedores || []}
    >
      {/* Search */}
      <div className="relative mb-6 print:hidden">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Buscar item por descripción..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 max-w-md"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : data && alertas ? (
        <div className="space-y-6">
          {/* Sliders de umbrales */}
          <div className="bg-white border rounded-lg p-5 print:hidden">
            <h3 className="font-semibold text-slate-900 mb-4">Umbrales de Alerta</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-red-700">Crítica</label>
                  <span className="text-sm font-bold text-red-700">&ge; {umbralCritico}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={300}
                  step={10}
                  value={umbralCritico}
                  onChange={(e) => setUmbralCritico(Number(e.target.value))}
                  className="w-full accent-red-600"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-amber-700">Alta</label>
                  <span className="text-sm font-bold text-amber-700">&ge; {umbralAlto}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={umbralCritico - 10}
                  step={5}
                  value={Math.min(umbralAlto, umbralCritico - 10)}
                  onChange={(e) => setUmbralAlto(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-blue-700">Moderada</label>
                  <span className="text-sm font-bold text-blue-700">&ge; {umbralModerado}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={umbralAlto - 5}
                  step={5}
                  value={Math.min(umbralModerado, umbralAlto - 5)}
                  onChange={(e) => setUmbralModerado(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-red-700">{alertas.criticas.length}</p>
              <p className="text-sm text-red-600">Críticas (&ge;{umbralCritico}%)</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-amber-700">{alertas.warning.length}</p>
              <p className="text-sm text-amber-600">Altas (&ge;{umbralAlto}%)</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{alertas.info.length}</p>
              <p className="text-sm text-blue-600">Moderadas (&ge;{umbralModerado}%)</p>
            </div>
          </div>

          {/* Alertas */}
          <AlertSection title={`Aumentos críticos (más del ${umbralCritico}%)`} items={alertas.criticas} severity="critical" />
          <AlertSection title={`Aumentos altos (${umbralAlto}% - ${umbralCritico}%)`} items={alertas.warning} severity="warning" />
          <AlertSection title={`Aumentos moderados (${umbralModerado}% - ${umbralAlto}%)`} items={alertas.info} severity="info" />
          {alertas.bajas.length > 0 && (
            <AlertSection title="Bajas de precio (más del -30%)" items={alertas.bajas} severity="success" />
          )}

          {/* Historial de precios */}
          {itemsConHistorial.length > 0 && (
            <div className="bg-white border rounded-lg p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Evolución de Precio</h3>
              <div className="flex flex-wrap gap-2 mb-4 print:hidden">
                {itemsConHistorial.map((item) => (
                  <button
                    key={item}
                    onClick={() => setSelectedItem(item)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      (currentSelected === item)
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item.length > 30 ? item.slice(0, 30) + '...' : item}
                  </button>
                ))}
              </div>
              {currentSelected && data.historiales[currentSelected] && (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.historiales[currentSelected]}>
                    <XAxis
                      dataKey="fecha"
                      tickFormatter={(v) => {
                        const d = new Date(v)
                        return `${d.getDate()}/${d.getMonth() + 1}`
                      }}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis tickFormatter={(v) => `$${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: any) => [formatCurrency(value), 'Precio']}
                      labelFormatter={(v: any) => formatDate(v)}
                    />
                    <Line
                      type="monotone"
                      dataKey="precio"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Comparativo entre proveedores */}
          {data.comparativo.length > 0 && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-5 border-b">
                <h3 className="font-semibold text-slate-900">Comparativo entre Proveedores</h3>
                <p className="text-sm text-slate-500">Items comprados a más de un proveedor</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Item</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Proveedor</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Precio Prom.</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Último Precio</th>
                    <th className="text-right px-5 py-3 font-medium text-slate-600">Compras</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparativo.map((row: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-2.5 font-medium max-w-[200px] truncate">
                        <Link
                          href={`/items?q=${encodeURIComponent(row.descripcion)}`}
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          {row.descripcion}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </Link>
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">{row.proveedor}</td>
                      <td className="px-5 py-2.5 text-right">{formatCurrency(row.precio_promedio)}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatCurrency(row.ultimo_precio)}</td>
                      <td className="px-5 py-2.5 text-right text-slate-500">{row.compras}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {totalAlertas === 0 && data.comparativo.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Sin variaciones significativas</p>
              <p className="text-sm">No se detectaron cambios de precio mayores al {umbralModerado}%</p>
            </div>
          )}
        </div>
      ) : null}
    </ReportLayout>
  )
}
