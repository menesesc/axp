'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2, Search, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { fmtNumAR, fmtAR } from '@/components/sales/shared'

interface Insumo {
  id: string
  nombre: string
  unidadBase: string
}
interface Alias {
  id: string
  patron: string
  factorBase: number
  unidadOrigen: string | null
}
interface Sugerencia {
  descripcion: string
  apariciones: number
  cantidadTotal: number
  subtotalTotal: number
  unidadComun: string | null
}

export function InsumoAliasPanel({ insumo, canEdit }: { insumo: Insumo; canEdit: boolean }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')

  const { data: aliasData } = useQuery({
    queryKey: ['insumo-alias', insumo.id],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/alias`)
      if (!res.ok) throw new Error('Error cargando alias')
      return res.json() as Promise<{ alias: Alias[] }>
    },
  })
  const alias = aliasData?.alias ?? []

  const { data: sugData, isFetching: sugLoading } = useQuery({
    queryKey: ['conciliacion-sugerencias', activeSearch],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/sugerencias?q=${encodeURIComponent(activeSearch)}`)
      if (!res.ok) throw new Error('Error cargando sugerencias')
      return res.json() as Promise<{ sugerencias: Sugerencia[] }>
    },
    enabled: !!activeSearch,
    staleTime: 30_000,
  })

  const addAlias = useMutation({
    mutationFn: async (payload: { patron: string; factorBase: number; unidadOrigen?: string | null }) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Error')
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumo-alias', insumo.id] })
      qc.invalidateQueries({ queryKey: ['conciliacion-sugerencias'] })
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      toast.success('Alias agregado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const delAlias = useMutation({
    mutationFn: async (aliasId: string) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/alias?aliasId=${aliasId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Error al borrar')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumo-alias', insumo.id] })
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      toast.success('Alias eliminado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Formulario de alias manual
  const [manualPatron, setManualPatron] = useState('')
  const [manualFactor, setManualFactor] = useState('1')

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{insumo.nombre}</h3>
        <p className="text-xs text-slate-500">Unidad base: {insumo.unidadBase}</p>
      </div>

      {/* Alias actuales */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
          Alias ({alias.length})
        </p>
        {alias.length === 0 ? (
          <p className="text-sm text-slate-400">Sin alias. Agregá descripciones de factura abajo.</p>
        ) : (
          <ul className="space-y-1">
            {alias.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 bg-slate-50 rounded-md px-3 py-1.5 text-sm"
              >
                <span className="text-slate-700 truncate">{a.patron}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">×{fmtNumAR(a.factorBase, 2)} {insumo.unidadBase}</span>
                  {canEdit && (
                    <button
                      onClick={() => delAlias.mutate(a.id)}
                      className="text-slate-400 hover:text-red-500"
                      title="Eliminar alias"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <>
          {/* Alta manual */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Agregar alias manual</p>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-slate-500">Patrón (texto en factura)</label>
                <Input value={manualPatron} onChange={(e) => setManualPatron(e.target.value)} placeholder="ej. LOMO" className="text-sm" />
              </div>
              <div className="w-28">
                <label className="text-xs text-slate-500">Factor → {insumo.unidadBase}</label>
                <Input type="number" step="any" value={manualFactor} onChange={(e) => setManualFactor(e.target.value)} className="text-sm" />
              </div>
              <Button
                size="sm"
                disabled={!manualPatron.trim() || addAlias.isPending}
                onClick={() => {
                  addAlias.mutate(
                    { patron: manualPatron.trim(), factorBase: Number(manualFactor) || 1 },
                    { onSuccess: () => { setManualPatron(''); setManualFactor('1') } }
                  )
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Agregar
              </Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Factor = cuántas {insumo.unidadBase} representa 1 unidad de la factura (ej. cajón x12 → 12; kg → 1).
            </p>
          </div>

          {/* Sugerencias asistidas */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Buscar en facturas
            </p>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); setActiveSearch(search.trim()) }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`ej. ${insumo.nombre}`}
                  className="pl-8 text-sm"
                />
              </div>
              <Button type="submit" size="sm" variant="outline">Buscar</Button>
            </form>

            {sugLoading && <p className="text-sm text-slate-400 mt-3">Buscando...</p>}
            {sugData && sugData.sugerencias.length === 0 && (
              <p className="text-sm text-slate-400 mt-3">Sin coincidencias nuevas (o ya están todas mapeadas).</p>
            )}
            {sugData && sugData.sugerencias.length > 0 && (
              <ul className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
                {sugData.sugerencias.map((s) => (
                  <li
                    key={s.descripcion}
                    className="flex items-center justify-between gap-2 border border-slate-100 rounded-md px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-slate-700 truncate">{s.descripcion}</p>
                      <p className="text-[11px] text-slate-400">
                        {s.apariciones} líneas · {fmtNumAR(s.cantidadTotal, 2)} {s.unidadComun ?? ''} · {fmtAR(s.subtotalTotal)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={addAlias.isPending}
                      onClick={() => addAlias.mutate({ patron: s.descripcion, factorBase: 1, unidadOrigen: s.unidadComun })}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Vincular
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
