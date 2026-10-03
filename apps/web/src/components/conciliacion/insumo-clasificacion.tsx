'use client'

import { useEffect, useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Tags } from 'lucide-react'

/**
 * Categoría y subcategoría del insumo: es con lo que se agrupa la planilla de
 * conteo. La categoría puede venir heredada del rubro del producto (en los
 * insumos de venta directa), y lo que se cargue acá la pisa.
 *
 * La subcategoría es el segundo nivel opcional —la bodega dentro de vinos—.
 * No se autocompleta desde el nombre a propósito: los prefijos no alcanzan
 * ("SANTA JULIA" y "SANTA ERCILIA" son bodegas distintas, "GRAN ENEMIGO" y
 * "GRAN ALAMBRADO" también), y una bodega mal puesta es peor que vacía.
 */
export function InsumoClasificacion({
  insumo,
  canEdit,
  categoriaHeredada,
  sugerencias,
}: {
  insumo: { id: string; categoria?: string | null; subcategoria?: string | null }
  canEdit: boolean
  /** Rubro del producto, cuando el insumo es de venta directa. */
  categoriaHeredada?: string | null
  /** Valores ya usados, para el desplegable. */
  sugerencias: { categorias: string[]; subcategorias: string[] }
}) {
  const qc = useQueryClient()
  const listaCat = useId()
  const listaSub = useId()
  const [categoria, setCategoria] = useState(insumo.categoria ?? '')
  const [subcategoria, setSubcategoria] = useState(insumo.subcategoria ?? '')

  // Al cambiar de insumo hay que recargar los campos: el componente no se
  // desmonta, solo le cambian las props.
  useEffect(() => {
    setCategoria(insumo.categoria ?? '')
    setSubcategoria(insumo.subcategoria ?? '')
  }, [insumo.id, insumo.categoria, insumo.subcategoria])

  const guardar = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria: categoria.trim() || null, subcategoria: subcategoria.trim() || null }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo guardar')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      toast.success('Clasificación guardada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const sucio =
    (categoria.trim() || null) !== (insumo.categoria ?? null) ||
    (subcategoria.trim() || null) !== (insumo.subcategoria ?? null)

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[10rem] flex-1">
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Categoría</label>
        <Input
          list={listaCat}
          disabled={!canEdit}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          placeholder={categoriaHeredada ?? 'Sin categoría'}
          className="h-8 text-sm"
        />
        <datalist id={listaCat}>
          {sugerencias.categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="min-w-[10rem] flex-1">
        <label className="mb-1 block text-[11px] font-medium text-slate-500">
          Subcategoría <span className="font-normal text-slate-400">(bodega, proveedor…)</span>
        </label>
        <Input
          list={listaSub}
          disabled={!canEdit}
          value={subcategoria}
          onChange={(e) => setSubcategoria(e.target.value)}
          placeholder="Opcional"
          className="h-8 text-sm"
        />
        <datalist id={listaSub}>
          {sugerencias.subcategorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      {canEdit && (
        <Button size="sm" variant="outline" disabled={!sucio || guardar.isPending} onClick={() => guardar.mutate()} className="h-8 gap-1.5">
          {guardar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tags className="h-3.5 w-3.5" />}
          Guardar
        </Button>
      )}
      {!categoria.trim() && categoriaHeredada && (
        <p className="w-full text-[11px] text-slate-400">
          Hoy se agrupa en <span className="font-medium text-slate-500">{categoriaHeredada}</span>, heredado del rubro del producto.
        </p>
      )}
    </div>
  )
}
