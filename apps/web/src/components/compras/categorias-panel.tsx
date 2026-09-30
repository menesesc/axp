'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { Check, Loader2, Pencil, Plus, Settings2, Sparkles, Tags, Trash2, X } from 'lucide-react'
import { CategoriaBadge, CategoriaPicker } from './categoria-badge'

export interface CategoriaResumen {
  id: string
  nombre: string
  abreviatura: string | null
  orden: number
  lineas: number
  descripciones: number
  subtotal: number
}

export interface CategoriasResponse {
  categorias: CategoriaResumen[]
  sinCategoria: { lineas: number; descripciones: number; subtotal: number }
  pendientes: number
}

/** Categorías de compra + resumen del período con los filtros de la página. */
export function useCategorias(filtros: string, enabled: boolean) {
  return useQuery<CategoriasResponse>({
    queryKey: ['compra-categorias', filtros],
    queryFn: async () => {
      const res = await fetch(`/api/items/categorias?${filtros}`)
      if (!res.ok) throw new Error('No se pudieron cargar las categorías')
      return res.json()
    },
    enabled,
    staleTime: 30000,
  })
}

/**
 * Card "Por categoría": subtotal de cada categoría en el período. Un click
 * filtra la tabla por esa categoría. Si hay descripciones sin clasificar,
 * ofrece clasificarlas con IA (se hace en tandas, mostrando el progreso).
 */
export function CategoriasPanel({
  data,
  categoriaId,
  onSelect,
  canEdit,
  verImportes,
}: {
  data: CategoriasResponse | undefined
  categoriaId: string
  onSelect: (id: string) => void
  canEdit: boolean
  verImportes: boolean
}) {
  const queryClient = useQueryClient()
  const [clasificando, setClasificando] = useState<{ hechos: number; total: number } | null>(null)
  const [gestionar, setGestionar] = useState(false)

  const clasificar = async () => {
    const total = data?.pendientes ?? 0
    setClasificando({ hechos: 0, total })
    let hechos = 0
    try {
      for (;;) {
        const res = await fetch('/api/items/categorias/auto', { method: 'POST' })
        const r = await res.json()
        if (!res.ok) throw new Error(r.error || 'Error al clasificar')
        hechos += r.clasificados
        setClasificando({ hechos, total: Math.max(total, hechos + r.pendientes) })
        if (r.pendientes === 0 || r.clasificados === 0) break
      }
      toast.success(`${hechos} descripciones clasificadas`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al clasificar')
    } finally {
      setClasificando(null)
      queryClient.invalidateQueries({ queryKey: ['compra-categorias'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    }
  }

  const cats = (data?.categorias ?? []).filter((c) => c.lineas > 0)
  const orden = verImportes
    ? [...cats].sort((a, b) => b.subtotal - a.subtotal)
    : [...cats].sort((a, b) => b.lineas - a.lineas)
  const max = Math.max(1, ...orden.map((c) => (verImportes ? c.subtotal : c.lineas)))
  const total = orden.reduce((s, c) => s + (verImportes ? c.subtotal : c.lineas), 0)

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-slate-900 flex items-center gap-2">
          <Tags className="h-4 w-4" />
          Por categoría
        </h3>
        {canEdit && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setGestionar(true)} title="Gestionar categorías">
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!data ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {orden.map((c) => {
            const valor = verImportes ? c.subtotal : c.lineas
            const activa = categoriaId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(activa ? '' : c.id)}
                className={`w-full text-left rounded-md px-2 py-1.5 transition-colors ${
                  activa ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={`truncate flex items-center gap-1.5 ${activa ? 'font-semibold text-emerald-800' : 'font-medium'}`}>
                    <CategoriaBadge categoria={c} />
                    {c.nombre}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    {verImportes ? formatCurrency(c.subtotal) : `${c.lineas} líneas`}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(valor / max) * 100}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 w-9 text-right tabular-nums">
                    {total > 0 ? `${Math.round((valor / total) * 100)}%` : ''}
                  </span>
                </div>
              </button>
            )
          })}
          {data.sinCategoria.lineas > 0 && (
            <button
              type="button"
              onClick={() => onSelect(categoriaId === 'sin' ? '' : 'sin')}
              className={`w-full text-left rounded-md px-2 py-1.5 text-sm flex justify-between ${
                categoriaId === 'sin' ? 'bg-amber-50 ring-1 ring-amber-300' : 'hover:bg-slate-50'
              }`}
            >
              <span className="text-amber-700">Sin categoría</span>
              <span className="text-slate-500 tabular-nums">{data.sinCategoria.lineas} líneas</span>
            </button>
          )}
          {orden.length === 0 && data.sinCategoria.lineas === 0 && (
            <p className="text-sm text-slate-400">Sin datos</p>
          )}
        </div>
      )}

      {canEdit && (data?.pendientes ?? 0) > 0 && (
        <div className="mt-3 pt-3 border-t">
          {clasificando ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Clasificando {clasificando.hechos} / {clasificando.total}…
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 transition-all"
                  style={{ width: `${clasificando.total ? (clasificando.hechos / clasificando.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={clasificar}>
              <Sparkles className="h-4 w-4 text-violet-500" />
              Clasificar {data!.pendientes} con IA
            </Button>
          )}
        </div>
      )}

      {canEdit && (
        <GestionarCategoriasDialog open={gestionar} onOpenChange={setGestionar} categorias={data?.categorias ?? []} />
      )}
    </div>
  )
}

/** Badge de categoría de una línea; al tocarlo se cambia (afecta todas las líneas con esa descripción). */
export function CategoriaCell({
  descripcion,
  categoria,
  categorias,
  canEdit,
}: {
  descripcion: string
  categoria: { id: string; nombre: string | null; abreviatura?: string | null; fuente: string | null } | null
  categorias: Array<{ id: string; nombre: string; abreviatura?: string | null }>
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const asignar = useMutation({
    mutationFn: async (categoriaId: string) => {
      const res = await fetch('/api/items/categorias/asignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descripcion, categoriaId }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'Error al asignar')
      return r
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['compra-categorias'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <CategoriaPicker
      categoria={categoria}
      fuente={categoria?.fuente ?? null}
      categorias={categorias}
      canEdit={canEdit}
      onChange={(id) => asignar.mutateAsync(id).catch(() => undefined)}
    />
  )
}

function GestionarCategoriasDialog({
  open,
  onOpenChange,
  categorias,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  categorias: CategoriaResumen[]
}) {
  const queryClient = useQueryClient()
  const [nueva, setNueva] = useState('')
  const [editando, setEditando] = useState<{ id: string; nombre: string; abreviatura: string } | null>(null)
  const [nuevaAbrev, setNuevaAbrev] = useState('')

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['compra-categorias'] })
    queryClient.invalidateQueries({ queryKey: ['items'] })
  }

  const llamar = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const r = await res.json()
    if (!res.ok) throw new Error(r.error || 'Error')
    return r
  }

  const crear = async () => {
    if (!nueva.trim()) return
    try {
      await llamar('/api/items/categorias', 'POST', { nombre: nueva, abreviatura: nuevaAbrev })
      setNueva('')
      setNuevaAbrev('')
      refrescar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  const renombrar = async () => {
    if (!editando) return
    try {
      await llamar(`/api/items/categorias/${editando.id}`, 'PATCH', { nombre: editando.nombre, abreviatura: editando.abreviatura })
      setEditando(null)
      refrescar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  const eliminar = async (c: CategoriaResumen) => {
    try {
      await llamar(`/api/items/categorias/${c.id}`, 'DELETE')
      toast.success(`"${c.nombre}" eliminada${c.descripciones ? '. Sus items pasaron a Otros' : ''}`)
      refrescar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Categorías de compra</DialogTitle>
          <DialogDescription>
            La IA usa esta lista para clasificar los items nuevos. La abreviatura es el badge que se ve en Items y en cada documento. Al eliminar una categoría, sus items pasan a Otros.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto divide-y border rounded-md">
          {categorias.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editando?.id === c.id ? (
                <>
                  <Input
                    value={editando.abreviatura}
                    onChange={(e) => setEditando({ ...editando, abreviatura: e.target.value.toUpperCase().slice(0, 6) })}
                    onKeyDown={(e) => e.key === 'Enter' && renombrar()}
                    placeholder="ABR"
                    className="h-8 w-20 uppercase"
                  />
                  <Input
                    autoFocus
                    value={editando.nombre}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && renombrar()}
                    className="h-8"
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={renombrar}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <CategoriaBadge categoria={c} className="w-12 justify-center" />
                  <span className="flex-1 text-sm">{c.nombre}</span>
                  <span className="text-xs text-slate-400">{c.descripciones || ''}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando({ id: c.id, nombre: c.nombre, abreviatura: c.abreviatura ?? '' })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {c.nombre.toLowerCase() !== 'otros' && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => eliminar(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="ABR"
            value={nuevaAbrev}
            onChange={(e) => setNuevaAbrev(e.target.value.toUpperCase().slice(0, 6))}
            className="w-20 uppercase"
          />
          <Input
            placeholder="Nueva categoría"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && crear()}
          />
          <Button onClick={crear} className="gap-1">
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
