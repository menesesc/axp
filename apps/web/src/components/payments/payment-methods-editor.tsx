'use client'

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
import { Plus, Trash2 } from 'lucide-react'

type PaymentMethodType = 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE' | 'ECHEQ'

export interface PaymentMethodLine {
  id: string
  tipo: PaymentMethodType
  monto: number
  fecha: Date
  referencia?: string
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
  const totalPagos = methods.reduce((sum, m) => sum + m.monto, 0)
  const diferencia = totalOrden - totalPagos

  const addMethod = () => {
    const newMethod: PaymentMethodLine = {
      id: crypto.randomUUID(),
      tipo: 'TRANSFERENCIA',
      monto: diferencia > 0 ? diferencia : 0,
      fecha: new Date(),
    }
    onChange([...methods, newMethod])
  }

  const updateMethod = (id: string, updates: Partial<PaymentMethodLine>) => {
    onChange(
      methods.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      )
    )
  }

  const removeMethod = (id: string) => {
    onChange(methods.filter((m) => m.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-900">Formas de pago</h3>
        <Button variant="outline" size="sm" onClick={addMethod}>
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
                    <div className="col-span-3">
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
                    <div className="col-span-3">
                      <Label className="text-xs">Fecha</Label>
                      <DatePicker
                        date={method.fecha}
                        onDateChange={(d) =>
                          updateMethod(method.id, { fecha: d || new Date() })
                        }
                      />
                    </div>

                    {/* Referencia */}
                    <div className="col-span-3">
                      <Label className="text-xs">Referencia</Label>
                      <Input
                        placeholder="Nro. operación"
                        value={method.referencia || ''}
                        onChange={(e) =>
                          updateMethod(method.id, { referencia: e.target.value })
                        }
                      />
                    </div>

                    {/* Eliminar */}
                    <div className="col-span-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMethod(method.id)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
