'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TurnosConfig } from './turnos-config'
import { cn } from '@/lib/utils'
import { Building2, Plus, Receipt } from 'lucide-react'

/**
 * Sucursales y cajas.
 *
 * Una caja es un punto de venta de ARCA, y de ahí sale casi todo lo demás:
 * la numeración fiscal ya viene separada por caja, así que dos sucursales
 * vendiendo al mismo tiempo no pueden pisarse. El punto de venta tiene que
 * ser distinto del que usa Maxirest para poder convivir sin romper la
 * numeración de ninguno de los dos.
 */

interface Caja { id: string; nombre: string; puntoVenta: number | null; activa: boolean; sesionAbierta: boolean }
interface Sucursal {
  id: string; nombre: string; direccion: string | null
  depositoId: string | null; depositoNombre: string | null; activa: boolean; cajas: Caja[]
}

export function EstructuraTab() {
  const qc = useQueryClient()
  const [sucursal, setSucursal] = useState({ nombre: '', direccion: '' })
  const [caja, setCaja] = useState<{ sucursalId: string; nombre: string; puntoVenta: string } | null>(null)

  const { data } = useQuery({
    queryKey: ['pos-estructura'],
    queryFn: async () => {
      const res = await fetch('/api/pos/estructura')
      if (!res.ok) throw new Error('No se pudo cargar')
      return res.json() as Promise<{ sucursales: Sucursal[]; depositos: Array<{ id: string; nombre: string }> }>
    },
  })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['pos-estructura'] })

  const crear = useMutation({
    mutationFn: async (body: unknown) => {
      const res = await fetch('/api/pos/estructura', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'No se pudo')
    },
    onSuccess: () => { setSucursal({ nombre: '', direccion: '' }); setCaja(null); refrescar(); toast.success('Listo') },
    onError: (e: Error) => toast.error(e.message),
  })

  const actualizar = useMutation({
    mutationFn: async (body: unknown) => {
      const res = await fetch('/api/pos/estructura', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'No se pudo')
    },
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  })

  const sucursales = data?.sucursales ?? []

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold">Nueva sucursal</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1"><span className="mb-1 block text-xs text-slate-500">Nombre</span>
            <Input value={sucursal.nombre} onChange={(e) => setSucursal({ ...sucursal, nombre: e.target.value })} /></label>
          <label className="min-w-[14rem] flex-1"><span className="mb-1 block text-xs text-slate-500">Dirección</span>
            <Input value={sucursal.direccion} onChange={(e) => setSucursal({ ...sucursal, direccion: e.target.value })} /></label>
          <Button disabled={!sucursal.nombre.trim() || crear.isPending}
            onClick={() => crear.mutate({ tipo: 'sucursal', ...sucursal })}>
            <Plus className="mr-1.5 h-4 w-4" /> Agregar
          </Button>
        </div>
      </div>

      {sucursales.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
          Todavía no hay ninguna sucursal. Creá la primera para poder darle cajas.
        </p>
      )}

      {sucursales.map((s) => (
        <div key={s.id} className={cn('rounded-xl border border-slate-200 bg-white', !s.activa && 'opacity-50')}>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <Building2 className="h-5 w-5 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.nombre}</p>
              <p className="text-xs text-slate-400">
                {s.direccion || 'sin dirección'}
                {' · descuenta de '}
                <select
                  value={s.depositoId ?? ''}
                  onChange={(e) => actualizar.mutate({ tipo: 'sucursal', id: s.id, depositoId: e.target.value || null })}
                  className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs"
                >
                  <option value="">elegir depósito</option>
                  {(data?.depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </p>
            </div>
            <Button size="sm" variant="outline"
              onClick={() => setCaja({ sucursalId: s.id, nombre: `Caja ${s.cajas.length + 1}`, puntoVenta: '' })}>
              <Plus className="mr-1.5 h-4 w-4" /> Caja
            </Button>
          </div>

          <ul className="divide-y divide-slate-100">
            {s.cajas.length === 0 && (
              <li className="p-4 text-sm text-slate-400">Sin cajas. Cada caja es un punto de venta de ARCA.</li>
            )}
            {s.cajas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Receipt className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm">{c.nombre}</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Punto de venta
                  <Input
                    defaultValue={c.puntoVenta ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.replace(/\D/g, '')
                      if (String(c.puntoVenta ?? '') !== v) {
                        actualizar.mutate({ tipo: 'caja', id: c.id, puntoVenta: v ? Number(v) : null })
                      }
                    }}
                    className="h-8 w-20 text-right text-sm"
                    placeholder="—"
                  />
                </label>
                {c.sesionAbierta && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    caja abierta
                  </span>
                )}
                <button onClick={() => actualizar.mutate({ tipo: 'caja', id: c.id, activa: !c.activa })}
                  className="text-xs text-slate-400 hover:text-slate-900 hover:underline">
                  {c.activa ? 'desactivar' : 'activar'}
                </button>
              </li>
            ))}
          </ul>

          {caja?.sucursalId === s.id && (
            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50/60 p-4">
              <label className="min-w-[10rem] flex-1"><span className="mb-1 block text-xs text-slate-500">Nombre</span>
                <Input value={caja.nombre} onChange={(e) => setCaja({ ...caja, nombre: e.target.value })} /></label>
              <label className="w-36"><span className="mb-1 block text-xs text-slate-500">Punto de venta ARCA</span>
                <Input value={caja.puntoVenta}
                  onChange={(e) => setCaja({ ...caja, puntoVenta: e.target.value.replace(/\D/g, '') })}
                  placeholder="distinto a Maxirest" /></label>
              <Button disabled={!caja.nombre.trim() || crear.isPending}
                onClick={() => crear.mutate({ tipo: 'caja', sucursalId: s.id, nombre: caja.nombre, puntoVenta: caja.puntoVenta ? Number(caja.puntoVenta) : null })}>
                Crear
              </Button>
              <Button variant="ghost" onClick={() => setCaja(null)}>Cancelar</Button>
            </div>
          )}
        </div>
      ))}

      <TurnosConfig />
    </div>
  )
}
