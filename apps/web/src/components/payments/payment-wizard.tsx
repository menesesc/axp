'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfidenceBadge } from '@/components/ui/confidence-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PaymentMethodsEditor, PaymentMethodLine } from './payment-methods-editor'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, FileText, Users, CreditCard } from 'lucide-react'

interface Proveedor {
  id: string
  razonSocial: string
}

interface Documento {
  id: string
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  total: number | null
  confidenceScore: number | null
}

interface PaymentWizardProps {
  clienteId: string
}

type Step = 1 | 2 | 3

export function PaymentWizard({ clienteId }: PaymentWizardProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>(1)
  const [selectedProveedor, setSelectedProveedor] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [fecha, setFecha] = useState<Date>(new Date())
  const [nota, setNota] = useState('')
  const [methods, setMethods] = useState<PaymentMethodLine[]>([])

  // Cargar documentos preseleccionados desde sessionStorage
  useEffect(() => {
    const pending = sessionStorage.getItem('pendingPaymentDocs')
    if (pending) {
      const docIds = JSON.parse(pending) as string[]
      setSelectedDocs(new Set(docIds))
      sessionStorage.removeItem('pendingPaymentDocs')
    }
  }, [])

  // Fetch proveedores
  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const proveedores: Proveedor[] = proveedoresData?.proveedores?.filter(
    (p: { activo: boolean }) => p.activo
  ) || []

  // Fetch documentos pendientes del proveedor seleccionado
  const { data: docsData, isLoading: loadingDocs } = useQuery({
    queryKey: ['documentos-pendientes', selectedProveedor],
    queryFn: async () => {
      const res = await fetch(`/api/pagos/documentos-pendientes?proveedorId=${selectedProveedor}`)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!selectedProveedor,
  })

  const documentos: Documento[] = docsData?.documentos || []

  // Calcular total de documentos seleccionados
  const selectedDocsList = documentos.filter((d) => selectedDocs.has(d.id))
  const totalOrden = selectedDocsList.reduce((sum, d) => sum + (d.total || 0), 0)

  // Mutation para crear la orden
  const createMutation = useMutation({
    mutationFn: async (data: {
      proveedorId: string
      fecha: Date
      nota: string
      documentos: { documentoId: string; montoAplicado: number }[]
      metodos: { tipo: string; monto: number; fecha?: Date; referencia?: string }[]
    }) => {
      const res = await fetch('/api/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al crear orden')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      toast.success('Orden de pago creada')
      router.push(`/pagos/${data.pago.id}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleNext = () => {
    if (step === 1 && selectedDocs.size === 0) {
      toast.error('Selecciona al menos un documento')
      return
    }
    if (step < 3) {
      setStep((s) => (s + 1) as Step)
    }
  }

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as Step)
    }
  }

  const handleSubmit = (saveAsDraft: boolean) => {
    const totalMetodos = methods.reduce((sum, m) => sum + m.monto, 0)

    if (!saveAsDraft && Math.abs(totalOrden - totalMetodos) > 0.01) {
      toast.error('El total de pagos no coincide con el total de la orden')
      return
    }

    createMutation.mutate({
      proveedorId: selectedProveedor,
      fecha,
      nota,
      documentos: selectedDocsList.map((d) => ({
        documentoId: d.id,
        montoAplicado: d.total || 0,
      })),
      metodos: methods.map((m) => ({
        tipo: m.tipo,
        monto: m.monto,
        fecha: m.fecha,
        referencia: m.referencia,
      })),
    })
  }

  const toggleDoc = (docId: string) => {
    const newSet = new Set(selectedDocs)
    if (newSet.has(docId)) {
      newSet.delete(docId)
    } else {
      newSet.add(docId)
    }
    setSelectedDocs(newSet)
  }

  const toggleAll = () => {
    if (selectedDocs.size === documentos.length) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(documentos.map((d) => d.id)))
    }
  }

  const stepIcons = {
    1: Users,
    2: FileText,
    3: CreditCard,
  }

  const stepTitles = {
    1: 'Elegir proveedor y documentos',
    2: 'Confirmar documentos',
    3: 'Formas de pago',
  }

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {([1, 2, 3] as Step[]).map((s) => {
          const Icon = stepIcons[s]
          const isActive = s === step
          const isComplete = s < step
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isComplete
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={`text-sm ${
                  isActive ? 'font-medium text-slate-900' : 'text-slate-500'
                }`}
              >
                {stepTitles[s]}
              </span>
              {s < 3 && <div className="w-12 h-px bg-slate-200 mx-2" />}
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{stepTitles[step]}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Step 1: Elegir proveedor y documentos */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="max-w-xs">
                <Label>Proveedor</Label>
                <Select value={selectedProveedor} onValueChange={setSelectedProveedor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.razonSocial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProveedor && (
                <>
                  <div className="text-sm text-slate-500">
                    Documentos pendientes de pago
                  </div>

                  {loadingDocs ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : documentos.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400">
                      No hay documentos pendientes para este proveedor
                    </div>
                  ) : (
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={selectedDocs.size === documentos.length}
                                onCheckedChange={toggleAll}
                              />
                            </TableHead>
                            <TableHead>Documento</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Confianza</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {documentos.map((doc) => (
                            <TableRow key={doc.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedDocs.has(doc.id)}
                                  onCheckedChange={() => toggleDoc(doc.id)}
                                />
                              </TableCell>
                              <TableCell>
                                {doc.tipo} {doc.letra || ''} {doc.numeroCompleto || 'S/N'}
                              </TableCell>
                              <TableCell className="text-slate-500">
                                {doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'}
                              </TableCell>
                              <TableCell>
                                <ConfidenceBadge score={doc.confidenceScore || 0} />
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {doc.total ? formatCurrency(doc.total) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {selectedDocs.size > 0 && (
                    <div className="flex justify-end text-sm">
                      <span className="text-slate-500">Total seleccionado:</span>
                      <span className="ml-2 font-semibold text-slate-900">
                        {formatCurrency(totalOrden)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Confirmar documentos */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fecha de la orden</Label>
                  <DatePicker date={fecha} onDateChange={(d) => setFecha(d || new Date())} />
                </div>
                <div>
                  <Label>Nota (opcional)</Label>
                  <Input
                    placeholder="Observaciones..."
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                </div>
              </div>

              <div className="text-sm text-slate-500 mt-4">
                Documentos incluidos en la orden
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Documento</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Confianza</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedDocsList.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          {doc.tipo} {doc.letra || ''} {doc.numeroCompleto || 'S/N'}
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'}
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge score={doc.confidenceScore || 0} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {doc.total ? formatCurrency(doc.total) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <span className="text-slate-500">Total de la orden:</span>
                <span className="ml-2 text-lg font-semibold text-slate-900">
                  {formatCurrency(totalOrden)}
                </span>
              </div>
            </div>
          )}

          {/* Step 3: Formas de pago */}
          {step === 3 && (
            <PaymentMethodsEditor
              methods={methods}
              onChange={setMethods}
              totalOrden={totalOrden}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} disabled={step === 1}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Anterior
        </Button>

        <div className="flex items-center gap-2">
          {step === 3 && (
            <Button
              variant="outline"
              onClick={() => handleSubmit(true)}
              disabled={createMutation.isPending}
            >
              Guardar borrador
            </Button>
          )}
          {step < 3 ? (
            <Button variant="primary" onClick={handleNext}>
              Siguiente
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => handleSubmit(false)}
              disabled={createMutation.isPending || methods.length === 0}
            >
              {createMutation.isPending ? 'Creando...' : 'Emitir orden'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
