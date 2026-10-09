'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, cn } from '@/lib/utils'
import { Loader2, Plus, Trash2 } from 'lucide-react'

/**
 * Lo que vence todos los meses y no llega como factura de mercadería: ARCA,
 * Rentas, UTHGRA, la luz, el gas. Se anota una vez y el calendario lo
 * proyecta hacia adelante como estimado hasta que aparece la boleta real.
 */

const RUBROS = [
  ['IMPUESTO', 'Impuesto'],
  ['SERVICIO', 'Servicio'],
  ['OTRO', 'Otro'],
] as const

const PERIODICIDADES = [
  ['MENSUAL', 'Todos los meses'],
  ['BIMESTRAL', 'Cada 2 meses'],
  ['TRIMESTRAL', 'Cada 3 meses'],
  ['SEMESTRAL', 'Cada 6 meses'],
  ['ANUAL', 'Una vez al año'],
] as const

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

interface Obligacion {
  id: string
  nombre: string
  rubro: string
  periodicidad: string
  diaVencimiento: number
  mesAncla: number | null
  montoEstimado: number | null
  activa: boolean
  notas: string | null
  proveedorId: string | null
  proveedor: string | null
}

interface Proveedor {
  id: string
  razonSocial: string
}

const VACIA = {
  nombre: '',
  rubro: 'IMPUESTO',
  periodicidad: 'MENSUAL',
  diaVencimiento: '15',
  mesAncla: '1',
  montoEstimado: '',
  proveedorId: '',
  notas: '',
}

export function ObligacionesDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ ...VACIA })
  const [editando, setEditando] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['obligaciones'],
    queryFn: async () => {
      const res = await fetch('/api/obligaciones')
      if (!res.ok) throw new Error('No se pudieron cargar')
      return res.json() as Promise<{ obligaciones: Obligacion[] }>
    },
    enabled: abierto,
  })

  const { data: provData } = useQuery({
    queryKey: ['proveedores'],
    queryFn: async () => {
      const res = await fetch('/api/proveedores')
      if (!res.ok) throw new Error('Error')
      return res.json() as Promise<{ proveedores: Proveedor[] }>
    },
    enabled: abierto,
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['obligaciones'] })
    qc.invalidateQueries({ queryKey: ['pagos-calendario'] })
  }

  const guardar = useMutation({
    mutationFn: async () => {
      const cuerpo = {
        ...(editando ? { id: editando } : {}),
        nombre: form.nombre,
        rubro: form.rubro,
        periodicidad: form.periodicidad,
        diaVencimiento: Number(form.diaVencimiento),
        mesAncla: form.periodicidad === 'MENSUAL' ? null : Number(form.mesAncla),
        montoEstimado: form.montoEstimado === '' ? null : Number(form.montoEstimado.replace(',', '.')),
        proveedorId: form.proveedorId || null,
        notas: form.notas,
      }
      const res = await fetch('/api/obligaciones', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
    },
    onSuccess: () => {
      setForm({ ...VACIA })
      setEditando(null)
      refrescar()
      toast.success('Listo')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const alternar = useMutation({
    mutationFn: async (o: Obligacion) => {
      const res = await fetch('/api/obligaciones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: o.id, activa: !o.activa }),
      })
      if (!res.ok) throw new Error('No se pudo cambiar')
    },
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  })

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/obligaciones?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('No se pudo borrar')
    },
    onSuccess: () => {
      refrescar()
      toast.success('Borrada')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const editar = (o: Obligacion) => {
    setEditando(o.id)
    setForm({
      nombre: o.nombre,
      rubro: o.rubro,
      periodicidad: o.periodicidad,
      diaVencimiento: String(o.diaVencimiento),
      mesAncla: String(o.mesAncla ?? 1),
      montoEstimado: o.montoEstimado == null ? '' : String(o.montoEstimado),
      proveedorId: o.proveedorId ?? '',
      notas: o.notas ?? '',
    })
  }

  const obligaciones = data?.obligaciones ?? []
  const proveedores = provData?.proveedores ?? []

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vencimientos fijos</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-slate-500">
          Impuestos y servicios que vencen cada tanto. Aparecen en el calendario como estimados hasta que cargás la
          boleta de ese mes, que los reemplaza.
        </p>

        {/* Alta / edición */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-500">Nombre</span>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="UTHGRA, IIBB Rentas RN, Luz CEB…"
              />
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500">Rubro</span>
              <Select value={form.rubro} onChange={(v) => setForm((f) => ({ ...f, rubro: v }))} opciones={RUBROS} />
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500">Proveedor (opcional)</span>
              <select
                value={form.proveedorId}
                onChange={(e) => setForm((f) => ({ ...f, proveedorId: e.target.value }))}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.razonSocial}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-slate-400">
                Con proveedor, la boleta real reemplaza sola al estimado.
              </span>
            </label>

            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500">Cada cuánto</span>
              <Select
                value={form.periodicidad}
                onChange={(v) => setForm((f) => ({ ...f, periodicidad: v }))}
                opciones={PERIODICIDADES}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500">Día</span>
                <Input
                  value={form.diaVencimiento}
                  onChange={(e) => setForm((f) => ({ ...f, diaVencimiento: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  placeholder="15"
                />
              </label>
              {form.periodicidad !== 'MENSUAL' && (
                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-500">Desde el mes de</span>
                  <select
                    value={form.mesAncla}
                    onChange={(e) => setForm((f) => ({ ...f, mesAncla: e.target.value }))}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm capitalize"
                  >
                    {MESES.map((m, i) => (
                      <option key={m} value={i + 1} className="capitalize">
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500">Monto estimado (opcional)</span>
              <Input
                value={form.montoEstimado}
                onChange={(e) => setForm((f) => ({ ...f, montoEstimado: e.target.value }))}
                placeholder="Para saber cuánta plata hay que tener"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !form.nombre.trim()}>
              {guardar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              {editando ? 'Guardar cambios' : 'Agregar'}
            </Button>
            {editando && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditando(null)
                  setForm({ ...VACIA })
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>

        {/* Listado */}
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : obligaciones.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Todavía no cargaste ninguno.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {obligaciones.map((o) => (
              <li key={o.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', !o.activa && 'opacity-50')}>
                <button onClick={() => editar(o)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium hover:underline">{o.nombre}</span>
                  <span className="text-xs text-slate-500">
                    {RUBROS.find(([v]) => v === o.rubro)?.[1]} ·{' '}
                    {PERIODICIDADES.find(([v]) => v === o.periodicidad)?.[1]?.toLowerCase()} · día {o.diaVencimiento}
                    {o.periodicidad !== 'MENSUAL' && o.mesAncla ? ` desde ${MESES[o.mesAncla - 1]}` : ''}
                    {o.proveedor ? ` · ${o.proveedor}` : ''}
                  </span>
                </button>
                <span className="shrink-0 text-sm tabular-nums text-slate-600">
                  {o.montoEstimado == null ? '—' : formatCurrency(o.montoEstimado)}
                </span>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={o.activa}
                    onChange={() => alternar.mutate(o)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  activa
                </label>
                <button
                  onClick={() => borrar.mutate(o.id)}
                  aria-label={`Borrar ${o.nombre}`}
                  className="shrink-0 text-slate-300 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Select({
  value,
  onChange,
  opciones,
}: {
  value: string
  onChange: (v: string) => void
  opciones: ReadonlyArray<readonly [string, string]>
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
    >
      {opciones.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}
