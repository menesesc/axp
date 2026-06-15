'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { useUser } from '@/hooks/use-user'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { InsumoDetalle } from '@/components/conciliacion/insumo-detalle'
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

  const { data, isLoading: loadingInsumos } = useQuery({
    queryKey: ['conciliacion-insumos'],
    queryFn: async () => {
      const res = await fetch('/api/conciliacion/insumos')
      if (!res.ok) throw new Error('Error cargando insumos')
      return res.json() as Promise<{ insumos: Insumo[] }>
    },
  })

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

  const insumos = (data?.insumos ?? []).filter((i) =>
    i.nombre.toLowerCase().includes(search.trim().toLowerCase())
  )
  const selected = data?.insumos.find((i) => i.id === selectedId) ?? null

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

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        {/* Lista */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar insumo..." className="pl-8 text-sm" />
            </div>
          </div>
          {loadingInsumos ? (
            <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
          ) : insumos.length === 0 ? (
            <div className="p-10 text-center">
              <Carrot className="h-9 w-9 mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm">{search ? 'Sin resultados' : 'No hay insumos todavía'}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {insumos.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => setSelectedId(i.id)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition flex items-center justify-between gap-2 ${
                      selectedId === i.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="text-sm text-slate-800 block truncate">
                        {i.nombre} {!i.activo && <span className="text-xs text-slate-400">(inactivo)</span>}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {i.unidadBase} · {i.aliasCount} alias · {i.recetasCount} en recetas
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detalle del insumo */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          {selected ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                <DateRange from={from} to={to} onChange={setRange} />
              </div>
              <InsumoDetalle insumo={selected} canEdit={isAdmin} from={from} to={to} />
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
