'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { UNIDADES, sameDimension } from '@/lib/conciliacion/units'
import { Plus, Trash2, Search, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { fmtNumAR } from '@/components/sales/shared'

interface Insumo { id: string; nombre: string; unidadBase: string }
interface ProductoEnReceta {
  productMasterId: string
  nombre: string
  rubroNombre: string | null
  cantidad: number
  unidad: string
  mermaPct: number
}
interface ProductoBusqueda {
  id: string
  nombre: string
  rubroNombre: string | null
  tieneReceta: boolean
}

export function InsumoRecetasPanel({ insumo, canEdit }: { insumo: Insumo; canEdit: boolean }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [picked, setPicked] = useState<ProductoBusqueda | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState(insumo.unidadBase)
  const [merma, setMerma] = useState('0')

  const { data, isLoading } = useQuery({
    queryKey: ['insumo-recetas', insumo.id],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/recetas`)
      if (!res.ok) throw new Error('Error cargando recetas')
      return res.json() as Promise<{ productos: ProductoEnReceta[] }>
    },
  })
  const productos = data?.productos ?? []
  const yaUsados = new Set(productos.map((p) => p.productMasterId))

  const { data: busqueda, isFetching: buscando } = useQuery({
    queryKey: ['conciliacion-productos', activeSearch],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/productos?q=${encodeURIComponent(activeSearch)}`)
      if (!res.ok) throw new Error('Error buscando productos')
      return res.json() as Promise<{ productos: ProductoBusqueda[] }>
    },
    enabled: !!activeSearch,
    staleTime: 30_000,
  })

  const upsert = useMutation({
    mutationFn: async (payload: { productMasterId: string; cantidad: number; unidad: string; mermaPct: number }) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/recetas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Error')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumo-recetas', insumo.id] })
      qc.invalidateQueries({ queryKey: ['insumo-detalle', insumo.id] })
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      qc.invalidateQueries({ queryKey: ['conciliacion-productos'] })
      toast.success('Receta actualizada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (productMasterId: string) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/recetas?productMasterId=${productMasterId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Error al quitar')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumo-recetas', insumo.id] })
      qc.invalidateQueries({ queryKey: ['insumo-detalle', insumo.id] })
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      toast.success('Quitado de la receta')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const dimWarn = !sameDimension(unidad, insumo.unidadBase)

  function resetAdd() {
    setPicked(null)
    setCantidad('')
    setUnidad(insumo.unidadBase)
    setMerma('0')
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        Productos de venta cuya receta usa <span className="font-medium text-slate-700">{insumo.nombre}</span>.
        Agregalos acá indicando cuánto consume cada unidad vendida (neto) y su merma.
      </p>

      {/* Productos que ya lo usan */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
          En recetas ({productos.length})
        </p>
        {isLoading ? (
          <p className="text-sm text-slate-400">Cargando...</p>
        ) : productos.length === 0 ? (
          <p className="text-sm text-slate-400">Todavía no se usa en ninguna receta.</p>
        ) : (
          <ul className="space-y-1">
            {productos.map((p) => (
              <li key={p.productMasterId} className="flex items-center justify-between gap-2 bg-slate-50 rounded-md px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-slate-700 block truncate">{p.nombre}</span>
                  <span className="text-[11px] text-slate-400">
                    {fmtNumAR(p.cantidad, 3)} {p.unidad} / u{p.mermaPct > 0 ? ` · merma ${fmtNumAR(p.mermaPct, 1)}%` : ''}
                  </span>
                </span>
                {canEdit && (
                  <button
                    onClick={() => remove.mutate(p.productMasterId)}
                    className="text-slate-400 hover:text-red-500 shrink-0"
                    title="Quitar de la receta"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Agregar a un producto */}
      {canEdit && (
        <div className="border-t border-slate-100 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-indigo-500" /> Agregar a un producto de venta
          </p>

          {picked ? (
            <div className="bg-slate-50 rounded-md p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700 truncate">{picked.nombre}</span>
                <button onClick={resetAdd} className="text-xs text-slate-400 hover:text-slate-600">cambiar</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] text-slate-500">Cantidad (neto)</label>
                  <Input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="text-sm" autoFocus />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Unidad</label>
                  <select
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value)}
                    className={`w-full border rounded-md px-1 py-1.5 text-sm bg-white ${dimWarn ? 'border-amber-400' : 'border-slate-200'}`}
                  >
                    {UNIDADES.map((un) => <option key={un} value={un}>{un}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500">Merma %</label>
                  <Input type="number" step="any" value={merma} onChange={(e) => setMerma(e.target.value)} className="text-sm" />
                </div>
              </div>
              {dimWarn && (
                <p className="text-[11px] text-amber-600">
                  La unidad &quot;{unidad}&quot; no es compatible con la base &quot;{insumo.unidadBase}&quot; del insumo.
                </p>
              )}
              <Button
                size="sm"
                disabled={!cantidad || Number(cantidad) <= 0 || dimWarn || upsert.isPending}
                onClick={() =>
                  upsert.mutate(
                    { productMasterId: picked.id, cantidad: Number(cantidad), unidad, mermaPct: Number(merma) || 0 },
                    { onSuccess: resetAdd }
                  )
                }
              >
                <Plus className="h-4 w-4 mr-1" /> {upsert.isPending ? 'Guardando...' : 'Agregar a la receta'}
              </Button>
            </div>
          ) : (
            <>
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setActiveSearch(search.trim()) }}>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto de venta..." className="pl-8 text-sm" />
                </div>
                <Button type="submit" size="sm" variant="outline">Buscar</Button>
              </form>

              {buscando && <p className="text-sm text-slate-400 mt-3">Buscando...</p>}
              {busqueda && busqueda.productos.length === 0 && (
                <p className="text-sm text-slate-400 mt-3">Sin productos para esa búsqueda.</p>
              )}
              {busqueda && busqueda.productos.length > 0 && (
                <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
                  {busqueda.productos.map((p) => {
                    const usado = yaUsados.has(p.id)
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-md px-3 py-2 text-sm hover:bg-slate-50">
                        <div className="min-w-0">
                          <p className="text-slate-700 truncate">{p.nombre}</p>
                          <p className="text-[11px] text-slate-400">{p.rubroNombre ?? 'Sin rubro'}</p>
                        </div>
                        {usado ? (
                          <span className="text-[11px] text-emerald-600 shrink-0">ya incluido</span>
                        ) : (
                          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setPicked(p)}>
                            <Plus className="h-4 w-4 mr-1" /> Elegir
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
