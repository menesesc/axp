'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X, Users, CreditCard } from 'lucide-react'

interface Proveedor {
  id: string
  razonSocial: string
}

interface BulkActionsBarProps {
  selectedCount: number
  proveedores: Proveedor[]
  selectedProveedor: string
  onProveedorChange: (value: string) => void
  onAssign: () => void
  onAddToPayment: () => void
  onCancel: () => void
  isAssigning: boolean
}

export function BulkActionsBar({
  selectedCount,
  proveedores,
  selectedProveedor,
  onProveedorChange,
  onAssign,
  onAddToPayment,
  onCancel,
  isAssigning,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-slate-900 text-white rounded-lg shadow-xl px-4 py-3 flex items-center gap-4">
        <span className="text-sm font-medium">
          {selectedCount} {selectedCount === 1 ? 'documento' : 'documentos'}
        </span>

        <div className="h-4 w-px bg-slate-700" />

        <div className="flex items-center gap-2">
          <Select value={selectedProveedor} onValueChange={onProveedorChange}>
            <SelectTrigger className="w-48 h-8 bg-slate-800 border-slate-700 text-white text-sm">
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
            className="bg-white text-slate-900 hover:bg-slate-100"
          >
            <Users className="h-4 w-4 mr-1.5" />
            Asignar
          </Button>
        </div>

        <div className="h-4 w-px bg-slate-700" />

        <Button
          size="sm"
          variant="ghost"
          onClick={onAddToPayment}
          className="text-white hover:bg-slate-800"
        >
          <CreditCard className="h-4 w-4 mr-1.5" />
          Crear orden de pago
        </Button>

        <button
          onClick={onCancel}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
