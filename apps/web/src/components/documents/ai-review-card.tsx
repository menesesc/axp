'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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

type CardStep = 'idle' | 'loading' | 'review' | 'applying' | 'error'

interface AIReviewCardProps {
  documentId: string
  onApplied?: () => void
}

export function AIReviewCard({ documentId, onApplied }: AIReviewCardProps) {
  const [step, setStep] = useState<CardStep>('idle')
  const [data, setData] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleReview = async () => {
    setStep('loading')
    setData(null)
    setError(null)

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

  const handleApply = async () => {
    if (!data) return
    setStep('applying')

    try {
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
      setStep('idle')
      setData(null)
      onApplied?.()
    } catch {
      setError('Error de conexión')
      setStep('error')
    }
  }

  const changedFields = data?.changes.filter(c => c.changed) ?? []
  const confianza = data?.suggestions?.confianza ?? 0

  const confianzaColor =
    confianza >= 80 ? 'bg-emerald-100 text-emerald-700' :
    confianza >= 50 ? 'bg-amber-100 text-amber-700' :
    'bg-red-100 text-red-700'

  // Idle: show the review button
  if (step === 'idle') {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <p className="text-sm font-medium text-violet-900">Revisión con IA</p>
          </div>
          <Button
            size="sm"
            onClick={handleReview}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Analizar documento
          </Button>
        </div>
        <p className="text-xs text-violet-600 mt-1">
          La IA analizará el PDF para completar o corregir los campos faltantes.
        </p>
      </div>
    )
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-6">
        <div className="flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
          <p className="text-sm font-medium text-violet-700">Analizando documento con IA...</p>
          <p className="text-xs text-violet-500">Esto puede tardar unos segundos</p>
        </div>
      </div>
    )
  }

  // Error
  if (step === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm font-medium text-red-700">Error en revisión con IA</p>
        </div>
        <p className="text-xs text-red-600 mb-3">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep('idle')}>
            Cerrar
          </Button>
          <Button variant="outline" size="sm" onClick={handleReview}>
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  // Applying
  if (step === 'applying') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6">
        <div className="flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">Aplicando cambios...</p>
        </div>
      </div>
    )
  }

  // Review: show results
  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <p className="text-sm font-medium text-violet-900">Sugerencias de la IA</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${confianzaColor}`}>
          Confianza: {confianza}%
        </span>
      </div>

      {changedFields.length > 0 ? (
        <div className="divide-y divide-violet-100 border border-violet-200 rounded-lg bg-white mb-3">
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
        <div className="flex items-center gap-2 bg-white border border-violet-200 rounded-lg px-3 py-4 mb-3 justify-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <p className="text-sm text-slate-600">La IA no encontró campos para corregir</p>
        </div>
      )}

      {/* AI notes */}
      {data?.suggestions.notas && (
        <p className="text-xs text-violet-600 italic mb-3">
          {data.suggestions.notas}
        </p>
      )}

      {/* Proveedor not found warning */}
      {data && !data.suggestions.proveedorId && data.suggestions.proveedorCuit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-amber-700">
            Proveedor detectado pero no registrado — CUIT: {data.suggestions.proveedorCuit}
            {data.suggestions.proveedorNombre && `, Nombre: ${data.suggestions.proveedorNombre}`}.
            Deberás crearlo manualmente.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-violet-500">
          {data ? (data.usage.inputTokens + data.usage.outputTokens).toLocaleString() : 0} tokens · ~${data?.usage.costoEstimado.toFixed(4) ?? '0'} USD
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setData(null) }}>
            Descartar
          </Button>
          {changedFields.length > 0 && (
            <Button size="sm" onClick={handleApply} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Aplicar cambios
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
