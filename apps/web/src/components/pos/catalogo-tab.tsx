'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { AlertTriangle, Check, Plus, Search, X } from 'lucide-react'

/**
 * Catálogo de venta: categorías y productos con su precio.
 *
 * Se edita en la grilla, sin diálogos: cargar una carta es cambiar cuarenta
 * precios seguidos, y abrir y cerrar un modal cuarenta veces no es forma.
 */

interface Producto {
  id: string
  categoriaId: string | null
  categoriaNombre: string | null
  nombre: string
  nombreTicket: string | null
  precio: number
  alicuotaIva: number
  pantallas: string[]
  activo: boolean
  productoVenta: string | null
  descuentaStock: boolean
}

interface Categoria {
  id: string
  nombre: string
  padreId: string | null
  orden: number
  color: string | null
  emoji: string | null
  activa: boolean
  productos: number
}

const PANTALLAS: Array<[string, string]> = [
  ['rapida', 'Venta rápida'],
  ['salon', 'Salón'],
  ['comercio', 'Comercio'],
]

export function CatalogoTab({ data }: { data: { categorias: Categoria[]; productos: Producto[] } | undefined }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<Partial<Producto> & { motivoPrecio?: string }>({})
  const [nuevaCat, setNuevaCat] = useState('')
  const [nuevaCatPadre, setNuevaCatPadre] = useState('')
  const [verCats, setVerCats] = useState(false)

  const categorias = data?.categorias ?? []
  const productos = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (data?.productos ?? []).filter((p) => {
      if (t && !p.nombre.toLowerCase().includes(t)) return false
      if (categoria && p.categoriaId !== categoria) return false
      return true
    })
  }, [data, q, categoria])

  const refrescar = () => qc.invalidateQueries({ queryKey: ['pos-catalogo'] })

  const guardar = useMutation({
    mutationFn: async (p: Partial<Producto> & { id: string; motivoPrecio?: string }) => {
      const res = await fetch('/api/pos/catalogo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
    },
    onSuccess: () => {
      setEditando(null)
      setBorrador({})
      refrescar()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const crearCategoria = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pos/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevaCat,
          padreId: nuevaCatPadre || null,
          orden: (categorias.at(-1)?.orden ?? 0) + 10,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo crear')
    },
    onSuccess: () => {
      setNuevaCat('')
      refrescar()
      toast.success('Categoría creada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const guardarCategoria = useMutation({
    mutationFn: async (c: { id: string; nombre?: string; padreId?: string | null }) => {
      const res = await fetch('/api/pos/categorias', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
    },
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  })

  // Para el desplegable: "Vinos" y abajo "Vinos → Catena Zapata".
  const madres = categorias.filter((c) => !c.padreId)
  const etiqueta = (c: Categoria) =>
    c.padreId ? `${categorias.find((m) => m.id === c.padreId)?.nombre ?? ''} → ${c.nombre}` : c.nombre

  const sinStock = productos.filter((p) => !p.descuentaStock).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" className="pl-8 text-sm" />
        </div>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{etiqueta(c)} ({c.productos})</option>
          ))}
        </select>
        <span className="text-xs text-slate-400">{productos.length} productos</span>

        <div className="ml-auto flex items-center gap-1.5">
          <Input
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
            placeholder="Nueva categoría"
            className="h-10 w-40 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && nuevaCat.trim() && crearCategoria.mutate()}
          />
          {/* Dentro de qué va: así se arma "Vinos → Catena Zapata" sin un
              paso aparte. */}
          <select
            value={nuevaCatPadre}
            onChange={(e) => setNuevaCatPadre(e.target.value)}
            className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="">Categoría principal</option>
            {madres.map((c) => (
              <option key={c.id} value={c.id}>dentro de {c.nombre}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-10"
            disabled={!nuevaCat.trim() || crearCategoria.isPending}
            onClick={() => crearCategoria.mutate()}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <button
            onClick={() => setVerCats((v) => !v)}
            className="h-10 rounded-md px-2 text-sm text-slate-500 underline"
          >
            {verCats ? 'Ocultar categorías' : 'Ordenar categorías'}
          </button>
        </div>
      </div>

      {/* Mover una categoría adentro de otra: "Catena Zapata" pasa a colgar
          de "Vinos" y la carta se navega en dos toques en vez de uno largo. */}
      {verCats && (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {categorias.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-6 text-center">{c.emoji}</span>
              <Input
                key={`n-${c.id}`}
                defaultValue={c.nombre}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== c.nombre) guardarCategoria.mutate({ id: c.id, nombre: v })
                }}
                className="h-9 w-48 text-sm"
              />
              <select
                value={c.padreId ?? ''}
                onChange={(e) => guardarCategoria.mutate({ id: c.id, padreId: e.target.value || null })}
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              >
                <option value="">Categoría principal</option>
                {madres
                  .filter((m) => m.id !== c.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>dentro de {m.nombre}</option>
                  ))}
              </select>
              <span className="text-xs text-slate-400">{c.productos} productos</span>
            </div>
          ))}
        </div>
      )}

      {/* Un producto que no descuenta stock se vende contra nada: ni receta ni
          insumo de venta directa. Vale saberlo antes de que el inventario no
          cierre a fin de mes. */}
      {sinStock > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            {sinStock} de estos productos no descuentan stock: no tienen receta ni están vinculados a un insumo de
            venta directa. Se pueden vender igual, pero el inventario no se va a mover.
          </span>
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="w-full px-4 py-2">Producto</th>
              <th className="whitespace-nowrap px-3 py-2">Categoría</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">Precio</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">IVA</th>
              <th className="whitespace-nowrap px-3 py-2">Pantallas</th>
              <th className="w-20 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {productos.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-400">Sin productos.</td></tr>
            )}
            {productos.map((p) => {
              const edita = editando === p.id
              const v = <K extends keyof Producto>(k: K): Producto[K] => (edita && borrador[k] !== undefined ? (borrador[k] as Producto[K]) : p[k])
              return (
                <tr key={p.id} className={cn(!p.activo && 'opacity-50', edita && 'bg-sky-50/50')}>
                  <td className="max-w-0 px-4 py-2">
                    {edita ? (
                      <Input
                        value={String(v('nombre'))}
                        onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    ) : (
                      <>
                        <span className="block truncate font-medium">{p.nombre}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                          {p.productoVenta && <span className="truncate">en Maxirest: {p.productoVenta}</span>}
                          {!p.descuentaStock && <span className="text-amber-600">no descuenta stock</span>}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {edita ? (
                      <select
                        value={String(v('categoriaId') ?? '')}
                        onChange={(e) => setBorrador((b) => ({ ...b, categoriaId: e.target.value || null }))}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                      >
                        <option value="">Sin categoría</option>
                        {categorias.map((c) => <option key={c.id} value={c.id}>{etiqueta(c)}</option>)}
                      </select>
                    ) : (
                      p.categoriaNombre ?? '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {edita ? (
                      <Input
                        value={String(v('precio'))}
                        onChange={(e) => setBorrador((b) => ({ ...b, precio: Number(e.target.value.replace(',', '.')) || 0 }))}
                        className="h-8 w-28 text-right text-sm"
                        inputMode="decimal"
                      />
                    ) : (
                      formatCurrency(p.precio)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-slate-500">
                    {edita ? (
                      <select
                        value={String(v('alicuotaIva'))}
                        onChange={(e) => setBorrador((b) => ({ ...b, alicuotaIva: Number(e.target.value) }))}
                        className="h-8 rounded-md border border-slate-200 bg-white px-1 text-sm"
                      >
                        {[0, 2.5, 5, 10.5, 21, 27].map((a) => <option key={a} value={a}>{a}%</option>)}
                      </select>
                    ) : (
                      `${p.alicuotaIva}%`
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex gap-1">
                      {PANTALLAS.map(([clave, label]) => {
                        const actuales = (v('pantallas') as string[]) ?? []
                        // Vacío quiere decir "en todas": es lo más cómodo al
                        // importar, y evita que un producto no aparezca en
                        // ningún lado por olvido.
                        const on = actuales.length === 0 || actuales.includes(clave)
                        return (
                          <button
                            key={clave}
                            disabled={!edita}
                            title={label}
                            onClick={() => {
                              const base = actuales.length === 0 ? PANTALLAS.map(([c]) => c) : actuales
                              const nuevas = base.includes(clave) ? base.filter((x) => x !== clave) : [...base, clave]
                              setBorrador((b) => ({ ...b, pantallas: nuevas }))
                            }}
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                              on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400',
                              !edita && 'cursor-default'
                            )}
                          >
                            {label.slice(0, 3).toUpperCase()}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {edita ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => guardar.mutate({ ...borrador, id: p.id })}
                          className="grid h-7 w-7 place-items-center rounded bg-slate-900 text-white"
                          aria-label="Guardar"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditando(null); setBorrador({}) }}
                          className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100"
                          aria-label="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditando(p.id); setBorrador({}) }}
                        className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
