'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Sparkles, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface Change {
  field: string
  label: string
  before: string | null
  after: string | null
  changed: boolean
}

interface ReviewData {
  suggestions: Record<string, any>
  current: Record<string, any>
  changes: Change[]
  usage: {
    logId: string
    inputTokens: number
    outputTokens: number
    costoEstimado: number
    durationMs: number
  }
}

type DialogStep = 'loading' | 'review' | 'applying' | 'error'

interface AIReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string | null
  onApplied?: () => void
}

export function AIReviewDialog({
  open,
  onOpenChange,
  documentId,
  onApplied,
}: AIReviewDialogProps) {
  const [step, setStep] = useState<DialogStep>('loading')
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch AI review when dialog opens
  useEffect(() => {
    if (!open || !documentId) return

    setStep('loading')
    setData(null)
    setError(null)

    const fetchReview = async () => {
      try {
        const res = await fetch(`/api/documentos/${documentId}/ai-review`, {
          method: 'POST',
        })
        const json = await res.json()

        if (!res.ok) {
          setError(json.error || 'Error al revisar con IA')
          setStep('error')
          return
        }

        setData(json)
        setStep('review')
      } catch {
        setError('Error de conexión')
        setStep('error')
      }
    }

    fetchReview()
  }, [open, documentId])

  const handleApply = async () => {
    if (!data || !documentId) return

    setStep('applying')

    try {
      // Build changes object with only the changed fields
      const changes: Record<string, any> = {}
      for (const change of data.changes) {
        if (change.changed) {
          changes[change.field] = data.suggestions[change.field]
        }
      }

      const res = await fetch(`/api/documentos/${documentId}/ai-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId: data.usage.logId,
          changes,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error || 'Error al aplicar cambios')
        setStep('error')
        return
      }

      toast.success('Documento actualizado con IA')
      onOpenChange(false)
      onApplied?.()
    } catch {
      setError('Error de conexión')
      setStep('error')
    }
  }

  const handleRetry = () => {
    setStep('loading')
    setError(null)
    setData(null)
    // Re-trigger the effect
    onOpenChange(false)
    setTimeout(() => onOpenChange(true), 100)
  }

  const changedFields = data?.changes.filter(c => c.changed) ?? []
  const confianza = data?.suggestions?.confianza ?? 0

  const confianzaColor =
    confianza >= 80 ? 'bg-emerald-100 text-emerald-700' :
    confianza >= 50 ? 'bg-amber-100 text-amber-700' :
    'bg-red-100 text-red-700'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Revisión con IA
          </DialogTitle>
        </DialogHeader>

        {/* LOADING */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            <p className="text-sm font-medium text-slate-700">Analizando documento con IA...</p>
            <p className="text-xs text-slate-400">Esto puede tardar unos segundos</p>
          </div>
        )}

        {/* REVIEW */}
        {step === 'review' && data && (
          <>
            <div className="space-y-4 py-2">
              {/* Confidence badge */}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${confianzaColor}`}>
                  Confianza: {confianza}%
                </span>
                {changedFields.length === 0 && (
                  <span className="text-xs text-slate-400">Sin cambios detectados</span>
                )}
              </div>

              {/* Changes list */}
              {changedFields.length > 0 ? (
                <div className="divide-y divide-slate-100 border rounded-lg">
                  {changedFields.map(change => (
                    <div key={change.field} className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm font-medium text-slate-600 w-28 shrink-0">
                        {change.label}
                      </span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-slate-400 line-through truncate">
                          {change.before || '-'}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="text-sm font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded truncate">
                          {change.after || '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 text-slate-400">
                  <CheckCircle2 className="h-8 w-8 mb-2" />
                  <p className="text-sm">La IA no encontró campos para corregir</p>
                </div>
              )}

              {/* AI notes */}
              {data.suggestions.notas && (
                <p className="text-xs text-slate-500 italic">
                  {data.suggestions.notas}
                </p>
              )}

              {/* Proveedor not found warning */}
              {!data.suggestions.proveedorId && data.suggestions.proveedorCuit && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">
                    Proveedor detectado pero no registrado — CUIT: {data.suggestions.proveedorCuit}
                    {data.suggestions.proveedorNombre && `, Nombre: ${data.suggestions.proveedorNombre}`}.
                    Deberás crearlo manualmente.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <span className="text-[11px] text-slate-400">
                {data.usage.inputTokens + data.usage.outputTokens} tokens · ~${data.usage.costoEstimado.toFixed(4)} USD
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                {changedFields.length > 0 && (
                  <Button onClick={handleApply} className="bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Aplicar cambios
                  </Button>
                )}
              </div>
            </DialogFooter>
          </>
        )}

        {/* APPLYING */}
        {step === 'applying' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-sm font-medium text-slate-700">Aplicando cambios...</p>
          </div>
        )}

        {/* ERROR */}
        {step === 'error' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-600 text-center">{error}</p>
            <div className="flex gap-2 mt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button variant="outline" onClick={handleRetry}>
                Reintentar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
