'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'
import { fmtNumAR } from '@/components/sales/shared'

interface Insumo { id: string; nombre: string; unidadBase: string }
interface Conteo { id: string; fecha: string; cantidad: number; nota: string | null }

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function InsumoStockPanel({ insumo, canEdit }: { insumo: Insumo; canEdit: boolean }) {
  const qc = useQueryClient()
  const [fecha, setFecha] = useState(todayIso())
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['insumo-stock', insumo.id],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/stock`)
      if (!res.ok) throw new Error('Error cargando stock')
      return res.json() as Promise<{ stock: Conteo[] }>
    },
  })
  const conteos = data?.stock ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['insumo-stock', insumo.id] })
    qc.invalidateQueries({ queryKey: ['insumo-detalle', insumo.id] })
  }

  const add = useMutation({
    mutationFn: async (payload: { fecha: string; cantidad: number; nota: string | null }) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Error')
      return res.json()
    },
    onSuccess: () => {
      invalidate()
      toast.success('Conteo guardado')
      setCantidad('')
      setNota('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (stockId: string) => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/stock?stockId=${stockId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al borrar')
    },
    onSuccess: () => { invalidate(); toast.success('Conteo eliminado') },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        Cargá el stock físico de <span className="font-medium text-slate-700">{insumo.nombre}</span> (en {insumo.unidadBase}) en cada conteo.
        Con dos conteos, la conciliación calcula el <span className="font-medium text-slate-700">desvío</span> = stock probable (compras − consumo) − lo contado.
      </p>

      {canEdit && (
        <div className="bg-slate-50 rounded-md p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Nuevo conteo</p>
          <div className="grid grid-cols-2 sm:grid-cols-[150px_120px_1fr_auto] gap-2 items-end">
            <div>
              <label className="text-[11px] text-slate-500">Fecha</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500">Stock ({insumo.unidadBase})</label>
              <Input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500">Nota (opcional)</label>
              <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. inventario fin de mes" className="text-sm" />
            </div>
            <Button
              size="sm"
              disabled={!fecha || cantidad === '' || Number(cantidad) < 0 || add.isPending}
              onClick={() => add.mutate({ fecha, cantidad: Number(cantidad), nota: nota.trim() || null })}
            >
              <Plus className="h-4 w-4 mr-1" /> {add.isPending ? '...' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Conteos ({conteos.length})</p>
        {isLoading ? (
          <p className="text-sm text-slate-400">Cargando...</p>
        ) : conteos.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">Sin conteos. Cargá al menos dos (inicio y fin de período) para medir la merma real.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
            {conteos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-slate-700">{c.fecha}</span>
                  <span className="text-slate-500"> · {fmtNumAR(c.cantidad, 3)} {insumo.unidadBase}</span>
                  {c.nota && <span className="text-[11px] text-slate-400 block truncate">{c.nota}</span>}
                </span>
                {canEdit && (
                  <button onClick={() => remove.mutate(c.id)} className="text-slate-400 hover:text-red-500 shrink-0" title="Eliminar conteo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
