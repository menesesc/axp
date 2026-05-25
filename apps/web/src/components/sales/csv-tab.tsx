'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ImportWizard } from '@/components/ventas/import-wizard'
import { Upload, Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react'
import { fmtAR, fmtFecha } from './shared'

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

function VentaRow({ venta }: { venta: Venta }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        <td className="px-4 py-3 text-sm text-slate-700">{fmtFecha(venta.fecha)}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{venta.nroDocumento || '—'}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{venta.clienteNombre || '—'}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{venta.formaPago || '—'}</td>
        <td className="px-4 py-3 text-sm text-center text-slate-500">{venta.venta_items.length}</td>
        <td className="px-4 py-3 text-sm text-right font-medium text-slate-800">
          {fmtAR(venta.total)}
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
                    <td className="py-1 text-right text-slate-600">{fmtAR(item.precioUnitario)}</td>
                    <td className="py-1 text-right text-slate-700 font-medium">{fmtAR(item.subtotal)}</td>
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

export function CsvTab({ clienteId }: { clienteId: string | null | undefined }) {
  const queryClient = useQueryClient()
  const [importOpen, setImportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) p.append('q', search)
    if (fechaDesde) p.append('fechaDesde', fechaDesde)
    if (fechaHasta) p.append('fechaHasta', fechaHasta)
    return p.toString()
  }, [page, search, fechaDesde, fechaHasta])

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
    staleTime: 60_000,
  })

  const ventas = data?.ventas ?? []
  const pagination = data?.pagination
  const totalVentas = useMemo(() => ventas.reduce((s, v) => s + (v.total || 0), 0), [ventas])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente o nro. documento..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9 text-sm"
            />
          </div>
          <Input
            type="date"
            value={fechaDesde}
            onChange={(e) => { setFechaDesde(e.target.value); setPage(1) }}
            className="w-36 text-sm"
          />
          <Input
            type="date"
            value={fechaHasta}
            onChange={(e) => { setFechaHasta(e.target.value); setPage(1) }}
            className="w-36 text-sm"
          />
          {(search || fechaDesde || fechaHasta) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setFechaDesde(''); setFechaHasta(''); setPage(1) }}
            >
              <X className="h-4 w-4 mr-1" /> Limpiar
            </Button>
          )}
        </div>
        <Button onClick={() => setImportOpen(true)} size="sm">
          <Upload className="h-4 w-4 mr-1.5" />
          Importar CSV/Excel
        </Button>
      </div>

      {ventas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KPI label="Ventas en página" value={String(ventas.length)} hint={pagination ? `de ${pagination.total} totales` : undefined} />
          <KPI label="Total ítems" value={String(ventas.reduce((s, v) => s + v.venta_items.length, 0))} />
          <KPI label="Total vendido (página)" value={fmtAR(totalVentas)} highlight />
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : ventas.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">Sin ventas importadas</p>
            <p className="text-slate-400 text-sm mt-1">Usá "Importar CSV/Excel" para comenzar</p>
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
              {ventas.map((v) => <VentaRow key={v.id} venta={v} />)}
            </tbody>
          </table>
        )}
      </div>

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
    </div>
  )
}

function KPI({ label, value, hint, highlight }: { label: string; value: string; hint?: string | undefined; highlight?: boolean | undefined }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${highlight ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}
