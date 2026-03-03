'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Sparkles, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface DocResult {
  id: string
  status: 'updated' | 'no_changes' | 'error'
  fieldsChanged: number
  error?: string
}

type DialogStep = 'processing' | 'done'

interface AIReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentIds: string[]
  onCompleted?: () => void
}

export function AIReviewDialog({
  open,
  onOpenChange,
  documentIds,
  onCompleted,
}: AIReviewDialogProps) {
  const [step, setStep] = useState<DialogStep>('processing')
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<DocResult[]>([])
  const [totalCost, setTotalCost] = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)
  const abortRef = useRef(false)

  useEffect(() => {
    if (!open || documentIds.length === 0) return

    setStep('processing')
    setCurrent(0)
    setResults([])
    setTotalCost(0)
    setTotalTokens(0)
    abortRef.current = false

    const processDocuments = async () => {
      const docResults: DocResult[] = []
      let cost = 0
      let tokens = 0

      for (let i = 0; i < documentIds.length; i++) {
        if (abortRef.current) break
        setCurrent(i + 1)
        const docId = documentIds[i]!

        try {
          // Step 1: Get AI review
          const reviewRes = await fetch(`/api/documentos/${docId}/ai-review`, {
            method: 'POST',
          })
          const reviewJson = await reviewRes.json()

          if (!reviewRes.ok) {
            docResults.push({ id: docId, status: 'error', fieldsChanged: 0, error: reviewJson.error })
            continue
          }

          cost += reviewJson.usage.costoEstimado
          tokens += reviewJson.usage.inputTokens + reviewJson.usage.outputTokens

          // Step 2: Check if there are changes to apply
          const changedFields = reviewJson.changes.filter((c: { changed: boolean }) => c.changed)

          if (changedFields.length === 0) {
            docResults.push({ id: docId, status: 'no_changes', fieldsChanged: 0 })
            continue
          }

          // Step 3: Auto-apply changes
          const changes: Record<string, any> = {}
          for (const change of reviewJson.changes) {
            if (change.changed) {
              changes[change.field] = reviewJson.suggestions[change.field]
            }
          }

          const applyRes = await fetch(`/api/documentos/${docId}/ai-apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              logId: reviewJson.usage.logId,
              changes,
            }),
          })

          if (!applyRes.ok) {
            const applyJson = await applyRes.json()
            docResults.push({ id: docId, status: 'error', fieldsChanged: 0, error: applyJson.error })
            continue
          }

          docResults.push({ id: docId, status: 'updated', fieldsChanged: changedFields.length })
        } catch {
          docResults.push({ id: docId, status: 'error', fieldsChanged: 0, error: 'Error de conexión' })
        }
      }

      setResults(docResults)
      setTotalCost(cost)
      setTotalTokens(tokens)
      setStep('done')
    }

    processDocuments()
  }, [open, documentIds])

  const handleClose = () => {
    abortRef.current = true
    onOpenChange(false)
    if (results.some(r => r.status === 'updated')) {
      onCompleted?.()
    }
  }

  const updated = results.filter(r => r.status === 'updated')
  const noChanges = results.filter(r => r.status === 'no_changes')
  const errors = results.filter(r => r.status === 'error')
  const progress = documentIds.length > 0 ? (current / documentIds.length) * 100 : 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Revisión con IA
          </DialogTitle>
        </DialogHeader>

        {/* PROCESSING */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-slate-700">
                Procesando documento {current} de {documentIds.length}...
              </p>
              <p className="text-xs text-slate-400">
                Analizando y aplicando correcciones automáticamente
              </p>
            </div>
            <Progress value={progress} className="w-full max-w-xs" />
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Cancelar
            </Button>
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <>
            <div className="space-y-4 py-2">
              {/* Summary counts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center p-3 bg-emerald-50 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mb-1" />
                  <span className="text-lg font-semibold text-emerald-700">{updated.length}</span>
                  <span className="text-[11px] text-emerald-600">Corregidos</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-slate-50 rounded-lg">
                  <MinusCircle className="h-5 w-5 text-slate-400 mb-1" />
                  <span className="text-lg font-semibold text-slate-600">{noChanges.length}</span>
                  <span className="text-[11px] text-slate-500">Sin cambios</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-red-50 rounded-lg">
                  <XCircle className="h-5 w-5 text-red-500 mb-1" />
                  <span className="text-lg font-semibold text-red-600">{errors.length}</span>
                  <span className="text-[11px] text-red-500">Errores</span>
                </div>
              </div>

              {/* Error details */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                  {errors.map((e) => (
                    <p key={e.id} className="text-xs text-red-600">
                      {e.error || 'Error desconocido'}
                    </p>
                  ))}
                </div>
              )}

              {/* Updated details */}
              {updated.length > 0 && (
                <p className="text-xs text-slate-500">
                  Se corrigieron un total de {updated.reduce((acc, r) => acc + r.fieldsChanged, 0)} campos
                  en {updated.length} documento{updated.length !== 1 ? 's' : ''}.
                </p>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <span className="text-[11px] text-slate-400">
                {totalTokens.toLocaleString()} tokens · ~${totalCost.toFixed(4)} USD
              </span>
              <Button onClick={handleClose}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
