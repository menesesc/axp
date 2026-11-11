'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { pesos } from '@/components/dashboard/inicio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parsearMonto } from '@/lib/eventos/constantes'
import {
  ADICIONALES_SUGERIDOS,
  APLICA,
  cantidadAdicional,
  importeAdicional,
  modalidadTexto,
  type Adicional,
  type Aplica,
  type Modalidad,
  type Paga,
} from '@/lib/eventos/menu'
import { cn } from '@/lib/utils'
import { avisarError, claseSelect, enviar } from './comunes'

/**
 * Adicionales de un evento o una reserva. Se cargan a mano; la descripción
 * sugiere lo que la casa ya usó (y, la primera vez, los de siempre: copa de
 * bienvenida, show de tango, DJ).
 *
 * Quién paga es lo que decide si suma: lo del titular entra en la cuenta de
 * la reserva; lo de cada pasajero sale en el presupuesto como informativo.
 */

interface Sugerencia {
  descripcion: string
  modalidad: Modalidad
  aplica: Aplica
  paga: Paga
  precioUnitario: number
}

interface Fila {
  key: string
  id?: string | undefined
  descripcion: string
  modalidad: Modalidad
  aplica: Aplica
  cantidad: string
  precioUnitario: string
  paga: Paga
  nota: string
}

let n = 0
const filaDe = (a: Adicional): Fila => ({
  key: a.id ?? `a${++n}`,
  id: a.id,
  descripcion: a.descripcion,
  modalidad: a.modalidad,
  aplica: a.aplica,
  cantidad: a.cantidad != null ? String(a.cantidad) : '',
  precioUnitario: a.precioUnitario ? String(a.precioUnitario) : '',
  paga: a.paga,
  nota: a.nota ?? '',
})

export function EditorAdicionales({
  dueno,
  adicionales,
  grupo,
  verImportes,
  puedeEditar,
  onGuardado,
}: {
  dueno: { eventoId: string } | { reservaId: string }
  /** Propios y heredados (los del evento vienen con `delEvento`). */
  adicionales: Adicional[]
  /** Personas de la reserva, para mostrar el importe de cada línea. En el evento, null. */
  grupo: { adultos: number; menores: number } | null
  verImportes: boolean
  puedeEditar: boolean
  onGuardado: () => void
}) {
  const qc = useQueryClient()
  const listaId = useId()
  const deEvento = 'eventoId' in dueno
  const heredados = adicionales.filter((a) => a.delEvento)
  const inicial = useMemo(() => adicionales.filter((a) => !a.delEvento).map(filaDe), [adicionales])
  const [filas, setFilas] = useState(inicial)
  useEffect(() => setFilas(inicial), [inicial])

  const { data } = useQuery({
    queryKey: ['eventos-adicionales-sugeridos'],
    queryFn: async () => {
      const res = await fetch('/api/eventos/adicionales')
      if (!res.ok) return { sugerencias: [] as Sugerencia[] }
      return res.json() as Promise<{ sugerencias: Sugerencia[] }>
    },
    staleTime: 60 * 1000,
  })
  const sugerencias = useMemo(() => {
    const usadas = data?.sugerencias ?? []
    const extra = ADICIONALES_SUGERIDOS.filter((s) => !usadas.some((u) => u.descripcion.toLowerCase() === s.descripcion.toLowerCase())).map(
      (s) => ({ ...s, paga: 'TITULAR' as Paga, precioUnitario: 0 })
    )
    return [...usadas, ...extra]
  }, [data])

  const guardar = useMutation({
    mutationFn: () =>
      enviar('/api/eventos/adicionales', 'PUT', {
        ...dueno,
        adicionales: filas.map((f) => ({
          id: f.id,
          descripcion: f.descripcion,
          modalidad: f.modalidad,
          aplica: f.aplica,
          cantidad: parsearMonto(f.cantidad),
          precioUnitario: parsearMonto(f.precioUnitario) ?? 0,
          paga: f.paga,
          nota: f.nota,
        })),
      }),
    onSuccess: () => {
      toast.success('Adicionales guardados')
      qc.invalidateQueries({ queryKey: ['eventos-adicionales-sugeridos'] })
      onGuardado()
    },
    onError: avisarError,
  })

  const set = (key: string, c: Partial<Fila>) => setFilas((xs) => xs.map((f) => (f.key === key ? { ...f, ...c } : f)))
  const cambiado = JSON.stringify(filas.map(({ key: _k, ...f }) => f)) !== JSON.stringify(inicial.map(({ key: _k, ...f }) => f))
  // Al elegir una sugerencia, se completa lo que todavía está vacío.
  const elegir = (key: string, descripcion: string) => {
    const s = sugerencias.find((x) => x.descripcion.toLowerCase() === descripcion.trim().toLowerCase())
    setFilas((xs) =>
      xs.map((f) =>
        f.key !== key
          ? f
          : {
              ...f,
              descripcion,
              ...(s && !f.precioUnitario
                ? { modalidad: s.modalidad, aplica: s.aplica, paga: s.paga, precioUnitario: s.precioUnitario ? String(s.precioUnitario) : '' }
                : {}),
            }
      )
    )
  }

  const linea = (a: Pick<Adicional, 'modalidad' | 'aplica' | 'cantidad' | 'precioUnitario' | 'paga'>) => {
    if (!grupo || !verImportes) return null
    const cant = cantidadAdicional(a, grupo)
    return `${cant} × ${pesos(a.precioUnitario)} = ${pesos(importeAdicional(a, grupo))}${a.paga === 'PASAJERO' ? ' (no suma)' : ''}`
  }

  return (
    <div className="space-y-3">
      <datalist id={listaId}>
        {sugerencias.map((s) => (
          <option key={s.descripcion} value={s.descripcion} />
        ))}
      </datalist>

      {heredados.length > 0 && (
        <div className="space-y-1 rounded-xl bg-slate-900/[0.03] p-3 text-sm">
          <p className="text-xs font-medium text-[var(--ter)]">Del evento (valen para todas sus reservas)</p>
          {heredados.map((a) => (
            <div key={a.id} className="flex flex-wrap justify-between gap-2">
              <span>
                {a.descripcion} <span className="text-xs text-[var(--ter)]">· {modalidadTexto(a)} · {a.paga === 'TITULAR' ? 'paga el titular' : 'paga cada pasajero'}</span>
              </span>
              <span className="ax-num text-[var(--sec)]">{linea(a)}</span>
            </div>
          ))}
        </div>
      )}

      {filas.length === 0 && <p className="text-sm text-[var(--ter)]">{deEvento ? 'El evento no tiene adicionales.' : 'Sin adicionales propios.'}</p>}

      {filas.map((f) => {
        const a = {
          modalidad: f.modalidad,
          aplica: f.aplica,
          cantidad: parsearMonto(f.cantidad),
          precioUnitario: parsearMonto(f.precioUnitario) ?? 0,
          paga: f.paga,
        }
        return (
          <fieldset key={f.key} disabled={!puedeEditar} className="space-y-2 rounded-xl border border-slate-900/[0.08] p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={f.descripcion}
                list={listaId}
                onChange={(e) => elegir(f.key, e.target.value)}
                placeholder="Show de Tango, DJ, copa de bienvenida…"
                className="h-9 min-w-[12rem] flex-1"
              />
              <select value={f.paga} onChange={(e) => set(f.key, { paga: e.target.value as Paga })} className={cn(claseSelect, 'h-9 w-auto')} aria-label="Quién paga">
                <option value="TITULAR">Paga el titular</option>
                <option value="PASAJERO">Paga cada pasajero</option>
              </select>
              {puedeEditar && (
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFilas((xs) => xs.filter((x) => x.key !== f.key))} aria-label="Quitar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select value={f.modalidad} onChange={(e) => set(f.key, { modalidad: e.target.value as Modalidad })} className={cn(claseSelect, 'h-8 w-auto text-xs')} aria-label="Modalidad">
                <option value="PERSONA">Por persona</option>
                <option value="FIJO">Monto fijo</option>
              </select>
              {f.modalidad === 'PERSONA' && (
                <select value={f.aplica} onChange={(e) => set(f.key, { aplica: e.target.value as Aplica })} className={cn(claseSelect, 'h-8 w-auto text-xs')} aria-label="Para quién">
                  {APLICA.map((x) => (
                    <option key={x.valor} value={x.valor}>
                      {x.texto}
                    </option>
                  ))}
                </select>
              )}
              {!(deEvento && f.modalidad === 'PERSONA') && (
                <label className="flex items-center gap-1 text-[var(--sec)]">
                  Cantidad
                  <Input
                    value={f.cantidad}
                    onChange={(e) => set(f.key, { cantidad: e.target.value })}
                    inputMode="decimal"
                    placeholder={f.modalidad === 'FIJO' ? '1' : 'todas'}
                    className="h-8 w-20 text-xs"
                  />
                </label>
              )}
              {verImportes && (
                <label className="flex items-center gap-1 text-[var(--sec)]">
                  Precio
                  <Input value={f.precioUnitario} onChange={(e) => set(f.key, { precioUnitario: e.target.value })} inputMode="decimal" placeholder="$" className="h-8 w-28 text-xs" />
                </label>
              )}
              <Input value={f.nota} onChange={(e) => set(f.key, { nota: e.target.value })} placeholder="Nota (opcional)" className="h-8 min-w-[8rem] flex-1 text-xs" />
              <span className="ax-num text-[var(--sec)]">{linea(a)}</span>
            </div>
            {deEvento && f.modalidad === 'FIJO' && <p className="text-[11px] text-amber-700">Un monto fijo en el evento se suma a cada una de sus reservas.</p>}
          </fieldset>
        )
      })}

      {puedeEditar && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() =>
              setFilas((xs) => [...xs, { key: `a${++n}`, descripcion: '', modalidad: 'PERSONA', aplica: 'TODOS', cantidad: '', precioUnitario: '', paga: 'TITULAR', nota: '' }])
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Adicional
          </Button>
          <div className="flex gap-2">
            {cambiado && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFilas(inicial)}>
                Descartar
              </Button>
            )}
            <Button type="button" size="sm" disabled={!cambiado || guardar.isPending} onClick={() => guardar.mutate()}>
              {guardar.isPending ? 'Guardando…' : 'Guardar adicionales'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
