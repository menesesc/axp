'use client'

import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Plus,
  X,
  ImageIcon,
} from 'lucide-react'

interface Proveedor {
  id: string
  razonSocial: string
}

interface ConciliacionItem {
  documentoId: string
  tipo: string
  numero: string | null
  fecha: string | null
  totalSistema: number | null
  totalResumen: number | null
  coincide: boolean
  diferencia: number | null
  nota: string | null
}

interface SoloResumenItem {
  numero: string | null
  fecha: string | null
  total: number | null
  nota: string | null
}

interface ConciliacionResult {
  coincidentes: ConciliacionItem[]
  soloEnSistema: ConciliacionItem[]
  soloEnResumen: SoloResumenItem[]
  resumen: string
}

interface ConciliacionResponse {
  proveedor: { id: string; razonSocial: string }
  documentosPendientes: number
  resultado: ConciliacionResult
}

interface ReconciliationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'select' | 'upload' | 'analyzing' | 'result'

export function ReconciliationDialog({ open, onOpenChange }: ReconciliationDialogProps) {
  const router = useRouter()
  const { clienteId } = useUser()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('select')
  const [selectedProveedor, setSelectedProveedor] = useState('')
  const [proveedorInput, setProveedorInput] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<ConciliacionResponse | null>(null)
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())

  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId && open,
  })

  const proveedores: Proveedor[] = proveedoresData?.proveedores?.filter(
    (p: { activo: boolean }) => p.activo
  ) || []

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !selectedProveedor) throw new Error('Faltan datos')
      const formData = new FormData()
      formData.append('proveedorId', selectedProveedor)
      formData.append('file', selectedFile)
      const res = await fetch('/api/pagos/conciliacion', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al procesar')
      }
      return res.json() as Promise<ConciliacionResponse>
    },
    onSuccess: (data) => {
      setResult(data)
      // Pre-select docs that match perfectly
      const perfectMatches = data.resultado.coincidentes
        .filter((d) => d.coincide)
        .map((d) => d.documentoId)
      setSelectedDocs(new Set(perfectMatches))
      setStep('result')
    },
    onError: (err: Error) => {
      toast.error(err.message)
      setStep('upload')
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  const handleAnalyze = () => {
    setStep('analyzing')
    analyzeMutation.mutate()
  }

  const handleCreateOrder = () => {
    if (selectedDocs.size === 0) {
      toast.error('Seleccioná al menos un documento')
      return
    }
    sessionStorage.setItem('pendingPaymentDocs', JSON.stringify([...selectedDocs]))
    sessionStorage.setItem('pendingPaymentProveedor', selectedProveedor)
    onOpenChange(false)
    router.push('/pagos/nueva')
  }

  const handleClose = () => {
    setStep('select')
    setSelectedProveedor('')
    setProveedorInput('')
    setShowDropdown(false)
    setSelectedFile(null)
    setResult(null)
    setSelectedDocs(new Set())
    onOpenChange(false)
  }

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredProveedores = useMemo(() =>
    proveedorInput
      ? proveedores.filter((p) => p.razonSocial.toLowerCase().includes(proveedorInput.toLowerCase()))
      : proveedores,
    [proveedores, proveedorInput]
  )

  const proveedorNombre = result?.proveedor.razonSocial ||
    proveedores.find((p) => p.id === selectedProveedor)?.razonSocial || ''

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Conciliación IA con proveedor
          </DialogTitle>
        </DialogHeader>

        {/* Step: Select provider */}
        {step === 'select' && (
          <div className="space-y-6 py-2">
            <p className="text-sm text-slate-500">
              Subí el resumen de cuenta del proveedor y la IA lo compara con los documentos pendientes en el sistema para preparar la orden de pago.
            </p>
            <div className="space-y-2 relative">
              <label className="text-sm font-medium text-slate-700">Proveedor</label>
              <Input
                placeholder="Buscar proveedor..."
                value={proveedorInput}
                onChange={(e) => {
                  setProveedorInput(e.target.value)
                  setSelectedProveedor('')
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {showDropdown && filteredProveedores.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-md">
                  {filteredProveedores.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 transition-colors"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedProveedor(p.id)
                        setProveedorInput(p.razonSocial)
                        setShowDropdown(false)
                      }}
                    >
                      {p.razonSocial}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={!selectedProveedor}
                onClick={() => setStep('upload')}
              >
                Siguiente
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Upload file */}
        {step === 'upload' && (
          <div className="space-y-6 py-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{proveedorNombre}</Badge>
            </div>
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-colors focus:outline-none"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) setSelectedFile(file)
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items
                if (!items) return
                for (const item of Array.from(items)) {
                  if (item.kind === 'file') {
                    const file = item.getAsFile()
                    if (file) { setSelectedFile(file); break }
                  }
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.csv,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileChange}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  {selectedFile.type.startsWith('image/') ? (
                    <ImageIcon className="h-8 w-8 text-violet-500" />
                  ) : (
                    <FileText className="h-8 w-8 text-violet-500" />
                  )}
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-700">{selectedFile.name || 'Imagen del portapapeles'}</p>
                    <p className="text-xs text-slate-400">
                      {(selectedFile.size / 1024).toFixed(0)} KB · {selectedFile.type || 'imagen'}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
                    className="ml-2 p-1 rounded hover:bg-slate-100"
                  >
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">
                    Arrastrá, hacé clic o pegá con Ctrl+V
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    PDF, imagen (JPG, PNG), TXT o CSV del resumen de cuenta
                  </p>
                </>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('select')}>
                Atrás
              </Button>
              <Button
                variant="primary"
                disabled={!selectedFile}
                onClick={handleAnalyze}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Analizar con IA
              </Button>
            </div>
          </div>
        )}

        {/* Step: Analyzing */}
        {step === 'analyzing' && (
          <div className="py-16 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-violet-500 mx-auto" />
            <p className="text-sm font-medium text-slate-700">
              Analizando resumen de cuenta...
            </p>
            <p className="text-xs text-slate-400">
              La IA está comparando los comprobantes con los documentos del sistema
            </p>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && result && (
          <div className="space-y-5 py-2">
            {/* Summary banner */}
            <div className="rounded-lg bg-slate-50 border p-4 text-sm text-slate-600">
              {result.resultado.resumen}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-semibold text-emerald-600">
                  {result.resultado.coincidentes.filter(d => d.coincide).length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Coinciden exacto</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-semibold text-amber-500">
                  {result.resultado.coincidentes.filter(d => !d.coincide).length + result.resultado.soloEnSistema.length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Con diferencias</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-semibold text-red-500">
                  {result.resultado.soloEnResumen.length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Solo en resumen</p>
              </div>
            </div>

            {/* Matched docs (select to include in order) */}
            {result.resultado.coincidentes.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Documentos encontrados — seleccioná los que querés incluir en la orden
                </p>
                <div className="border rounded-md divide-y">
                  {result.resultado.coincidentes.map((doc) => (
                    <div
                      key={doc.documentoId}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                        selectedDocs.has(doc.documentoId) ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => toggleDoc(doc.documentoId)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocs.has(doc.documentoId)}
                        onChange={() => toggleDoc(doc.documentoId)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {doc.coincide ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">
                          {doc.tipo} {doc.numero}
                        </p>
                        <p className="text-xs text-slate-400">{doc.fecha}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{formatCurrency(doc.totalSistema ?? 0)}</p>
                        {!doc.coincide && doc.diferencia !== null && (
                          <p className="text-xs text-amber-600">
                            Dif: {doc.diferencia > 0 ? '+' : ''}{formatCurrency(doc.diferencia)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Only in system */}
            {result.resultado.soloEnSistema.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Solo en el sistema (no aparecen en el resumen)
                </p>
                <div className="border rounded-md divide-y bg-amber-50/50">
                  {result.resultado.soloEnSistema.map((doc) => (
                    <div key={doc.documentoId} className="flex items-center gap-3 p-3">
                      <XCircle className="h-4 w-4 text-amber-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-slate-600">{doc.tipo} {doc.numero}</p>
                        <p className="text-xs text-slate-400">{doc.fecha}</p>
                      </div>
                      <p className="text-sm text-slate-600">{formatCurrency(doc.totalSistema ?? 0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Only in summary */}
            {result.resultado.soloEnResumen.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Solo en el resumen del proveedor (no están en el sistema)
                </p>
                <div className="border rounded-md divide-y bg-red-50/50">
                  {result.resultado.soloEnResumen.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-slate-600">{item.numero || 'S/N'}</p>
                        <p className="text-xs text-slate-400">{item.fecha}</p>
                      </div>
                      <p className="text-sm text-slate-600">{item.total ? formatCurrency(item.total) : '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="ghost"
                className="text-slate-500"
                onClick={() => {
                  setStep('upload')
                  setResult(null)
                  setSelectedDocs(new Set())
                }}
              >
                Volver a subir
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">
                  {selectedDocs.size} doc{selectedDocs.size !== 1 ? 's' : ''} seleccionado{selectedDocs.size !== 1 ? 's' : ''}
                </span>
                <Button
                  variant="primary"
                  disabled={selectedDocs.size === 0}
                  onClick={handleCreateOrder}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear orden de pago
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
