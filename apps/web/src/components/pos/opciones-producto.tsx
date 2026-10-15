'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

/**
 * Lo que hay que elegir antes de que el plato entre al pedido.
 *
 * Dos casos que parecen distintos y son el mismo: el fetuccini que exige una
 * salsa (mínimo 1, máximo 1) y el helado que admite hasta dos sabores
 * (mínimo 0, máximo 2). El mínimo decide si se puede confirmar; el máximo,
 * si al tocar una opción se reemplaza la anterior o se suma.
 *
 * La observación va acá también, porque el momento de pedir "sin sal" es el
 * mismo en que se elige el plato, no después.
 */

export interface GrupoPos {
  id: string
  nombre: string
  minimo: number
  maximo: number
  opciones: Array<{ id: string; nombre: string; precioExtra: number }>
  productos: string[]
}

export interface OpcionElegida {
  opcionId: string
  grupo: string
  nombre: string
  precioExtra: number
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function OpcionesProducto({
  nombre,
  precioBase,
  grupos,
  onCancelar,
  onConfirmar,
}: {
  nombre: string
  precioBase: number
  grupos: GrupoPos[]
  onCancelar: () => void
  onConfirmar: (elegidas: OpcionElegida[], nota: string | null) => void
}) {
  const [elegidas, setElegidas] = useState<OpcionElegida[]>([])
  const [nota, setNota] = useState('')

  const extra = useMemo(() => elegidas.reduce((s, o) => s + o.precioExtra, 0), [elegidas])

  const falta = useMemo(
    () => grupos.find((g) => elegidas.filter((e) => e.grupo === g.nombre).length < g.minimo),
    [grupos, elegidas]
  )

  const tocar = (g: GrupoPos, o: GrupoPos['opciones'][number]) => {
    setElegidas((prev) => {
      const ya = prev.find((e) => e.opcionId === o.id)
      if (ya) return prev.filter((e) => e.opcionId !== o.id)
      const delGrupo = prev.filter((e) => e.grupo === g.nombre)
      // Con máximo 1 la elección se reemplaza sola: obligar a destildar la
      // anterior es un toque de más en una pantalla apurada.
      const base = delGrupo.length >= g.maximo
        ? g.maximo === 1
          ? prev.filter((e) => e.grupo !== g.nombre)
          : prev.filter((e) => e !== delGrupo[0])
        : prev
      return [...base, { opcionId: o.id, grupo: g.nombre, nombre: o.nombre, precioExtra: o.precioExtra }]
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <p className="text-xl font-bold">{nombre}</p>
            <p className="text-sm text-slate-500">{pesos(precioBase + extra)}</p>
          </div>
          <button onClick={onCancelar} aria-label="Cerrar" className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {grupos.map((g) => (
            <div key={g.id} className="mb-5">
              <p className="mb-2 text-sm font-semibold text-slate-500">
                {g.nombre}
                <span className="ml-2 font-normal">
                  {g.minimo > 0 ? `elegí ${g.minimo === g.maximo ? g.minimo : `${g.minimo} a ${g.maximo}`}` : `hasta ${g.maximo}`}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {g.opciones.map((o) => {
                  const activa = elegidas.some((e) => e.opcionId === o.id)
                  return (
                    <button
                      key={o.id}
                      onClick={() => tocar(g, o)}
                      className={cn(
                        'flex h-16 flex-col items-center justify-center rounded-xl border-2 px-2 text-center text-sm font-medium active:scale-[0.98]',
                        activa ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'
                      )}
                    >
                      <span className="line-clamp-2 leading-tight">{o.nombre}</span>
                      {o.precioExtra !== 0 && (
                        <span className="text-xs opacity-70">+{pesos(o.precioExtra)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <label className="mb-1 block text-sm font-semibold text-slate-500">Observación</label>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="sin sal, a punto, para compartir…"
            className="h-14 w-full rounded-xl border border-slate-200 px-4 text-base outline-none focus:border-slate-900"
          />
        </div>

        <div className="border-t border-slate-100 p-4">
          <button
            onClick={() => onConfirmar(elegidas, nota.trim() || null)}
            disabled={!!falta}
            className="h-16 w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-30 active:scale-[0.99]"
          >
            {falta ? `Falta elegir ${falta.nombre.toLowerCase()}` : `Agregar · ${pesos(precioBase + extra)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
