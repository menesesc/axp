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
import { Separator } from '@/components/ui/separator'
import { PaymentMethodsEditor, PaymentMethodLine, PaymentAttachment } from './payment-methods-editor'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  CreditCard,
  ClipboardList,
  Download,
  Share2,
  MessageCircle,
  Mail,
  Loader2,
  CheckCircle,
  AlertTriangle,
  MessageSquareWarning,
  Save,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  anotacionesCount?: number
}

export interface EditModeData {
  pagoId: string
  proveedorId: string
  fecha: Date
  nota: string
  documentos: { documentoId: string; montoAplicado: number }[]
  metodos: PaymentMethodLine[]
}

interface PaymentWizardProps {
  clienteId: string
  editMode?: EditModeData
}

type Step = 1 | 2 | 3

export function PaymentWizard({ clienteId, editMode }: PaymentWizardProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>(1)
  const [selectedProveedor, setSelectedProveedor] = useState(editMode?.proveedorId || '')
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(
    new Set(editMode?.documentos.map(d => d.documentoId) || [])
  )
  const [fecha, setFecha] = useState<Date>(editMode?.fecha || new Date())
  const [nota, setNota] = useState(editMode?.nota || '')
  const [methods, setMethods] = useState<PaymentMethodLine[]>(editMode?.metodos || [])
  const [createdPagoId, setCreatedPagoId] = useState<string | null>(null)
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  // Cargar documentos preseleccionados y proveedor desde sessionStorage
  useEffect(() => {
    const pendingDocs = sessionStorage.getItem('pendingPaymentDocs')
    const pendingProveedor = sessionStorage.getItem('pendingPaymentProveedor')

    if (pendingDocs) {
      const docIds = JSON.parse(pendingDocs) as string[]
      setSelectedDocs(new Set(docIds))
      sessionStorage.removeItem('pendingPaymentDocs')
    }

    if (pendingProveedor) {
      setSelectedProveedor(pendingProveedor)
      sessionStorage.removeItem('pendingPaymentProveedor')
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
  const proveedorNombre = proveedores.find(p => p.id === selectedProveedor)?.razonSocial || ''

  // Calcular total de documentos seleccionados
  const selectedDocsList = documentos.filter((d) => selectedDocs.has(d.id))
  const totalOrden = selectedDocsList.reduce((sum, d) => sum + (d.total || 0), 0)
  const totalMetodos = methods.reduce((sum, m) => sum + m.monto, 0)

  // Mutation para crear/actualizar la orden
  const createMutation = useMutation({
    mutationFn: async (data: {
      proveedorId: string
      fecha: Date
      nota: string
      emitir: boolean
      documentos: { documentoId: string; montoAplicado: number }[]
      metodos: { tipo: string; monto: number; fecha?: string; referencia?: string; attachments?: PaymentAttachment[] }[]
    }) => {
      const isEdit = !!editMode
      const url = isEdit ? `/api/pagos/${editMode.pagoId}` : '/api/pagos'
      const method = isEdit ? 'PATCH' : 'POST'

      const body = isEdit
        ? { ...data, estado: data.emitir ? 'EMITIDA' : undefined }
        : data

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al guardar orden')
      }
      return res.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] })
      const pagoId = editMode?.pagoId || data.pago?.id
      if (variables.emitir) {
        setCreatedPagoId(pagoId)
        toast.success('Orden de pago emitida')
      } else {
        setSavedDraftId(pagoId)
        toast.success('Borrador guardado')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleNext = () => {
    if (step === 1 && !selectedProveedor) {
      toast.error('Selecciona un proveedor')
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

  const handleSubmit = () => {
    if (Math.abs(totalOrden - totalMetodos) > 0.01) {
      toast.error('El total de pagos no coincide con el total de la orden')
      return
    }

    createMutation.mutate({
      proveedorId: selectedProveedor,
      fecha,
      nota,
      emitir: true,
      documentos: selectedDocsList.map((d) => ({
        documentoId: d.id,
        montoAplicado: d.total || 0,
      })),
      metodos: methods.map((m) => ({
        tipo: m.tipo,
        monto: m.monto,
        ...(m.fecha && { fecha: m.fecha.toISOString() }),
        ...(m.referencia && { referencia: m.referencia }),
        ...(m.attachments && m.attachments.length > 0 && { attachments: m.attachments }),
      })),
    })
  }

  const handleSaveDraft = () => {
    if (!selectedProveedor) {
      toast.error('Selecciona un proveedor para guardar')
      return
    }

    createMutation.mutate({
      proveedorId: selectedProveedor,
      fecha,
      nota,
      emitir: false,
      documentos: selectedDocsList.map((d) => ({
        documentoId: d.id,
        montoAplicado: d.total || 0,
      })),
      metodos: methods.map((m) => ({
        tipo: m.tipo,
        monto: m.monto,
        ...(m.fecha && { fecha: m.fecha.toISOString() }),
        ...(m.referencia && { referencia: m.referencia }),
        ...(m.attachments && m.attachments.length > 0 && { attachments: m.attachments }),
      })),
    })
  }

  const handleDownloadPdf = async () => {
    if (!createdPagoId) return
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/pagos/${createdPagoId}/pdf`)
      if (!res.ok) throw new Error('Error al generar PDF')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orden-pago-${createdPagoId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('PDF descargado')
    } catch {
      toast.error('Error al descargar PDF')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleShareWhatsApp = async () => {
    if (!createdPagoId) return
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/pagos/${createdPagoId}/pdf`)
      if (!res.ok) throw new Error('Error al generar PDF')

      const blob = await res.blob()
      const file = new File([blob], `orden-pago-${createdPagoId}.pdf`, { type: 'application/pdf' })

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Orden de pago - ${proveedorNombre}`,
          files: [file],
        })
      } else {
        handleDownloadPdf()
        toast.info('Descarga el PDF y compártelo manualmente por WhatsApp')
      }
    } catch {
      toast.error('Error al compartir')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Orden de pago - ${proveedorNombre}`)
    const body = encodeURIComponent(
      `Adjunto la orden de pago para ${proveedorNombre} por ${formatCurrency(totalOrden)}.\n\nFecha: ${formatDate(fecha)}`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
    toast.info('Descarga el PDF y adjúntalo al correo')
    handleDownloadPdf()
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
    1: FileText,
    2: CreditCard,
    3: ClipboardList,
  }

  const stepTitles = {
    1: 'Documentos a pagar',
    2: 'Formas de pago',
    3: 'Resumen y confirmación',
  }

  // Redirigir si se guardó como borrador
  useEffect(() => {
    if (savedDraftId) {
      router.push(`/pagos/${savedDraftId}`)
    }
  }, [savedDraftId, router])

  // Si ya se creó la orden, mostrar pantalla de éxito
  if (createdPagoId) {
    return (
      <div className="space-y-6">
        <Card className="border shadow-sm">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Orden de pago emitida
              </h2>
              <p className="text-slate-500">
                La orden de pago para {proveedorNombre} por {formatCurrency(totalOrden)} ha sido creada exitosamente.
              </p>

              <div className="flex items-center justify-center gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1.5" />
                  )}
                  Descargar PDF
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={isDownloading}>
                      <Share2 className="h-4 w-4 mr-1.5" />
                      Compartir
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center">
                    <DropdownMenuItem onClick={handleShareWhatsApp}>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      WhatsApp
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShareEmail}>
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="primary"
                  onClick={() => router.push(`/pagos/${createdPagoId}`)}
                >
                  Ver orden
                </Button>
              </div>

              <div className="pt-4">
                <Button
                  variant="ghost"
                  onClick={() => router.push('/pagos')}
                  className="text-slate-500"
                >
                  Volver a órdenes de pago
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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
          {/* Step 1: Documentos a pagar */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
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
                <div>
                  <Label>Fecha de la orden</Label>
                  <DatePicker date={fecha} onDateChange={(d) => setFecha(d || new Date())} />
                </div>
                <div>
                  <Label>Observaciones</Label>
                  <Input
                    placeholder="Notas (opcional)..."
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                  />
                </div>
              </div>

              {selectedProveedor && (
                <>
                  <Separator className="my-4" />

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
                                checked={selectedDocs.size === documentos.length && documentos.length > 0}
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
                            <TableRow key={doc.id} className={doc.anotacionesCount ? 'bg-amber-50/50' : ''}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedDocs.has(doc.id)}
                                  onCheckedChange={() => toggleDoc(doc.id)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span>{doc.tipo} {doc.letra || ''} {doc.numeroCompleto || 'S/N'}</span>
                                  {doc.anotacionesCount ? (
                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium" title="Documento con anotaciones">
                                      <MessageSquareWarning className="h-3 w-3" />
                                      {doc.anotacionesCount}
                                    </span>
                                  ) : null}
                                </div>
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
                    <>
                      {/* Warning for documents with annotations */}
                      {selectedDocsList.some(d => d.anotacionesCount && d.anotacionesCount > 0) && (
                        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-amber-800">
                              Documentos con anotaciones
                            </p>
                            <p className="text-sm text-amber-700 mt-0.5">
                              Algunos documentos seleccionados tienen anotaciones pendientes. Revísalas antes de emitir la orden de pago.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end text-sm">
                        <span className="text-slate-500">Total seleccionado:</span>
                        <span className="ml-2 font-semibold text-slate-900">
                          {formatCurrency(totalOrden)}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Formas de pago */}
          {step === 2 && (
            <PaymentMethodsEditor
              methods={methods}
              onChange={setMethods}
              totalOrden={totalOrden}
            />
          )}

          {/* Step 3: Resumen y confirmación */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Información general */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Proveedor:</span>
                  <span className="ml-2 font-medium">{proveedorNombre}</span>
                </div>
                <div>
                  <span className="text-slate-500">Fecha:</span>
                  <span className="ml-2 font-medium">{formatDate(fecha)}</span>
                </div>
                {nota && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Observaciones:</span>
                    <span className="ml-2">{nota}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Documentos */}
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-3">
                  Documentos incluidos ({selectedDocsList.length})
                </h4>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Documento</TableHead>
                        <TableHead>Fecha</TableHead>
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
                          <TableCell className="text-right font-medium tabular-nums">
                            {doc.total ? formatCurrency(doc.total) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end pt-2 text-sm">
                  <span className="text-slate-500">Total documentos:</span>
                  <span className="ml-2 font-semibold">{formatCurrency(totalOrden)}</span>
                </div>
              </div>

              <Separator />

              {/* Formas de pago */}
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-3">
                  Formas de pago ({methods.length})
                </h4>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Método</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Referencia</TableHead>
                        <TableHead>Comprobantes</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {methods.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <PaymentMethodBadge method={m.tipo} />
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {formatDate(m.fecha)}
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {m.referencia || '-'}
                          </TableCell>
                          <TableCell>
                            {m.attachments && m.attachments.length > 0 ? (
                              <span className="text-xs text-blue-600">
                                {m.attachments.length} PDF
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(m.monto)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end pt-2 text-sm">
                  <span className="text-slate-500">Total pagos:</span>
                  <span className="ml-2 font-semibold">{formatCurrency(totalMetodos)}</span>
                </div>
              </div>

              <Separator />

              {/* Total final */}
              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
                <span className="font-medium text-slate-700">Total de la orden:</span>
                <span className="text-2xl font-bold text-slate-900">
                  {formatCurrency(totalOrden)}
                </span>
              </div>

              {Math.abs(totalOrden - totalMetodos) > 0.01 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  El total de pagos ({formatCurrency(totalMetodos)}) no coincide con el total de documentos ({formatCurrency(totalOrden)}).
                  Por favor ajusta las formas de pago.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleBack} disabled={step === 1}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Anterior
          </Button>
          {selectedProveedor && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Guardar borrador
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {step < 3 ? (
            <Button variant="primary" onClick={handleNext}>
              Siguiente
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={createMutation.isPending || methods.length === 0 || Math.abs(totalOrden - totalMetodos) > 0.01}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Emitiendo...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  Emitir orden
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
