'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UNIDADES } from '@/lib/conciliacion/units'
import { formatCurrency, cn } from '@/lib/utils'
import { AlertTriangle, Loader2 } from 'lucide-react'

/**
 * Alta de insumo sin salir del costeo de la receta.
 *
 * Tres cosas y listo: nombre, unidad y merma. La cuarta, el alias de compra,
 * se ofrece ya resuelta a partir de las facturas cargadas — es el dato que
 * después hace entrar el stock y da el precio, y el que nadie se acuerda de
 * cargar si hay que ir a buscarlo a otra pantalla.
 */

interface Sugerencia {
  descripcion: string
  veces: number
  unidad: string | null
  ultimoPrecio: number | null
  fecha: string | null
  yaUsada: string | null
}

export function CrearInsumoDialog({
  nombreInicial,
  abierto,
  onCerrar,
  onCreado,
}: {
  nombreInicial: string
  abierto: boolean
  onCerrar: () => void
  onCreado: (insumo: { id: string; nombre: string; unidadBase: string }) => void
}) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(nombreInicial)
  const [unidadBase, setUnidadBase] = useState('kg')
  const [merma, setMerma] = useState('')
  const [alias, setAlias] = useState('')

  useEffect(() => {
    if (abierto) {
      setNombre(nombreInicial)
      setAlias('')
      setMerma('')
    }
  }, [abierto, nombreInicial])

  const { data, isFetching } = useQuery({
    queryKey: ['insumo-alias-sugerido', nombre],
    queryFn: async () => {
      const res = await fetch(`/api/recetas/insumos/crear?nombre=${encodeURIComponent(nombre)}`)
      if (!res.ok) return { sugerencias: [] as Sugerencia[] }
      return res.json() as Promise<{ sugerencias: Sugerencia[] }>
    },
    enabled: abierto && nombre.trim().length >= 3,
  })

  const crear = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/recetas/insumos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          unidadBase,
          mermaPct: merma.trim() === '' ? 0 : Number(merma.replace(',', '.')),
          alias: alias.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo crear')
      return json as { insumo: { id: string; nombre: string; unidadBase: string } }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['recetas-insumos'] })
      qc.invalidateQueries({ queryKey: ['conciliacion-insumos'] })
      toast.success(`Insumo "${r.insumo.nombre}" creado`)
      onCreado(r.insumo)
      onCerrar()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const sugerencias = data?.sugerencias ?? []

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo insumo</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_6rem]">
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">Nombre</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">Unidad</span>
            <select
              value={unidadBase}
              onChange={(e) => setUnidadBase(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500" title="Lo que se pierde en recorte, limpieza o cocción">
              Merma %
            </span>
            <Input value={merma} onChange={(e) => setMerma(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
          </label>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500">Alias de compra</p>
          <p className="mb-2 text-[11px] text-slate-400">
            Con qué texto aparece en la factura. Sin alias el insumo no recibe stock ni tiene precio.
          </p>
          <Input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="ej. CREMA 44%"
            className="text-sm"
          />

          {isFetching ? (
            <p className="mt-2 text-xs text-slate-400">Buscando en las facturas…</p>
          ) : sugerencias.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {sugerencias.map((s) => (
                <li key={s.descripcion}>
                  <button
                    type="button"
                    onClick={() => setAlias(s.descripcion)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50',
                      alias === s.descripcion && 'bg-slate-100'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{s.descripcion}</span>
                      <span className="text-[11px] text-slate-400">
                        {s.veces} compra{s.veces === 1 ? '' : 's'}
                        {s.unidad ? ` · ${s.unidad.toLowerCase()}` : ''}
                        {s.fecha ? ` · última ${s.fecha}` : ''}
                      </span>
                      {/* Si otro insumo ya captura esa descripción, los dos se
                          llevarían la misma compra. */}
                      {s.yaUsada && (
                        <span className="flex items-center gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          ya la toma {s.yaUsada}
                        </span>
                      )}
                    </span>
                    {s.ultimoPrecio != null && (
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {formatCurrency(s.ultimoPrecio)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : nombre.trim().length >= 3 ? (
            <p className="mt-2 text-xs text-slate-400">
              Ninguna línea de factura se parece a ese nombre. Podés escribir el alias a mano o dejarlo para después.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => crear.mutate()} disabled={crear.isPending || !nombre.trim()}>
            {crear.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear y vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
