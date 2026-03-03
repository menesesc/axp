'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { X, Users, CreditCard, Trash2, Mail, FileText } from 'lucide-react'

interface Proveedor {
  id: string
  razonSocial: string
}

interface SelectedDoc {
  id: string
  total: number | null
  pagoId?: string | null
  _count?: { documento_items: number }
}

interface BulkActionsBarProps {
  selectedCount: number
  selectedDocuments: SelectedDoc[]
  proveedores: Proveedor[]
  selectedProveedor: string
  onProveedorChange: (value: string) => void
  onAssign: () => void
  onAddToPayment: () => void
  onShareEmail: () => void
  onDelete: () => void
  onCancel: () => void
  isAssigning: boolean
  isDeleting?: boolean
  canAddToPayment?: boolean
  paymentDisabledReason?: string
}

export function BulkActionsBar({
  selectedCount,
  selectedDocuments,
  proveedores,
  selectedProveedor,
  onProveedorChange,
  onAssign,
  onAddToPayment,
  onShareEmail,
  onDelete,
  onCancel,
  isAssigning,
  isDeleting = false,
  canAddToPayment = true,
  paymentDisabledReason,
}: BulkActionsBarProps) {
  const totals = useMemo(() => {
    let items = 0
    let totalImpago = 0
    let totalPagado = 0

    for (const doc of selectedDocuments) {
      items += doc._count?.documento_items ?? 0
      const amount = Number(doc.total) || 0
      if (doc.pagoId) {
        totalPagado += amount
      } else {
        totalImpago += amount
      }
    }

    // Redondear a 2 decimales para evitar errores de punto flotante
    return {
      items,
      totalImpago: Math.round(totalImpago * 100) / 100,
      totalPagado: Math.round(totalPagado * 100) / 100,
      totalGeneral: Math.round((totalImpago + totalPagado) * 100) / 100,
    }
  }, [selectedDocuments])

  const fmt = (n: number) =>
    n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl">
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700/50">
        {/* Top row: summary */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-2 flex-wrap">
          <span className="text-sm font-semibold whitespace-nowrap">
            {selectedCount} doc{selectedCount !== 1 ? 's' : ''}
          </span>

          {totals.items > 0 && (
            <>
              <div className="h-3.5 w-px bg-slate-700" />
              <span className="text-xs text-slate-400 whitespace-nowrap">
                <FileText className="h-3 w-3 inline mr-0.5 -mt-px" />
                {totals.items} items
              </span>
            </>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {totals.totalImpago > 0 && (
              <span className="text-sm whitespace-nowrap">
                <span className="font-semibold text-amber-400">$ {fmt(totals.totalImpago)}</span>
                <span className="text-[10px] text-slate-500 ml-1">impago</span>
              </span>
            )}
            {totals.totalPagado > 0 && (
              <span className="text-sm whitespace-nowrap">
                <span className="font-semibold text-blue-400">$ {fmt(totals.totalPagado)}</span>
                <span className="text-[10px] text-slate-500 ml-1">pagado</span>
              </span>
            )}
            {totals.totalImpago > 0 && totals.totalPagado > 0 && (
              <>
                <div className="h-3.5 w-px bg-slate-700" />
                <span className="text-sm font-semibold whitespace-nowrap">
                  $ {fmt(totals.totalGeneral)}
                  <span className="text-[10px] text-slate-500 ml-1">total</span>
                </span>
              </>
            )}
          </div>

          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-slate-700/70" />

        {/* Bottom row: actions */}
        <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap">
          {/* Assign proveedor */}
          <div className="flex items-center gap-1.5">
            <Select value={selectedProveedor} onValueChange={onProveedorChange}>
              <SelectTrigger className="w-44 h-8 bg-slate-800 border-slate-700 text-white text-xs">
                <SelectValue placeholder="Asignar proveedor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nuevo__">+ Crear nuevo</SelectItem>
                <SelectItem value="null">Sin proveedor</SelectItem>
                {proveedores.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.razonSocial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={onAssign}
              disabled={!selectedProveedor || isAssigning}
              className="h-8 bg-white text-slate-900 hover:bg-slate-100 text-xs"
            >
              <Users className="h-3.5 w-3.5 mr-1" />
              Asignar
            </Button>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Payment */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onAddToPayment}
                    disabled={!canAddToPayment}
                    className="h-8 text-white hover:bg-slate-800 disabled:text-slate-500 text-xs"
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1" />
                    Orden de pago
                  </Button>
                </span>
              </TooltipTrigger>
              {!canAddToPayment && paymentDisabledReason && (
                <TooltipContent side="top" className="max-w-xs">
                  <p>{paymentDisabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {/* Email */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onShareEmail}
            className="h-8 text-white hover:bg-slate-800 text-xs"
          >
            <Mail className="h-3.5 w-3.5 mr-1" />
            Email
          </Button>

          <div className="flex-1" />

          {/* Delete */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={isDeleting}
            className="h-8 text-red-400 hover:text-red-300 hover:bg-red-900/30 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
