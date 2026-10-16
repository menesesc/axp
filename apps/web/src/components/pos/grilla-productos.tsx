'use client'

import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, List, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Grilla de productos para dedo, no para mouse.
 *
 * Todo lo que se toca mide 64 px o más, que es el mínimo cómodo para un dedo
 * apurado sobre una pantalla sucia. Nada de hover: en una tablet no existe, y
 * el estado se muestra con color y tamaño.
 *
 * Con 265 productos una sola lista obliga a buscar, y buscar con teclado en
 * pantalla es lo más lento que hay en un salón lleno: por eso las categorías
 * están siempre a la vista y la primera ya abierta.
 */

export interface ProductoPos {
  id: string
  nombre: string
  precio: number
  alicuotaIva: number
  categoriaId: string | null
  color: string | null
  icono?: string | null
  fotoKey?: string | null
}

export interface CategoriaPos {
  id: string
  nombre: string
  color: string | null
  emoji: string | null
  /** "Vinos → Catena Zapata": ochenta etiquetas en un nivel no se navegan. */
  padreId?: string | null
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const sinTildes = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const RECIENTES = 'pos-recientes'
const MAX_RECIENTES = 16
const leerRecientes = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECIENTES) ?? '[]')
  } catch {
    return []
  }
}

/**
 * Categorías siempre a la vista en una tira (y sus subcategorías en una
 * segunda), con la primera ya abierta: no hay un paso vacío de "elegí una
 * categoría". "Recientes" junta lo último que se cargó en este dispositivo,
 * que es lo que más se repite (el agua, el pan, el café).
 */
export function GrillaProductos({
  categorias,
  productos,
  onElegir,
  enPedido = {},
}: {
  categorias: CategoriaPos[]
  productos: ProductoPos[]
  onElegir: (p: ProductoPos) => void
  /** Cuántas unidades de cada producto hay ya en el pedido abierto. */
  enPedido?: Record<string, number>
}) {
  const [categoria, setCategoria] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [vista, setVista] = useState<'grilla' | 'lista'>('grilla')
  const [recientes, setRecientes] = useState<string[]>([])
  const [tocado, setTocado] = useState<string | null>(null)

  useEffect(() => setRecientes(leerRecientes()), [])

  const raiz = useMemo(() => categorias.filter((c) => !c.padreId), [categorias])
  const actual = categorias.find((c) => c.id === categoria)
  // La categoría de primer nivel que está abierta (la propia o la madre).
  const madre = actual?.padreId ? categorias.find((c) => c.id === actual.padreId) : actual
  const hijas = useMemo(() => (madre ? categorias.filter((c) => c.padreId === madre.id) : []), [categorias, madre])

  // Arranca abierta: recientes si hay, si no la primera categoría.
  useEffect(() => {
    if (categoria || q) return
    if (recientes.length) setCategoria('__recientes')
    else if (raiz[0]) setCategoria(raiz[0].id)
  }, [raiz, recientes.length, categoria, q])

  const visibles = useMemo(() => {
    // Por palabras sueltas y en cualquier orden, sin acentos: "mal alamos"
    // encuentra "ALAMOS MALBEC".
    const palabras = sinTildes(q).split(/\s+/).filter(Boolean)
    if (palabras.length > 0) {
      return productos.filter((p) => palabras.every((w) => sinTildes(p.nombre).includes(w))).slice(0, 80)
    }
    if (categoria === '__recientes') {
      const porId = new Map(productos.map((p) => [p.id, p]))
      return recientes.map((id) => porId.get(id)).filter((p): p is ProductoPos => !!p)
    }
    if (!categoria) return []
    // Una categoría madre muestra todo lo que cuelga de ella.
    const ids = new Set([categoria, ...categorias.filter((c) => c.padreId === categoria).map((c) => c.id)])
    return productos.filter((p) => p.categoriaId && ids.has(p.categoriaId))
  }, [productos, categorias, categoria, q, recientes])

  const conteo = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of productos) if (p.categoriaId) m.set(p.categoriaId, (m.get(p.categoriaId) ?? 0) + 1)
    for (const c of categorias) if (c.padreId) m.set(c.padreId, (m.get(c.padreId) ?? 0) + (m.get(c.id) ?? 0))
    return m
  }, [productos, categorias])

  const elegir = (p: ProductoPos) => {
    onElegir(p)
    setTocado(p.id)
    setTimeout(() => setTocado((t) => (t === p.id ? null : t)), 350)
    const nuevos = [p.id, ...recientes.filter((id) => id !== p.id)].slice(0, MAX_RECIENTES)
    setRecientes(nuevos)
    try {
      localStorage.setItem(RECIENTES, JSON.stringify(nuevos))
    } catch {}
  }

  const Chip = ({ id, texto, emoji, color, n }: { id: string; texto: string; emoji?: string | null; color?: string | null; n?: number }) => {
    const activa = categoria === id || (id === madre?.id && !!actual?.padreId)
    return (
      <button
        onClick={() => {
          setQ('')
          setCategoria(id)
        }}
        style={activa && color ? { backgroundColor: color, color: '#fff' } : undefined}
        className={cn(
          'flex h-12 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors active:scale-[0.97]',
          activa ? (color ? '' : 'bg-slate-900 text-white') : 'bg-white text-slate-700 ring-1 ring-slate-200'
        )}
      >
        {emoji && <span className="text-lg leading-none">{emoji}</span>}
        {!emoji && color && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: activa ? '#fff' : color }} />}
        {texto}
        {n != null && <span className={cn('text-xs font-normal', activa ? 'opacity-80' : 'text-slate-400')}>{n}</span>}
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto (por cualquier palabra)"
          className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-28 text-lg outline-none focus:border-[#3b9bff] focus:ring-4 focus:ring-[#3b9bff]/15"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            aria-label="Limpiar"
            className="absolute right-16 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-400"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {/* Lista para quien prefiere leer, grilla para quien busca con la
            vista. Es preferencia de cada persona, no del negocio. */}
        <button
          onClick={() => setVista((v) => (v === 'grilla' ? 'lista' : 'grilla'))}
          aria-label={vista === 'grilla' ? 'Ver como lista' : 'Ver como grilla'}
          className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl bg-slate-100 text-slate-600"
        >
          {vista === 'grilla' ? <List className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
        </button>
      </div>

      {!q && (
        <>
          <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {recientes.length > 0 && <Chip id="__recientes" texto="Recientes" emoji="🕘" n={recientes.length} />}
            {raiz.map((c) => (
              <Chip key={c.id} id={c.id} texto={c.nombre} emoji={c.emoji} color={c.color} n={conteo.get(c.id) ?? 0} />
            ))}
          </div>
          {hijas.length > 0 && (
            <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              <button
                onClick={() => setCategoria(madre!.id)}
                className={cn('h-10 shrink-0 rounded-lg px-3 text-sm', categoria === madre!.id ? 'bg-slate-200 font-semibold text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200')}
              >
                Todo {madre!.nombre}
              </button>
              {hijas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoria(c.id)}
                  className={cn('h-10 shrink-0 rounded-lg px-3 text-sm', categoria === c.id ? 'bg-slate-200 font-semibold text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200')}
                >
                  {c.nombre} <span className="text-xs text-slate-400">{conteo.get(c.id) ?? 0}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        {visibles.length === 0 ? (
          <p className="py-16 text-center text-slate-400">{q ? 'Ningún producto coincide' : 'No hay productos en esta categoría'}</p>
        ) : vista === 'grilla' ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {visibles.map((p) => {
              const n = enPedido[p.id] ?? 0
              return (
                <button
                  key={p.id}
                  onClick={() => elegir(p)}
                  style={p.color ? { backgroundColor: p.color } : undefined}
                  className={cn(
                    'relative flex h-28 flex-col justify-between overflow-hidden rounded-2xl border p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.97]',
                    p.color ? 'border-transparent text-white' : 'border-slate-200 bg-white',
                    n > 0 && !p.color && 'border-[#3b9bff] ring-2 ring-[#3b9bff]/30',
                    tocado === p.id && 'scale-[0.97]'
                  )}
                >
                  {p.fotoKey && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/recetas/foto?key=${encodeURIComponent(p.fotoKey)}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
                  )}
                  {n > 0 && (
                    <span className="absolute right-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-[#1f7fe6] px-1.5 text-sm font-bold text-white shadow">
                      {n}
                    </span>
                  )}
                  <span className="relative flex items-start gap-1.5 pr-8">
                    {p.icono && <span className="text-xl leading-none">{p.icono}</span>}
                    <span className="line-clamp-2 text-[15px] font-semibold leading-tight">{p.nombre}</span>
                  </span>
                  <span className="relative text-lg font-bold tabular-nums">{pesos(p.precio)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {visibles.map((p) => {
              const n = enPedido[p.id] ?? 0
              return (
                <li key={p.id}>
                  <button onClick={() => elegir(p)} className="flex min-h-[4rem] w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                    {p.icono ? (
                      <span className="w-7 text-center text-xl leading-none">{p.icono}</span>
                    ) : (
                      <span className="h-7 w-7 shrink-0 rounded" style={{ backgroundColor: p.color ?? '#e2e8f0' }} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-base">{p.nombre}</span>
                    {n > 0 && <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#1f7fe6] px-1.5 text-sm font-bold text-white">{n}</span>}
                    <span className="text-base font-bold tabular-nums">{pesos(p.precio)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
