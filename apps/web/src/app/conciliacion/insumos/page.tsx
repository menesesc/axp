'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { useUser } from '@/hooks/use-user'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { InsumoDetalle } from '@/components/conciliacion/insumo-detalle'
import { InsumoConsumo } from '@/components/conciliacion/insumo-consumo'
import { cn } from '@/lib/utils'
import { InsumoClasificacion } from '@/components/conciliacion/insumo-clasificacion'
import { DateRange } from '@/components/sales/date-range'
import { defaultRange } from '@/components/sales/shared'
import { UNIDADES } from '@/lib/conciliacion/units'
import { Carrot, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'

interface Insumo {
  id: string
  nombre: string
  unidadBase: string
  categoria: string | null
  subcategoria: string | null
  categoriaHeredada: string | null
  productMasterId: string | null
  productoVenta: string | null
  activo: boolean
  notas: string | null
  aliasCount: number
  recetasCount: number
}

export default function InsumosPage() {
  const { isAdmin, isLoading } = useUser()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [unidadBase, setUnidadBase] = useState('u')
  const [{ from, to }, setRange] = useState(defaultRange())
  const [categoria, setCategoria] = useState('')
  const [tipo, setTipo] = useState<'todos' | 'directa' | 'receta' | 'sinAlias'>('todos')
  const [listaAbierta, setListaAbierta] = useState(false)

  const { data, isLoading: loadingInsumos } = useQuery({
    queryKey: ['conciliacion-insumos'],
    queryFn: async () => {
      const res = await fetch('/api/conciliacion/insumos')
      if (!res.ok) throw new Error('Error cargando insumos')
      return res.json() as Promise<{ insumos: Insumo[] }>
    },
  })

  // Valores ya usados, para ofrecerlos en los desplegables y que no se escriba
  // "Luigi Bosca" de tres formas distintas.
  const sugerencias = useMemo(() => {
    const cats = new Set<string>()
    const subs = new Set<string>()
    for (const i of data?.insumos ?? []) {
      const c = i.categoria?.trim() || i.categoriaHeredada?.trim()
      if (c) cats.add(c)
      if (i.subcategoria?.trim()) subs.add(i.subcategoria.trim())
    }
    return { categorias: [...cats].sort(), subcategorias: [...subs].sort() }
  }, [data])

  const create = useMutation({
    mutationFn: async (payload: { nombre: string; unidadBase: string }) => {
      const res = await fetch('/api/conciliacion/insumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Error')
      return res.json() as Promise<{ insumo: Insumo }>
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      toast.success('Insumo creado')
      setNombre('')
      setShowForm(false)
      setSelectedId(r.insumo.id)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return null

  const q = search.trim().toLowerCase()
  const insumos = (data?.insumos ?? []).filter((i) => {
    if (q && !i.nombre.toLowerCase().includes(q)) return false
    if (categoria) {
      const c = i.categoria?.trim() || i.categoriaHeredada?.trim() || ''
      if (c !== categoria) return false
    }
    if (tipo === 'directa' && !i.productMasterId) return false
    if (tipo === 'receta' && (i.productMasterId || i.recetasCount === 0)) return false
    if (tipo === 'sinAlias' && i.aliasCount > 0) return false
    return true
  })
  const selected = data?.insumos.find((i) => i.id === selectedId) ?? null
  const sinAlias = (data?.insumos ?? []).filter((i) => i.aliasCount === 0).length

  const FILTROS_TIPO = [
    ['todos', 'Todos'],
    ['receta', 'En recetas'],
    ['directa', 'Venta directa'],
    ['sinAlias', `Sin alias${sinAlias ? ` (${sinAlias})` : ''}`],
  ] as const

  return (
    <DashboardLayout>
      <Header
        title="Insumos"
        description="Catálogo de insumos comprables. Cada insumo agrupa descripciones de factura (alias) y define su unidad base para la conciliación."
        actions={
          isAdmin ? (
            <Button onClick={() => setShowForm((s) => !s)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nuevo insumo
            </Button>
          ) : undefined
        }
      />

      {showForm && isAdmin && (
        <div className="mb-5 bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-slate-500">Nombre</label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Lomo" className="text-sm" />
            </div>
            <div className="w-32">
              <label className="text-xs text-slate-500">Unidad base</label>
              <select
                value={unidadBase}
                onChange={(e) => setUnidadBase(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-2 py-2 text-sm bg-white"
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              disabled={!nombre.trim() || create.isPending}
              onClick={() => create.mutate({ nombre: nombre.trim(), unidadBase })}
            >
              {create.isPending ? 'Creando...' : 'Crear'}
            </Button>
          </div>
        </div>
      )}

      {/*
        Con un insumo elegido la lista se guarda en un desplegable y el detalle
        se queda con todo el ancho: la configuración de un insumo (alias,
        recetas, stock por depósito) no entra cómoda en lo que sobra al costado
        de una columna fija.
      */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setListaAbierta(true)
              }}
              placeholder="Buscar insumo..."
              className="pl-8 text-sm"
            />
          </div>

          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            <option value="">Todas las categorías</option>
            {sugerencias.categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 text-xs">
            {FILTROS_TIPO.map(([v, l]) => (
              <button
                key={v}
                onClick={() => setTipo(v)}
                className={cn(
                  'rounded-md px-2.5 py-1.5 font-medium transition',
                  tipo === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-slate-400">
            {insumos.length} de {data?.insumos.length ?? 0}
          </span>
          {selected && (
            <Button variant="outline" size="sm" onClick={() => setListaAbierta((v) => !v)}>
              {listaAbierta ? 'Ocultar lista' : 'Cambiar de insumo'}
            </Button>
          )}
        </div>

        {(!selected || listaAbierta) && (
          <div className="mt-3 max-h-[26rem] overflow-y-auto border-t border-slate-100 pt-3">
            {loadingInsumos ? (
              <p className="py-8 text-center text-sm text-slate-400">Cargando...</p>
            ) : insumos.length === 0 ? (
              <div className="py-10 text-center">
                <Carrot className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {search || categoria || tipo !== 'todos' ? 'Sin resultados con esos filtros' : 'No hay insumos todavía'}
                </p>
              </div>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                {insumos.map((i) => (
                  <li key={i.id}>
                    <button
                      onClick={() => {
                        setSelectedId(i.id)
                        setListaAbierta(false)
                      }}
                      className={cn(
                        'w-full rounded-md px-3 py-2 text-left transition hover:bg-slate-50',
                        selectedId === i.id && 'bg-indigo-50'
                      )}
                    >
                      <span className="block truncate text-sm text-slate-800">
                        {i.nombre} {!i.activo && <span className="text-xs text-slate-400">(inactivo)</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
                        {i.unidadBase}
                        {/* Un insumo sin alias de compra nunca recibe stock,
                            pase lo que pase del lado de la venta. */}
                        <span className={i.aliasCount === 0 ? 'font-medium text-amber-600' : ''}>
                          · {i.aliasCount} alias
                        </span>
                        {i.productMasterId ? (
                          <span className="rounded bg-violet-50 px-1 py-px text-[10px] font-semibold text-violet-700">
                            venta directa
                          </span>
                        ) : (
                          <span>· {i.recetasCount} en recetas</span>
                        )}
                        {(i.categoria || i.categoriaHeredada) && (
                          <span className="truncate">· {i.categoria || i.categoriaHeredada}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 items-start">
        {/* Detalle del insumo */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          {selected ? (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <InsumoClasificacion
                  insumo={selected}
                  canEdit={isAdmin}
                  categoriaHeredada={selected.categoriaHeredada}
                  sugerencias={sugerencias}
                />
                <DateRange from={from} to={to} onChange={setRange} />
              </div>
              <InsumoConsumo insumo={selected} canEdit={isAdmin} />
              <div className="mt-4">
                <InsumoDetalle insumo={selected} canEdit={isAdmin} from={from} to={to} />
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-center text-slate-400 text-sm py-16">
              Seleccioná un insumo para ver su conciliación, compras y recetas.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
