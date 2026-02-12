'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUser } from '@/hooks/use-user'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  TrendingUp,
  BarChart3,
  FileText,
  Filter,
  X,
  Calendar,
  Loader2,
} from 'lucide-react'

function PdfButton({ pdfKey }: { pdfKey: string | null }) {
  const [isLoading, setIsLoading] = useState(false)

  const openPdf = async () => {
    if (!pdfKey) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/pdf?key=${encodeURIComponent(pdfKey)}`)
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      window.open(data.url, '_blank')
    } catch {
      toast.error('Error al abrir el PDF')
    } finally {
      setIsLoading(false)
    }
  }

  if (!pdfKey) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={openPdf}
      disabled={isLoading}
      className="h-8 w-8 text-slate-500 hover:text-blue-600"
      title="Ver PDF"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
    </Button>
  )
}

interface Item {
  id: string
  linea: number
  descripcion: string
  codigo: string | null
  cantidad: number | null
  unidad: string | null
  precioUnitario: number | null
  subtotal: number | null
  documento: {
    id: string
    tipo: string
    letra: string | null
    numeroCompleto: string | null
    fechaEmision: string | null
    pdfKey: string | null
  }
  proveedor: {
    id: string
    razonSocial: string
  } | null
}

interface ItemsResponse {
  items: Item[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  totals: {
    subtotal: number
    cantidad: number
    count: number
  }
}

interface PricePoint {
  fecha: string
  precio: number
}

interface ItemStats {
  byProvider: Array<{
    proveedorId: string | null
    proveedor: string
    totalItems: number
    totalCantidad: number
    totalSubtotal: number
  }>
  topItems: Array<{
    descripcion: string
    totalCantidad: number
    totalSubtotal: number
    proveedores: number
    priceHistory: PricePoint[]
  }>
  monthlyTrend: Array<{
    mes: string
    totalItems: number
    totalSubtotal: number
  }>
}

// Sparkline component - minimalist line chart
function Sparkline({ data, width = 80, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (!data.length || data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  // Normalize data to fit in height
  const normalized = data.map(v => ((v - min) / range) * (height - 4) + 2)

  // Create path
  const stepX = width / (data.length - 1)
  const points = normalized.map((y, i) => `${i * stepX},${height - y}`).join(' ')

  // Color based on trend (first vs last)
  const trend = data[data.length - 1] - data[0]
  const color = trend > 0 ? '#ef4444' : trend < 0 ? '#10b981' : '#94a3b8'

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={(data.length - 1) * stepX}
        cy={height - normalized[normalized.length - 1]}
        r="2"
        fill={color}
      />
    </svg>
  )
}

interface Proveedor {
  id: string
  razonSocial: string
}

type QuickDateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth'

function getDateRange(filter: QuickDateFilter): { desde: string; hasta: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  switch (filter) {
    case 'today':
      return { desde: formatDate(today), hasta: formatDate(today) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { desde: formatDate(yesterday), hasta: formatDate(yesterday) }
    }
    case 'week': {
      // Esta semana (lunes a hoy)
      const weekStart = new Date(today)
      const day = weekStart.getDay()
      const diff = day === 0 ? 6 : day - 1 // Ajustar para que lunes sea inicio
      weekStart.setDate(weekStart.getDate() - diff)
      return { desde: formatDate(weekStart), hasta: formatDate(today) }
    }
    case 'lastWeek': {
      // Semana anterior (lunes a domingo)
      const lastWeekEnd = new Date(today)
      const day = lastWeekEnd.getDay()
      const diffToLastSunday = day === 0 ? 7 : day
      lastWeekEnd.setDate(lastWeekEnd.getDate() - diffToLastSunday)
      const lastWeekStart = new Date(lastWeekEnd)
      lastWeekStart.setDate(lastWeekStart.getDate() - 6)
      return { desde: formatDate(lastWeekStart), hasta: formatDate(lastWeekEnd) }
    }
    case 'month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      return { desde: formatDate(monthStart), hasta: formatDate(today) }
    }
    case 'lastMonth': {
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      return { desde: formatDate(lastMonthStart), hasta: formatDate(lastMonthEnd) }
    }
    default:
      return { desde: '', hasta: '' }
  }
}

export default function ItemsPage() {
  const { clienteId } = useUser()
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [proveedorId, setProveedorId] = useState<string>('')
  const [quickDateFilter, setQuickDateFilter] = useState<QuickDateFilter>('all')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const pageSize = 50

  // Proper debounce with useEffect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Apply quick date filter
  const applyQuickDateFilter = (filter: QuickDateFilter) => {
    setQuickDateFilter(filter)
    const { desde, hasta } = getDateRange(filter)
    setFechaDesde(desde)
    setFechaHasta(hasta)
    setPage(1)
  }

  // Fetch proveedores
  const { data: proveedoresData } = useQuery<{ proveedores: Proveedor[] }>({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Failed to fetch proveedores')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 60000,
  })

  // Build query params - memoized
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: pageSize.toString(),
    })
    if (debouncedQuery) params.set('q', debouncedQuery)
    if (proveedorId) params.set('proveedorId', proveedorId)
    if (fechaDesde) params.set('fechaDesde', fechaDesde)
    if (fechaHasta) params.set('fechaHasta', fechaHasta)
    return params.toString()
  }, [page, pageSize, debouncedQuery, proveedorId, fechaDesde, fechaHasta])

  // Fetch items
  const { data, isLoading, isFetching } = useQuery<ItemsResponse>({
    queryKey: ['items', queryString],
    queryFn: async () => {
      const res = await fetch(`/api/items?${queryString}`)
      if (!res.ok) throw new Error('Failed to fetch items')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 30000,
    placeholderData: (prev) => prev, // Keep previous data while loading
  })

  // Stats params - memoized
  const statsString = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    if (proveedorId) params.set('proveedorId', proveedorId)
    if (fechaDesde) params.set('fechaDesde', fechaDesde)
    if (fechaHasta) params.set('fechaHasta', fechaHasta)
    return params.toString()
  }, [debouncedQuery, proveedorId, fechaDesde, fechaHasta])

  // Fetch stats
  const { data: stats } = useQuery<ItemStats>({
    queryKey: ['itemStats', statsString],
    queryFn: async () => {
      const res = await fetch(`/api/items/stats?${statsString}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 30000,
  })

  const clearFilters = () => {
    setSearchQuery('')
    setDebouncedQuery('')
    setProveedorId('')
    setQuickDateFilter('all')
    setFechaDesde('')
    setFechaHasta('')
    setPage(1)
  }

  const hasFilters = debouncedQuery || proveedorId || fechaDesde || fechaHasta
  const proveedores = proveedoresData?.proveedores?.filter((p: Proveedor) => p) || []

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">No tienes acceso</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header
          title="Búsqueda de Items"
          description="Busca y analiza items de tus documentos"
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Package className="h-4 w-4" />
              Items encontrados
            </div>
            <p className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-7 w-16" /> : (data?.totals.count || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <TrendingUp className="h-4 w-4" />
              Cantidad total
            </div>
            <p className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-7 w-20" /> : (data?.totals.cantidad || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-4 col-span-2">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <BarChart3 className="h-4 w-4" />
              Subtotal
            </div>
            <p className="text-2xl font-semibold text-emerald-600">
              {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(data?.totals.subtotal || 0)}
            </p>
          </div>
        </div>

        {/* Search and Quick Filters */}
        <div className="bg-white border rounded-lg p-4 space-y-4">
          {/* Quick date filters */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-slate-500 flex items-center gap-1 mr-2">
              <Calendar className="h-4 w-4" />
              Período:
            </span>
            {[
              { value: 'all' as const, label: 'Todo' },
              { value: 'today' as const, label: 'Hoy' },
              { value: 'yesterday' as const, label: 'Ayer' },
              { value: 'week' as const, label: 'Semana' },
              { value: 'lastWeek' as const, label: 'Sem. Ant.' },
              { value: 'month' as const, label: 'Mes' },
              { value: 'lastMonth' as const, label: 'Mes Ant.' },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={quickDateFilter === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickDateFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              {isFetching && searchQuery && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Más filtros
              {hasFilters && (
                <Badge variant="outline" className="ml-1">
                  {[debouncedQuery, proveedorId, fechaDesde, fechaHasta].filter(Boolean).length}
                </Badge>
              )}
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">
                  Proveedor
                </label>
                <Select value={proveedorId || 'all'} onValueChange={(v) => { setProveedorId(v === 'all' ? '' : v); setPage(1) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los proveedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proveedores</SelectItem>
                    {proveedores.map((p: Proveedor) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.razonSocial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">
                  Fecha desde
                </label>
                <Input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => {
                    setFechaDesde(e.target.value)
                    setQuickDateFilter('all')
                    setPage(1)
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">
                  Fecha hasta
                </label>
                <Input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => {
                    setFechaHasta(e.target.value)
                    setQuickDateFilter('all')
                    setPage(1)
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content - Items Table */}
          <div className="lg:col-span-3">
            <div className="bg-white border rounded-lg">
              {isLoading && !data ? (
                <div className="p-4 space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !data?.items.length ? (
                <div className="p-12 text-center text-slate-500">
                  <Package className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>No se encontraron items</p>
                  {hasFilters && (
                    <Button variant="link" onClick={clearFilters} className="mt-2">
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">P. Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow key={item.id} className={isFetching ? 'opacity-50' : ''}>
                        <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                          {item.documento.fechaEmision ? formatDate(item.documento.fechaEmision) : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate font-medium" title={item.descripcion}>
                            {item.descripcion}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 max-w-[150px] truncate">
                          {item.proveedor?.razonSocial || '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.cantidad?.toLocaleString() || '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {item.precioUnitario ? formatCurrency(item.precioUnitario) : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {item.subtotal ? formatCurrency(item.subtotal) : '-'}
                        </TableCell>
                        <TableCell>
                          <PdfButton pdfKey={item.documento.pdfKey} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pagination */}
            {data?.pagination && data.pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-slate-500">
                  Mostrando {((data.pagination.page - 1) * pageSize) + 1} a{' '}
                  {Math.min(data.pagination.page * pageSize, data.pagination.total)} de{' '}
                  {data.pagination.total.toLocaleString()} items
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  <span className="text-sm text-slate-500 px-2">
                    {page} / {data.pagination.pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= data.pagination.pages}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Stats */}
          <div className="space-y-6">
            {/* Top Providers */}
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Top Proveedores
              </h3>
              {stats?.byProvider.slice(0, 5).map((prov, i) => (
                <div
                  key={prov.proveedorId || i}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{prov.proveedor}</p>
                    <p className="text-xs text-slate-400">{prov.totalItems} items</p>
                  </div>
                  <p className="text-sm font-medium text-emerald-600 ml-2">
                    {formatCurrency(prov.totalSubtotal)}
                  </p>
                </div>
              ))}
              {!stats?.byProvider.length && (
                <p className="text-sm text-slate-400">Sin datos</p>
              )}
            </div>

            {/* Top Items */}
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Items más comprados
              </h3>
              {stats?.topItems.slice(0, 5).map((item, i) => (
                <div
                  key={i}
                  className="py-2 border-b last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate flex-1" title={item.descripcion}>
                      {item.descripcion}
                    </p>
                    {item.priceHistory?.length >= 2 && (
                      <Sparkline
                        data={item.priceHistory.map(p => p.precio)}
                        width={60}
                        height={20}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>{item.totalCantidad.toLocaleString()} unid.</span>
                    <span className="text-emerald-600 font-medium">
                      {formatCurrency(item.totalSubtotal)}
                    </span>
                  </div>
                </div>
              ))}
              {!stats?.topItems.length && (
                <p className="text-sm text-slate-400">Sin datos</p>
              )}
            </div>

            {/* Price Trend Chart */}
            {stats?.monthlyTrend && stats.monthlyTrend.length > 0 && (
              <div className="bg-white border rounded-lg p-4">
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Tendencia mensual
                </h3>
                <div className="space-y-2">
                  {stats.monthlyTrend.slice(-6).map((month) => {
                    const maxValue = Math.max(...stats.monthlyTrend.map(m => m.totalSubtotal))
                    const percentage = maxValue > 0 ? (month.totalSubtotal / maxValue) * 100 : 0
                    return (
                      <div key={month.mes} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">{month.mes}</span>
                          <span className="font-medium">{formatCurrency(month.totalSubtotal)}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
