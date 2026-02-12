'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Paperclip, FileText, X, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

type PaymentMethodType = 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'ECHEQ'

export interface PaymentAttachment {
  key: string
  filename: string
}

export interface PaymentMethodLine {
  id: string
  tipo: PaymentMethodType
  monto: number
  fecha: Date
  referencia?: string
  attachments?: PaymentAttachment[]
}

interface PaymentMethodsEditorProps {
  methods: PaymentMethodLine[]
  onChange: (methods: PaymentMethodLine[]) => void
  totalOrden: number
}

const methodLabels = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  ECHEQ: 'eCheq',
}

export function PaymentMethodsEditor({
  methods,
  onChange,
  totalOrden,
}: PaymentMethodsEditorProps) {
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const totalPagos = methods.reduce((sum, m) => sum + m.monto, 0)
  const diferencia = totalOrden - totalPagos

  // Auto-add first method with full amount if none exists
  useEffect(() => {
    if (methods.length === 0 && totalOrden > 0) {
      const newMethod: PaymentMethodLine = {
        id: crypto.randomUUID(),
        tipo: 'TRANSFERENCIA',
        monto: totalOrden,
        fecha: new Date(),
        attachments: [],
      }
      onChange([newMethod])
    }
  }, [totalOrden, methods.length, onChange])

  const addMethod = () => {
    const remaining = totalOrden - totalPagos
    if (remaining <= 0) {
      toast.error('El total ya está cubierto')
      return
    }
    const newMethod: PaymentMethodLine = {
      id: crypto.randomUUID(),
      tipo: 'TRANSFERENCIA',
      monto: remaining,
      fecha: new Date(),
      attachments: [],
    }
    onChange([...methods, newMethod])
  }

  const updateMethod = (id: string, updates: Partial<PaymentMethodLine>) => {
    // Validate amount doesn't exceed remaining + current
    if (updates.monto !== undefined) {
      const method = methods.find(m => m.id === id)
      if (method) {
        const otherTotal = methods.filter(m => m.id !== id).reduce((sum, m) => sum + m.monto, 0)
        const maxAllowed = totalOrden - otherTotal
        if (updates.monto > maxAllowed) {
          toast.error(`El importe no puede exceder ${formatCurrency(maxAllowed)}`)
          updates.monto = maxAllowed
        }
      }
    }
    onChange(
      methods.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      )
    )
  }

  const removeMethod = (id: string) => {
    if (methods.length === 1) {
      toast.error('Debe haber al menos una forma de pago')
      return
    }
    onChange(methods.filter((m) => m.id !== id))
  }

  const handleFileUpload = async (methodId: string, file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo excede 10MB')
      return
    }

    setUploadingId(methodId)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('metodoId', methodId)

      const res = await fetch('/api/pagos/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al subir archivo')
      }

      const data = await res.json()

      // Update method with new attachment
      const method = methods.find(m => m.id === methodId)
      if (method) {
        const attachments = method.attachments || []
        updateMethod(methodId, {
          attachments: [...attachments, { key: data.key, filename: data.filename }],
        })
      }

      toast.success('Archivo adjuntado')
    } catch (error: any) {
      toast.error(error.message || 'Error al subir archivo')
    } finally {
      setUploadingId(null)
    }
  }

  const removeAttachment = (methodId: string, key: string) => {
    const method = methods.find(m => m.id === methodId)
    if (method) {
      updateMethod(methodId, {
        attachments: (method.attachments || []).filter(a => a.key !== key),
      })
    }
  }

  const triggerFileInput = (methodId: string) => {
    const input = fileInputRefs.current.get(methodId)
    if (input) {
      input.click()
    }
  }

  // Validation warning
  const hasValidationError = totalPagos > totalOrden || (methods.length > 0 && Math.abs(diferencia) > 0.01)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-900">Formas de pago</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={addMethod}
          disabled={diferencia <= 0}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Agregar forma
        </Button>
      </div>

      {methods.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-slate-500">
              Agrega al menos una forma de pago
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {methods.map((method) => (
            <Card key={method.id} className="border shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-12 gap-3 items-end">
                  {/* Método */}
                  <div className="col-span-2">
                    <Label className="text-xs">Método</Label>
                    <Select
                      value={method.tipo}
                      onValueChange={(v) =>
                        updateMethod(method.id, { tipo: v as PaymentMethodType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(methodLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Importe */}
                  <div className="col-span-2">
                    <Label className="text-xs">Importe</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={method.monto}
                      onChange={(e) =>
                        updateMethod(method.id, {
                          monto: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  {/* Fecha */}
                  <div className="col-span-2">
                    <Label className="text-xs">Fecha</Label>
                    <DatePicker
                      date={method.fecha}
                      onDateChange={(d) =>
                        updateMethod(method.id, { fecha: d || new Date() })
                      }
                    />
                  </div>

                  {/* Referencia */}
                  <div className="col-span-2">
                    <Label className="text-xs">Referencia</Label>
                    <Input
                      placeholder="Nro. operación"
                      value={method.referencia || ''}
                      onChange={(e) =>
                        updateMethod(method.id, { referencia: e.target.value })
                      }
                    />
                  </div>

                  {/* Adjuntar */}
                  <div className="col-span-3">
                    <Label className="text-xs">Comprobantes</Label>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      ref={(el) => {
                        if (el) fileInputRefs.current.set(method.id, el)
                      }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileUpload(method.id, file)
                          e.target.value = ''
                        }
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => triggerFileInput(method.id)}
                        disabled={uploadingId === method.id}
                      >
                        {uploadingId === method.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Paperclip className="h-3.5 w-3.5 mr-1" />
                            Adjuntar
                          </>
                        )}
                      </Button>
                      {(method.attachments?.length || 0) > 0 && (
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {method.attachments?.length} PDF
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Eliminar */}
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMethod(method.id)}
                      className="text-slate-400 hover:text-red-600"
                      disabled={methods.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Attachments list */}
                {method.attachments && method.attachments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="flex flex-wrap gap-2">
                      {method.attachments.map((att) => (
                        <div
                          key={att.key}
                          className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded text-xs"
                        >
                          <FileText className="h-3.5 w-3.5 text-blue-600" />
                          <span className="max-w-[150px] truncate" title={att.filename}>
                            {att.filename}
                          </span>
                          <button
                            onClick={() => removeAttachment(method.id, att.key)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Validation warning */}
      {hasValidationError && diferencia !== 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-amber-800">
            {diferencia > 0
              ? `Falta asignar ${formatCurrency(diferencia)} para completar el pago`
              : `El total de pagos excede la orden por ${formatCurrency(Math.abs(diferencia))}`}
          </span>
        </div>
      )}

      {/* Resumen de totales */}
      <div className="flex items-center justify-end gap-6 pt-2 border-t">
        <div className="text-sm">
          <span className="text-slate-500">Total orden:</span>
          <span className="ml-2 font-medium text-slate-900">
            {formatCurrency(totalOrden)}
          </span>
        </div>
        <div className="text-sm">
          <span className="text-slate-500">Total pagos:</span>
          <span className="ml-2 font-medium text-slate-900">
            {formatCurrency(totalPagos)}
          </span>
        </div>
        <div className="text-sm">
          <span className="text-slate-500">Diferencia:</span>
          <span
            className={`ml-2 font-medium ${
              Math.abs(diferencia) < 0.01
                ? 'text-emerald-600'
                : 'text-red-600'
            }`}
          >
            {formatCurrency(diferencia)}
          </span>
        </div>
      </div>
    </div>
  )
}
