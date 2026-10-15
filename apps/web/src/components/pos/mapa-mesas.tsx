'use client'

import { cn } from '@/lib/utils'
import { Clock, Users } from 'lucide-react'

/**
 * El mapa del salón, que es la pantalla que tiene que estar siempre a la
 * vista en un restaurante.
 *
 * El color dice el estado y el número grande dice la mesa. Lo que importa de
 * un vistazo no es el detalle sino cuál mesa reclama atención: la que pidió
 * la cuenta, la que está facturada sin cobrar, la que lleva veinte minutos
 * esperando un plato.
 *
 * Los minutos en rojo a partir de 15 porque es cuando un plato empieza a
 * sentirse demorado en el salón, no en la cocina.
 */

export interface MesaEstado {
  id: string
  sectorId: string | null
  nombre: string
  capacidad: number
  pedidoId: string | null
  pedidoNumero: number | null
  comensales: number | null
  total: number | null
  mozo: string | null
  mozoId: string | null
  estado: 'libre' | 'ocupada' | 'postre' | 'cuenta' | 'facturada'
  minutos: number | null
  enCocina: number
  minutosCocina: number | null
}

const ESTILO: Record<MesaEstado['estado'], { caja: string; label: string }> = {
  libre: { caja: 'bg-white border-slate-200 text-slate-400', label: 'Libre' },
  ocupada: { caja: 'bg-sky-50 border-sky-300 text-sky-900', label: 'Ocupada' },
  postre: { caja: 'bg-violet-50 border-violet-300 text-violet-900', label: 'Postre' },
  cuenta: { caja: 'bg-amber-50 border-amber-400 text-amber-900', label: 'Cuenta pedida' },
  facturada: { caja: 'bg-emerald-50 border-emerald-400 text-emerald-900', label: 'Facturada, falta cobrar' },
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function MapaMesas({
  mesas,
  onAbrir,
}: {
  mesas: MesaEstado[]
  onAbrir: (m: MesaEstado) => void
}) {
  if (mesas.length === 0) {
    return (
      <p className="py-16 text-center text-slate-400">
        Este salón no tiene mesas cargadas.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {mesas.map((m) => {
        const e = ESTILO[m.estado]
        const demorada = (m.minutosCocina ?? 0) >= 15
        return (
          <button
            key={m.id}
            onClick={() => onAbrir(m)}
            className={cn(
              'flex h-28 flex-col justify-between rounded-xl border-2 p-2.5 text-left active:scale-[0.98]',
              e.caja
            )}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-2xl font-bold leading-none">{m.nombre}</span>
              {m.estado === 'libre' ? (
                <span className="flex items-center gap-0.5 text-xs opacity-60">
                  <Users className="h-3 w-3" />
                  {m.capacidad}
                </span>
              ) : (
                <span className="text-right text-xs leading-tight opacity-70">
                  {m.comensales} cub.
                  {m.minutos != null && <span className="block">{m.minutos}′</span>}
                </span>
              )}
            </div>

            {m.estado === 'libre' ? (
              <span className="text-xs">{e.label}</span>
            ) : (
              <div className="min-w-0">
                {m.enCocina > 0 && (
                  <span
                    className={cn(
                      'mb-0.5 flex items-center gap-1 text-[11px] font-semibold',
                      demorada ? 'text-red-600' : 'opacity-70'
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {m.enCocina} en cocina
                    {m.minutosCocina != null && ` · ${m.minutosCocina}′`}
                  </span>
                )}
                <span className="block truncate text-[11px] opacity-70">
                  {m.estado === 'ocupada' ? (m.mozo ?? '') : e.label}
                </span>
                <span className="block text-base font-bold tabular-nums">{pesos(m.total ?? 0)}</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function LeyendaMesas() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {(Object.entries(ESTILO) as Array<[MesaEstado['estado'], (typeof ESTILO)[MesaEstado['estado']]]>).map(
        ([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('h-3 w-3 rounded border-2', v.caja)} />
            {v.label}
          </span>
        )
      )}
    </div>
  )
}
