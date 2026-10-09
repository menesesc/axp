'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { ATAJOS_LISTADO, periodoDe, type Periodo } from '@/components/ui/periodo'
import { BarraFiltros } from '@/components/ui/barra-filtros'
import { Button } from '@/components/ui/button'
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
import { SECCION } from '@/lib/permisos'
import { CategoriaCell, CategoriasPanel, useCategorias } from '@/components/compras/categorias-panel'
import { LogoProveedor } from '@/components/proveedores/logo-proveedor'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  TrendingUp,
  BarChart3,
  FileText,
  X,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Carrot,
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
    conLogo?: boolean
  } | null
  categoria: {
    id: string
    nombre: string | null
    abreviatura: string | null
    fuente: string | null
  } | null
  insumo: { id: string; nombre: string } | null
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
  priceVariation: Array<{
    descripcion: string
    precioInicial: number
    precioFinal: number
    fechaInicial: string | null
    fechaFinal: string | null
    variacionPct: number
    compras: number
  }>
  priceOverview: {
    precioActual: number
    precioAnterior: number
    variacionPct: number
    itemsActual: number
    itemsAnterior: number
  } | null
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
  const trend = (data[data.length - 1] ?? 0) - (data[0] ?? 0)
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
        cy={height - (normalized[normalized.length - 1] ?? 0)}
        r="2"
        fill={color}
      />
    </svg>
  )
}

function PriceVariationCard({ stats, fechaDesde, fechaHasta }: { stats: ItemStats | undefined; fechaDesde: string; fechaHasta: string }) {
  const po = stats?.priceOverview
  const isUp = po && po.variacionPct > 0
  const color = !po ? 'text-slate-400' : isUp ? 'text-red-600' : 'text-emerald-600'

  let subtitle = ''
  if (po) {
    if (fechaDesde && fechaHasta) {
      subtitle = `${formatDate(fechaDesde)} – ${formatDate(fechaHasta)} vs anterior`
    } else {
      subtitle = `mitad reciente vs mitad anterior`
    }
  }

  return (
    <div className="ax-card ax-entra p-5">
      <div className="mb-2 flex items-center gap-2 text-sm text-[var(--sec)]">
        {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        Variación P. Unit.
      </div>
      {!po ? (
        <p className="text-sm text-slate-400">Necesita al menos 2 períodos</p>
      ) : (
        <>
          <p className={`text-2xl font-semibold ${color}`}>
            {isUp ? '+' : ''}{po.variacionPct}%
          </p>
          <p className="text-xs text-slate-400">
            {formatCurrency(po.precioAnterior)} → {formatCurrency(po.precioActual)}
          </p>
          <p className="text-xs text-slate-300 mt-0.5">{subtitle}</p>
        </>
      )}
    </div>
  )
}

interface Proveedor {
  id: string
  razonSocial: string
}

export default function ItemsPage() {
  return (
    <Suspense>
      <ItemsPageContent />
    </Suspense>
  )
}

function ItemsPageContent() {
  const { clienteId, canEdit, canSeeImportes } = useUser()
  const editaItems = canEdit(SECCION.DOC_ITEMS)
  const veImportes = canSeeImportes(SECCION.DOC_ITEMS)
  const urlParams = useSearchParams()
  const initialQ = urlParams.get('q') || ''
  const [page, setPage] = useState(1)
  const [searchTags, setSearchTags] = useState<string[]>(initialQ ? [initialQ] : [])
  const [inputValue, setInputValue] = useState('')
  const [proveedorId, setProveedorId] = useState<string>(urlParams.get('proveedorId') || '')
  const [categoriaId, setCategoriaId] = useState<string>(urlParams.get('categoriaId') || '')
  const [insumoFiltro, setInsumoFiltro] = useState<'' | 'con' | 'sin'>('')
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('todo'))
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const pageSize = 50

  // Debounce input value (searches while typing, like before)
  const [debouncedInput, setDebouncedInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(inputValue)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [inputValue])

  const addTag = (value: string) => {
    const trimmed = value.trim()
    if (trimmed && !searchTags.includes(trimmed)) {
      setSearchTags(prev => [...prev, trimmed])
    }
    setInputValue('')
    setDebouncedInput('')
  }

  const removeTag = (index: number) => {
    setSearchTags(prev => prev.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === 'Tab' || e.key === ',') && inputValue.trim()) {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && searchTags.length > 0) {
      removeTag(searchTags.length - 1)
    }
  }

  const cambiarPeriodo = (p: Periodo) => {
    setPeriodo(p)
    setFechaDesde(p.desde)
    setFechaHasta(p.hasta)
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
  // Combine committed tags + current typing for live search
  const debouncedQ = useMemo(() => {
    const terms = [...searchTags]
    if (debouncedInput.trim()) terms.push(debouncedInput.trim())
    return terms.join(',')
  }, [searchTags, debouncedInput])
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: pageSize.toString(),
    })
    if (debouncedQ) params.set('q', debouncedQ)
    if (proveedorId) params.set('proveedorId', proveedorId)
    if (fechaDesde) params.set('fechaDesde', fechaDesde)
    if (fechaHasta) params.set('fechaHasta', fechaHasta)
    if (categoriaId) params.set('categoriaId', categoriaId)
    if (insumoFiltro) params.set('insumo', insumoFiltro)
    return params.toString()
  }, [page, pageSize, debouncedQ, proveedorId, fechaDesde, fechaHasta, categoriaId, insumoFiltro])

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
    if (debouncedQ) params.set('q', debouncedQ)
    if (proveedorId) params.set('proveedorId', proveedorId)
    if (fechaDesde) params.set('fechaDesde', fechaDesde)
    if (fechaHasta) params.set('fechaHasta', fechaHasta)
    if (categoriaId) params.set('categoriaId', categoriaId)
    return params.toString()
  }, [debouncedQ, proveedorId, fechaDesde, fechaHasta, categoriaId])

  // Resumen por categoría: mismo período/proveedor, sin el filtro de categoría
  // (así se ve el reparto completo y se puede saltar entre categorías).
  const categoriasFiltro = useMemo(() => {
    const params = new URLSearchParams()
    if (proveedorId) params.set('proveedorId', proveedorId)
    if (fechaDesde) params.set('fechaDesde', fechaDesde)
    if (fechaHasta) params.set('fechaHasta', fechaHasta)
    return params.toString()
  }, [proveedorId, fechaDesde, fechaHasta])
  const { data: categoriasData } = useCategorias(categoriasFiltro, !!clienteId)
  const categoriasLista = categoriasData?.categorias ?? []
  const categoriaActiva =
    categoriaId === 'sin' ? 'Sin categoría' : categoriasLista.find((c) => c.id === categoriaId)?.nombre

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
    setSearchTags([])
    setInputValue('')
    setDebouncedInput('')
    setProveedorId('')
    setCategoriaId('')
    setInsumoFiltro('')
    setPeriodo(periodoDe('todo'))
    setFechaDesde('')
    setFechaHasta('')
    setPage(1)
  }

  const hasFilters = searchTags.length > 0 || debouncedInput || proveedorId || categoriaId || insumoFiltro || fechaDesde || fechaHasta
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
        <Header title="Items" description="Todo lo que compraste, artículo por artículo: cuánto, a quién y a qué precio." />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="ax-card ax-entra p-5">
            <div className="mb-2 flex items-center gap-2 text-sm text-[var(--sec)]">
              <Package className="h-4 w-4" />
              Items encontrados
            </div>
            <p className="ax-display ax-num text-[1.6rem] font-semibold leading-none">
              {isLoading ? <Skeleton className="h-7 w-16" /> : (data?.totals.count || 0).toLocaleString()}
            </p>
          </div>
          <div className="ax-card ax-entra p-5">
            <div className="mb-2 flex items-center gap-2 text-sm text-[var(--sec)]">
              <TrendingUp className="h-4 w-4" />
              Cantidad total
            </div>
            <p className="ax-display ax-num text-[1.6rem] font-semibold leading-none">
              {isLoading ? <Skeleton className="h-7 w-20" /> : (data?.totals.cantidad || 0).toLocaleString()}
            </p>
          </div>
          <div className="ax-card ax-entra p-5">
            <div className="mb-2 flex items-center gap-2 text-sm text-[var(--sec)]">
              <BarChart3 className="h-4 w-4" />
              Subtotal
            </div>
            <p className="ax-display ax-num text-[1.6rem] font-semibold leading-none text-emerald-600">
              {isLoading ? <Skeleton className="h-7 w-32" /> : formatCurrency(data?.totals.subtotal || 0)}
            </p>
          </div>
          <PriceVariationCard stats={stats} fechaDesde={fechaDesde} fechaHasta={fechaHasta} />
        </div>

        <BarraFiltros
          periodo={{ valor: periodo, onCambiar: cambiarPeriodo, atajos: ATAJOS_LISTADO }}
          buscador={
            <div
              className="flex min-h-10 min-w-[16rem] flex-1 cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-slate-900/[0.12] bg-white px-3 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:border-[#3b9bff] focus-within:ring-4 focus-within:ring-[#3b9bff]/15"
              onClick={() => document.getElementById('items-search-input')?.focus()}
            >
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              {searchTags.map((tag, i) => (
                <Badge key={i} variant="outline" className="gap-1 shrink-0 py-0.5">
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeTag(i) }}
                    className="ml-0.5 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                id="items-search-input"
                type="text"
                placeholder={searchTags.length === 0 ? 'Buscar artículo o proveedor (Enter para sumar otra palabra)' : 'Sumar otra palabra'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => { if (inputValue.trim()) addTag(inputValue) }}
                className="flex-1 min-w-[120px] outline-none text-sm bg-transparent py-1"
              />
              {isFetching && searchTags.length > 0 && (
                <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
            </div>
          }
          activos={[searchTags.length || debouncedInput ? 'q' : '', proveedorId, categoriaId, insumoFiltro, fechaDesde || fechaHasta ? 'f' : ''].filter(Boolean).length}
          onLimpiar={clearFilters}
          masFiltros={
            <>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  Proveedor
                </p>
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
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  Categoría
                </p>
                <Select value={categoriaId || 'all'} onValueChange={(v) => { setCategoriaId(v === 'all' ? '' : v); setPage(1) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categoriasLista.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                    <SelectItem value="sin">Sin categoría</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  Insumo
                </p>
                <Select value={insumoFiltro || 'all'} onValueChange={(v) => { setInsumoFiltro(v === 'all' ? '' : (v as 'con' | 'sin')); setPage(1) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="con">Asignados a un insumo</SelectItem>
                    <SelectItem value="sin">Sin insumo (no computan stock)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          }
          acciones={
            <>
            {categoriaActiva && (
              <Badge className="gap-1 self-center bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                {categoriaActiva}
                <button type="button" onClick={() => { setCategoriaId(''); setPage(1) }} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            </>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content - Items Table */}
          <div className="lg:col-span-3">
            <div className="ax-card overflow-hidden">
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
                    {/* Cuatro columnas en vez de ocho. El item y el
                        comprobante agrupan lo que antes eran dos columnas cada
                        uno: con ocho, ninguna tenía ancho para mostrarse y
                        todo quedaba truncado. */}
                    <TableRow>
                      <TableHead className="w-full">Item</TableHead>
                      <TableHead className="hidden w-[230px] md:table-cell">Comprobante</TableHead>
                      <TableHead className="hidden w-px whitespace-nowrap text-right sm:table-cell">Cant. × P. unit.</TableHead>
                      <TableHead className="w-px whitespace-nowrap text-right">Subtotal</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow key={item.id} className={isFetching ? 'opacity-50' : ''}>
                        <TableCell className="w-full max-w-0 py-2.5">
                          <div className="truncate font-medium" title={item.descripcion}>
                            {item.descripcion}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <CategoriaCell
                              descripcion={item.descripcion}
                              categoria={item.categoria}
                              categorias={categoriasLista}
                              canEdit={editaItems}
                            />
                            {item.insumo && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700" title="Computa en stock y conciliación como este insumo">
                                <Carrot className="h-3 w-3" />
                                {item.insumo.nombre}
                              </span>
                            )}
                            {/* El proveedor también acá en mobile, donde la
                                columna del comprobante no se muestra. */}
                            {item.proveedor && (
                              <Link
                                href={`/proveedores/${item.proveedor.id}`}
                                className="max-w-[55%] truncate text-[11px] text-slate-400 hover:text-slate-700 hover:underline md:hidden"
                              >
                                {item.proveedor.razonSocial}
                              </Link>
                            )}
                            {/* Y en pantallas chicas también la cantidad, que
                                pierde su columna. */}
                            <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-400 sm:hidden">
                              {item.cantidad?.toLocaleString() || '-'}
                              {item.precioUnitario ? ` × ${formatCurrency(item.precioUnitario)}` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden max-w-[230px] py-2.5 md:table-cell">
                          <div className="flex items-center gap-2">
                            {item.proveedor && (
                              <LogoProveedor
                                id={item.proveedor.id}
                                nombre={item.proveedor.razonSocial}
                                conLogo={!!item.proveedor.conLogo}
                                size={28}
                              />
                            )}
                            <div className="min-w-0">
                              {item.proveedor ? (
                                <Link
                                  href={`/proveedores/${item.proveedor.id}`}
                                  className="block truncate text-sm text-slate-700 hover:underline"
                                  title={item.proveedor.razonSocial}
                                >
                                  {item.proveedor.razonSocial}
                                </Link>
                              ) : (
                                <span className="text-sm text-slate-400">Sin proveedor</span>
                              )}
                              <Link
                                href={`/documento/${item.documento.id}`}
                                className="block truncate text-xs text-slate-400 hover:text-slate-700 hover:underline"
                              >
                                {item.documento.fechaEmision ? formatDate(item.documento.fechaEmision) : 's/f'}
                                {item.documento.numeroCompleto
                                  ? ` · ${item.documento.letra ? `${item.documento.letra}-` : ''}${item.documento.numeroCompleto}`
                                  : ''}
                              </Link>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap py-2.5 text-right text-sm tabular-nums text-slate-500 sm:table-cell">
                          {item.cantidad?.toLocaleString() || '-'}
                          {item.precioUnitario ? ` × ${formatCurrency(item.precioUnitario)}` : ''}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-2.5 text-right font-medium tabular-nums">
                          {item.subtotal ? formatCurrency(item.subtotal) : '-'}
                        </TableCell>
                        <TableCell className="py-2.5 pl-0 pr-2">
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
            <CategoriasPanel
              data={categoriasData}
              categoriaId={categoriaId}
              onSelect={(id) => { setCategoriaId(id); setPage(1) }}
              canEdit={editaItems}
              verImportes={veImportes}
            />

            {/* Top Providers */}
            <div className="ax-card ax-entra p-5">
              <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Top Proveedores
              </h3>
              {stats?.byProvider.slice(0, 5).map((prov, i) => {
                const totalSubtotal = stats.byProvider.reduce((sum, p) => sum + p.totalSubtotal, 0)
                const pct = totalSubtotal > 0 ? (prov.totalSubtotal / totalSubtotal) * 100 : 0
                return (
                  <div key={prov.proveedorId || i} className="py-2 border-b last:border-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {prov.proveedorId ? (
                        <Link
                          href={`/documentos?proveedorId=${prov.proveedorId}`}
                          className="text-sm font-medium truncate flex-1 text-blue-600 hover:text-blue-800 hover:underline"
                          title="Ver documentos del proveedor"
                        >
                          {prov.proveedor}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium truncate flex-1">{prov.proveedor}</p>
                      )}
                      <p className="text-sm font-medium text-emerald-600 shrink-0">
                        {formatCurrency(prov.totalSubtotal)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 shrink-0 w-12 text-right">
                        {pct.toFixed(0)}% · {prov.totalItems}
                      </span>
                    </div>
                  </div>
                )
              })}
              {!stats?.byProvider.length && (
                <p className="text-sm text-slate-400">Sin datos</p>
              )}
            </div>

            {/* Top Items */}
            <div className="ax-card ax-entra p-5">
              <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Items más comprados
              </h3>
              {stats?.topItems.slice(0, 5).map((item, i) => {
                const prices = item.priceHistory?.map(p => p.precio).filter(p => p > 0) ?? []
                const priceTrend = prices.length >= 2
                  ? Math.round(((prices[prices.length - 1]! - prices[0]!) / prices[0]!) * 1000) / 10
                  : null
                return (
                  <div key={i} className="py-2 border-b last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate flex-1" title={item.descripcion}>
                        {item.descripcion}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {priceTrend !== null && (
                          <span className={`text-xs font-semibold ${priceTrend > 0 ? 'text-red-500' : priceTrend < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {priceTrend > 0 ? '+' : ''}{priceTrend}%
                          </span>
                        )}
                        {prices.length >= 2 && (
                          <Sparkline data={prices} width={60} height={20} />
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>{item.totalCantidad.toLocaleString()} unid.</span>
                      <span className="text-emerald-600 font-medium">
                        {formatCurrency(item.totalSubtotal)}
                      </span>
                    </div>
                  </div>
                )
              })}
              {!stats?.topItems.length && (
                <p className="text-sm text-slate-400">Sin datos</p>
              )}
            </div>

            {/* Price Variation */}
            <div className="ax-card ax-entra p-5">
              <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Mayor variación de precio
              </h3>
              {stats?.priceVariation?.slice(0, 5).map((item, i) => {
                const isUp = item.variacionPct > 0
                const fechaIni = item.fechaInicial ? formatDate(item.fechaInicial) : null
                const fechaFin = item.fechaFinal ? formatDate(item.fechaFinal) : null
                return (
                  <div key={i} className="py-2 border-b last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate flex-1" title={item.descripcion}>
                        {item.descripcion}
                      </p>
                      <div className={`flex items-center gap-0.5 text-sm font-semibold shrink-0 ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        {isUp ? '+' : ''}{item.variacionPct}%
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>{formatCurrency(item.precioInicial)} → {formatCurrency(item.precioFinal)}</span>
                      <span className="text-slate-400">
                        {fechaIni && fechaFin ? `${fechaIni} · ${fechaFin}` : `${item.compras} compras`}
                      </span>
                    </div>
                  </div>
                )
              })}
              {!stats?.priceVariation?.length && (
                <p className="text-sm text-slate-400">Sin datos</p>
              )}
            </div>

            {/* Price Trend Chart */}
            {stats?.monthlyTrend && stats.monthlyTrend.length > 0 && (
              <div className="ax-card ax-entra p-5">
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
