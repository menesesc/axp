'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Grilla de productos para dedo, no para mouse.
 *
 * Todo lo que se toca mide 64 px o más, que es el mínimo cómodo para un dedo
 * apurado sobre una pantalla sucia. Nada de hover: en una tablet no existe, y
 * el estado se muestra con color y tamaño.
 *
 * Primero la categoría y después el producto, en dos pasos. Con 265 productos
 * una sola lista obliga a buscar, y buscar con teclado en pantalla es lo más
 * lento que hay en un salón lleno.
 */

export interface ProductoPos {
  id: string
  nombre: string
  precio: number
  alicuotaIva: number
  categoriaId: string | null
  color: string | null
}

export interface CategoriaPos {
  id: string
  nombre: string
  color: string | null
  emoji: string | null
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function GrillaProductos({
  categorias,
  productos,
  onElegir,
}: {
  categorias: CategoriaPos[]
  productos: ProductoPos[]
  onElegir: (p: ProductoPos) => void
}) {
  const [categoria, setCategoria] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t) return productos.filter((p) => p.nombre.toLowerCase().includes(t)).slice(0, 60)
    if (!categoria) return []
    return productos.filter((p) => p.categoriaId === categoria)
  }, [productos, categoria, q])

  const conteo = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of productos) if (p.categoriaId) m.set(p.categoriaId, (m.get(p.categoriaId) ?? 0) + 1)
    return m
  }, [productos])

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto"
          className="h-14 w-full rounded-xl border border-slate-200 pl-12 pr-12 text-lg outline-none focus:border-slate-900"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            aria-label="Limpiar"
            className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-400"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {!q && (
        <div className="mb-3 flex flex-wrap gap-2">
          {categoria && (
            <button
              onClick={() => setCategoria(null)}
              className="h-16 rounded-xl bg-slate-900 px-5 text-base font-semibold text-white"
            >
              ← Categorías
            </button>
          )}
          {!categoria &&
            categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoria(c.id)}
                style={c.color ? { backgroundColor: c.color } : undefined}
                className={cn(
                  'flex h-24 min-w-[9rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-4 text-center active:scale-[0.98]',
                  c.color ? 'text-white' : 'bg-slate-100 text-slate-800'
                )}
              >
                {c.emoji && <span className="text-2xl leading-none">{c.emoji}</span>}
                <span className="text-base font-semibold leading-tight">{c.nombre}</span>
                <span className="text-xs opacity-60">{conteo.get(c.id) ?? 0}</span>
              </button>
            ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibles.length === 0 ? (
          <p className="py-16 text-center text-slate-400">
            {q ? 'Ningún producto coincide' : 'Elegí una categoría'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {visibles.map((p) => (
              <button
                key={p.id}
                onClick={() => onElegir(p)}
                style={p.color ? { backgroundColor: p.color } : undefined}
                className={cn(
                  'flex h-24 flex-col justify-between rounded-xl border border-slate-200 p-3 text-left active:scale-[0.98]',
                  p.color ? 'text-white' : 'bg-white'
                )}
              >
                <span className="line-clamp-2 text-sm font-medium leading-tight">{p.nombre}</span>
                <span className="text-base font-bold tabular-nums">{pesos(p.precio)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
