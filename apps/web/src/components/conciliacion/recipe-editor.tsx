'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { UNIDADES, sameDimension } from '@/lib/conciliacion/units'
import { Plus, Trash2, Save, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface Insumo { id: string; nombre: string; unidadBase: string }
interface RecetaItem {
  insumoId: string | null
  itemDescripcion: string
  cantidad: string
  unidad: string
  mermaPct: string
}
interface RecetaResponse {
  producto: { id: string; nombre: string }
  receta: {
    id: string
    version: number
    notas: string | null
    items: Array<{
      insumoId: string | null
      itemDescripcion: string
      cantidad: number
      unidad: string
      mermaPct: number
    }>
  } | null
}

const emptyItem = (): RecetaItem => ({ insumoId: null, itemDescripcion: '', cantidad: '', unidad: 'u', mermaPct: '0' })

export function RecipeEditor({ productMasterId, canEdit }: { productMasterId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const [items, setItems] = useState<RecetaItem[]>([])
  const [notas, setNotas] = useState('')
  const [recetaId, setRecetaId] = useState<string | null>(null)

  const { data: insumosData } = useQuery({
    queryKey: ['conciliacion-insumos'],
    queryFn: async () => {
      const res = await fetch('/api/conciliacion/insumos?activo=true')
      if (!res.ok) throw new Error('Error cargando insumos')
      return res.json() as Promise<{ insumos: Insumo[] }>
    },
  })
  const insumos = insumosData?.insumos ?? []
  const insumoById = new Map(insumos.map((i) => [i.id, i]))

  const { data, isLoading } = useQuery({
    queryKey: ['conciliacion-receta', productMasterId],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/recetas?productMasterId=${productMasterId}`)
      if (!res.ok) throw new Error('Error cargando receta')
      return res.json() as Promise<RecetaResponse>
    },
  })

  useEffect(() => {
    if (!data) return
    setRecetaId(data.receta?.id ?? null)
    setNotas(data.receta?.notas ?? '')
    setItems(
      data.receta?.items.map((it) => ({
        insumoId: it.insumoId,
        itemDescripcion: it.itemDescripcion,
        cantidad: String(it.cantidad),
        unidad: it.unidad,
        mermaPct: String(it.mermaPct),
      })) ?? []
    )
  }, [data])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        productMasterId,
        notas,
        items: items.map((it) => ({
          insumoId: it.insumoId || null,
          itemDescripcion: it.itemDescripcion.trim(),
          cantidad: Number(it.cantidad),
          unidad: it.unidad,
          mermaPct: Number(it.mermaPct) || 0,
        })),
      }
      const res = await fetch('/api/conciliacion/recetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Error al guardar')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacion-receta', productMasterId] })
      qc.invalidateQueries({ queryKey: ['conciliacion-productos'] })
      toast.success('Receta guardada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const del = useMutation({
    mutationFn: async () => {
      if (!recetaId) return
      const res = await fetch(`/api/conciliacion/recetas/${recetaId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al borrar')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacion-receta', productMasterId] })
      qc.invalidateQueries({ queryKey: ['conciliacion-productos'] })
      toast.success('Receta eliminada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function updateItem(idx: number, patch: Partial<RecetaItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function pickInsumo(idx: number, insumoId: string) {
    const ins = insumoById.get(insumoId)
    updateItem(idx, {
      insumoId: insumoId || null,
      ...(ins ? { itemDescripcion: items[idx]!.itemDescripcion || ins.nombre, unidad: ins.unidadBase } : {}),
    })
  }

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Cargando receta...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">
          {data?.producto.nombre}
          {data?.receta && <span className="ml-2 text-xs text-slate-400">v{data.receta.version}</span>}
        </h3>
        {canEdit && recetaId && (
          <button onClick={() => del.mutate()} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar receta
          </button>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-slate-400">Sin ingredientes. Agregá uno para empezar la receta.</p>
      )}

      <div className="space-y-2">
        {items.map((it, idx) => {
          const ins = it.insumoId ? insumoById.get(it.insumoId) : null
          const dimWarn = ins ? !sameDimension(it.unidad, ins.unidadBase) : false
          return (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-slate-50 rounded-md p-2.5">
              <div className="col-span-12 sm:col-span-4">
                <label className="text-[11px] text-slate-500">Insumo</label>
                <select
                  value={it.insumoId ?? ''}
                  onChange={(e) => pickInsumo(idx, e.target.value)}
                  disabled={!canEdit}
                  className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">— sin vincular —</option>
                  {insumos.map((i) => (
                    <option key={i.id} value={i.id}>{i.nombre} ({i.unidadBase})</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-3">
                <label className="text-[11px] text-slate-500">Descripción</label>
                <Input
                  value={it.itemDescripcion}
                  onChange={(e) => updateItem(idx, { itemDescripcion: e.target.value })}
                  disabled={!canEdit}
                  placeholder="ej. Lomo"
                  className="text-sm"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className="text-[11px] text-slate-500">Cantidad</label>
                <Input
                  type="number"
                  step="any"
                  value={it.cantidad}
                  onChange={(e) => updateItem(idx, { cantidad: e.target.value })}
                  disabled={!canEdit}
                  className="text-sm"
                />
              </div>
              <div className="col-span-4 sm:col-span-1">
                <label className="text-[11px] text-slate-500">Unidad</label>
                <select
                  value={it.unidad}
                  onChange={(e) => updateItem(idx, { unidad: e.target.value })}
                  disabled={!canEdit}
                  className={`w-full border rounded-md px-1 py-1.5 text-sm bg-white ${dimWarn ? 'border-amber-400' : 'border-slate-200'}`}
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="text-[11px] text-slate-500">Merma %</label>
                <Input
                  type="number"
                  step="any"
                  value={it.mermaPct}
                  onChange={(e) => updateItem(idx, { mermaPct: e.target.value })}
                  disabled={!canEdit}
                  className="text-sm"
                />
              </div>
              {canEdit && (
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-500 p-1.5"
                    title="Quitar ingrediente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
              {dimWarn && ins && (
                <p className="col-span-12 text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  La unidad &quot;{it.unidad}&quot; no es compatible con la base &quot;{ins.unidadBase}&quot; del insumo.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {canEdit && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
            <Plus className="h-4 w-4 mr-1" /> Agregar ingrediente
          </Button>
          <Button size="sm" disabled={save.isPending || items.length === 0} onClick={() => save.mutate()}>
            <Save className="h-4 w-4 mr-1" /> {save.isPending ? 'Guardando...' : 'Guardar receta'}
          </Button>
        </div>
      )}
    </div>
  )
}
