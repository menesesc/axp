'use client'

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, Loader2, Sparkles } from 'lucide-react'

export interface CategoriaLite {
  id: string
  nombre: string
  abreviatura?: string | null
}

// Clases literales (Tailwind no ve clases armadas en runtime).
const PALETA = [
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-lime-100 text-lime-800 border-lime-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-stone-200 text-stone-800 border-stone-300',
]

/** Color estable por categoría (hash del nombre), igual en todas las pantallas. */
export function colorCategoria(nombre: string): string {
  let h = 0
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETA[h % PALETA.length]!
}

/** Abreviatura a mostrar: la cargada o las 3 primeras letras del nombre. */
export function abrevDe(c: { nombre: string; abreviatura?: string | null }): string {
  if (c.abreviatura?.trim()) return c.abreviatura.trim().toUpperCase()
  return c.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 3)
    .toUpperCase()
}

export function CategoriaBadge({
  categoria,
  fuente,
  className = '',
}: {
  categoria: { nombre: string | null; abreviatura?: string | null } | null
  fuente?: string | null
  className?: string
}) {
  if (!categoria?.nombre) {
    return (
      <span className={`inline-flex items-center rounded border border-dashed border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ${className}`}>
        S/C
      </span>
    )
  }
  const c = { nombre: categoria.nombre, abreviatura: categoria.abreviatura ?? null }
  return (
    <span
      title={`${c.nombre}${fuente === 'ia' ? ' (asignada por IA)' : ''}`}
      className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${colorCategoria(c.nombre)} ${className}`}
    >
      {abrevDe(c)}
      {fuente === 'ia' && <Sparkles className="h-2.5 w-2.5 opacity-50" />}
    </span>
  )
}

/**
 * Badge de categoría que, si se puede editar, abre la lista para cambiarla.
 * `onChange` recibe el id elegido; mientras resuelve muestra un spinner.
 */
export function CategoriaPicker({
  categoria,
  fuente,
  categorias,
  canEdit,
  onChange,
}: {
  categoria: { id: string; nombre: string | null; abreviatura?: string | null } | null
  fuente?: string | null
  categorias: CategoriaLite[]
  canEdit: boolean
  onChange: (categoriaId: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)

  if (!canEdit) return <CategoriaBadge categoria={categoria} fuente={fuente ?? null} />

  const elegir = async (id: string) => {
    setOpen(false)
    if (id === categoria?.id) return
    setGuardando(true)
    try {
      await onChange(id)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center hover:opacity-80" title="Cambiar categoría">
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : <CategoriaBadge categoria={categoria} fuente={fuente ?? null} />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1 max-h-80 overflow-y-auto" align="start">
        {categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => elegir(c.id)}
            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100 text-left"
          >
            <CategoriaBadge categoria={c} className="w-11 justify-center" />
            <span className="flex-1 truncate">{c.nombre}</span>
            {c.id === categoria?.id && <Check className="h-3.5 w-3.5 text-emerald-600" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
