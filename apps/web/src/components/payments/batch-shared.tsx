'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Landmark, Check, Loader2, AlertTriangle, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Descarga un archivo de la API respetando el nombre del Content-Disposition. */
export async function descargarArchivo(url: string, fallback: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error || 'No se pudo descargar')
  }
  const cd = res.headers.get('Content-Disposition') || ''
  const filename = cd.match(/filename="?([^"]+)"?/)?.[1] || fallback
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

const TIPO_CORTO: Record<string, string> = { FACTURA: 'FC', NOTA_CREDITO: 'NC', REMITO: 'RM' }

export function etiquetaDoc(d: { tipo: string; letra: string | null; numeroCompleto: string | null }): string {
  return [TIPO_CORTO[d.tipo] ?? d.tipo, d.letra, d.numeroCompleto ?? 's/n'].filter(Boolean).join(' ')
}

/** YYYY-MM-DD → DD/MM/YY */
export function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y!.slice(2)}`
}

function cbuOk(v: string): boolean {
  return /^\d{22}$/.test(v)
}

/**
 * CBU del proveedor editable en el lugar: se muestra si existe, y si falta se
 * puede cargar sin salir de la pantalla de pagos (la validación del dígito
 * verificador la hace el servidor).
 */
export function CbuInline({
  proveedorId,
  cbu,
  onSaved,
  compact,
}: {
  proveedorId: string
  cbu: string | null
  onSaved: (cbu: string) => void
  compact?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(cbu ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const limpio = value.replace(/\D/g, '')
    if (!cbuOk(limpio)) {
      toast.error('El CBU/CVU debe tener 22 dígitos')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/proveedores/${proveedorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cbu: limpio }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'No se pudo guardar')
      }
      toast.success('CBU guardado')
      setEditing(false)
      onSaved(limpio)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="22 dígitos"
          inputMode="numeric"
          className="h-7 w-[200px] font-mono text-xs"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={saving} aria-label="Guardar CBU">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </Button>
      </div>
    )
  }

  if (!cbu) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        <AlertTriangle className="h-3 w-3" />
        Cargar CBU
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setValue(cbu)
        setEditing(true)
      }}
      className={cn('group inline-flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-slate-800', compact && 'text-[11px]')}
      title="Editar CBU"
    >
      <Landmark className="h-3 w-3 shrink-0" />
      {cbu}
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />
    </button>
  )
}
