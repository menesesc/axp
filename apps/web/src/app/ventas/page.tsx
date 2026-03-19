'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useUser } from '@/hooks/use-user'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImportWizard } from '@/components/ventas/import-wizard'
import { Upload, Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface VentaItem {
  id: string
  linea: number
  descripcion: string
  cantidad: number | null
  precioUnitario: number | null
  subtotal: number | null
}

interface Venta {
  id: string
  fecha: string
  nroDocumento: string | null
  tipoDoc: string | null
  clienteNombre: string | null
  formaPago: string | null
  subtotal: number | null
  total: number | null
  venta_items: VentaItem[]
}

function formatCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(val)
}

function formatFecha(val: string) {
  try {
    return format(new Date(val + 'T12:00:00'), 'dd/MM/yyyy', { locale: es })
  } catch {
    return val
  }
}

function VentaRow({ venta }: { venta: Venta }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="px-4 py-3 text-sm text-slate-700">{formatFecha(venta.fecha)}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{venta.nroDocumento || '—'}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{venta.clienteNombre || '—'}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{venta.formaPago || '—'}</td>
        <td className="px-4 py-3 text-sm text-center text-slate-500">{venta.venta_items.length}</td>
        <td className="px-4 py-3 text-sm text-right font-medium text-slate-800">
          {formatCurrency(venta.total)}
        </td>
        <td className="px-4 py-3 text-slate-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </td>
      </tr>
      {expanded && venta.venta_items.length > 0 && (
        <tr className="bg-slate-50 border-b border-slate-100">
          <td colSpan={7} className="px-6 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left py-1 font-medium">Descripción</th>
                  <th className="text-right py-1 font-medium w-20">Cantidad</th>
                  <th className="text-right py-1 font-medium w-28">P. Unit.</th>
                  <th className="text-right py-1 font-medium w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {venta.venta_items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="py-1 text-slate-700">{item.descripcion}</td>
                    <td className="py-1 text-right text-slate-600">{item.cantidad ?? '—'}</td>
                    <td className="py-1 text-right text-slate-600">{formatCurrency(item.precioUnitario)}</td>
                    <td className="py-1 text-right text-slate-700 font-medium">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

export default function VentasPage() {
  const { clienteId, isLoading: userLoading } = useUser()
  const queryClient = useQueryClient()

  const [importOpen, setImportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [formaPago, setFormaPago] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() })
    if (search) p.append('q', search)
    if (formaPago) p.append('formaPago', formaPago)
    if (fechaDesde) p.append('fechaDesde', fechaDesde)
    if (fechaHasta) p.append('fechaHasta', fechaHasta)
    return p.toString()
  }, [page, search, formaPago, fechaDesde, fechaHasta])

  const { data, isLoading } = useQuery({
    queryKey: ['ventas', clienteId, queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/ventas?${queryParams}`)
      if (!res.ok) throw new Error('Error fetching ventas')
      return res.json() as Promise<{
        ventas: Venta[]
        pagination: { total: number; page: number; totalPages: number }
      }>
    },
    enabled: !!clienteId,
    staleTime: 1000 * 60,
  })

  const ventas = data?.ventas || []
  const pagination = data?.pagination

  const totalVentas = useMemo(() => ventas.reduce((sum, v) => sum + (v.total || 0), 0), [ventas])

  if (userLoading) return null

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Ventas</h1>
            <p className="text-sm text-slate-500 mt-0.5">Documentos de venta importados</p>
          </div>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />
            Importar archivo
          </Button>
        </div>

        {/* Summary cards */}
        {ventas.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Ventas en página</p>
              <p className="text-2xl font-semibold text-slate-800 mt-1">{ventas.length}</p>
              {pagination && <p className="text-xs text-slate-400 mt-0.5">de {pagination.total} totales</p>}
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Total ítems</p>
              <p className="text-2xl font-semibold text-slate-800 mt-1">
                {ventas.reduce((sum, v) => sum + v.venta_items.length, 0)}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Total vendido (página)</p>
              <p className="text-2xl font-semibold text-emerald-700 mt-1">{formatCurrency(totalVentas)}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente o nro. documento..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
          <Input
            type="date"
            value={fechaDesde}
            onChange={(e) => { setFechaDesde(e.target.value); setPage(1) }}
            className="w-36 text-sm"
            title="Desde"
          />
          <Input
            type="date"
            value={fechaHasta}
            onChange={(e) => { setFechaHasta(e.target.value); setPage(1) }}
            className="w-36 text-sm"
            title="Hasta"
          />
          {(search || formaPago || fechaDesde || fechaHasta) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setFormaPago(''); setFechaDesde(''); setFechaHasta(''); setPage(1) }}
              className="text-slate-500"
            >
              <X className="h-4 w-4 mr-1" /> Limpiar
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
          ) : ventas.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingCart className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">Sin ventas importadas</p>
              <p className="text-slate-400 text-sm mt-1">Usá el botón "Importar archivo" para comenzar</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Nro. Doc</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Forma de Pago</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Ítems</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {ventas.map((venta) => (
                  <VentaRow key={venta.id} venta={venta} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{pagination.total} ventas · Página {pagination.page} de {pagination.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar ventas
            </DialogTitle>
          </DialogHeader>
          <ImportWizard
            onImportComplete={() => queryClient.invalidateQueries({ queryKey: ['ventas'] })}
            onClose={() => setImportOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
