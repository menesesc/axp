'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { UploadCloud, FileText, Loader2, Eye, X } from 'lucide-react'

interface Props {
  pagoId: string
  comprobanteKey: string | null
  /** Se llama tras subir o quitar el comprobante (para refrescar la orden). */
  onChange: () => void
}

/**
 * Comprobante de transferencia a nivel orden. Zona drag & drop (o click) para
 * subir el PDF de la transferencia. Disponible incluso con la orden ya EMITIDA:
 * al subirlo, el PDF final lo anexa automáticamente (volvé a "Descargar PDF").
 */
export function TransferReceiptCard({ pagoId, comprobanteKey, onChange }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo excede 10MB')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/pagos/${pagoId}/comprobante`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Error al subir')
      }
      toast.success('Comprobante adjuntado. Volvé a descargar el PDF para incluirlo.')
      onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  const remove = async () => {
    setUploading(true)
    try {
      const res = await fetch(`/api/pagos/${pagoId}/comprobante`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al quitar')
      toast.success('Comprobante quitado')
      onChange()
    } catch {
      toast.error('Error al quitar el comprobante')
    } finally {
      setUploading(false)
    }
  }

  const view = async () => {
    if (!comprobanteKey) return
    setViewing(true)
    try {
      const res = await fetch(`/api/pagos/attachment?key=${encodeURIComponent(comprobanteKey)}`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      window.open(d.url, '_blank')
    } catch {
      toast.error('Error al abrir el comprobante')
    } finally {
      setViewing(false)
    }
  }

  const nombreArchivo = comprobanteKey
    ? comprobanteKey.split('/').pop()?.replace(/^transferencia-\d+-/, '') ?? 'Comprobante'
    : null

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Comprobante de transferencia</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ''
          }}
        />

        {comprobanteKey ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="text-sm text-slate-700 truncate" title={nombreArchivo ?? ''}>
                {nombreArchivo}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-8" onClick={view} disabled={viewing}>
                {viewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => inputRef.current?.click()} disabled={uploading}>
                Reemplazar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-red-600"
                onClick={remove}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) upload(f)
            }}
            disabled={uploading}
            className={`w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
              isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
            ) : (
              <UploadCloud className="h-6 w-6 text-slate-400" />
            )}
            <span className="text-sm text-slate-600">
              Arrastrá el PDF de la transferencia o <span className="text-blue-600 font-medium">buscá el archivo</span>
            </span>
            <span className="text-xs text-slate-400">PDF, máx. 10MB</span>
          </button>
        )}
      </CardContent>
    </Card>
  )
}
