'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock, Flame, Soup } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Linea } from './carrito'
import { DEMORA_COCINA, duracion } from './resumen-salon'

/**
 * Los tiempos de la mesa, abajo del consumo.
 *
 * Dos demoras distintas y de dos sectores distintos: lo que tarda la cocina
 * en sacar el plato, y lo que tarda el plato en salir del pase una vez
 * listo. Sumarlas esconde de quién es el problema, que es justamente lo que
 * se quiere saber cuando el cliente pregunta cuánto falta.
 *
 * Se puede plegar porque no todo el tiempo hace falta, pero arranca abierto:
 * el dato que no se ve no se mira.
 */

const DEMORA_PASE = 5

export function PanelTiempos({ lineas }: { lineas: Linea[] }) {
  const [abierto, setAbierto] = useState(true)

  const enviadas = lineas.filter((l) => l.enviado)
  // Mesa recién abierta: no hay ningún tiempo que mirar y el panel sólo
  // ocupa lugar.
  if (enviadas.length === 0) return null

  const enCocina = enviadas.filter((l) => l.estadoKds === 'enviado' || l.estadoKds === 'marchado')
  const enPase = enviadas.filter((l) => l.estadoKds === 'entregado')
  const peor = enCocina.reduce<number>((m, l) => Math.max(m, l.minutosCocina ?? 0), 0)
  const pasePeor = enPase.reduce<number>((m, l) => Math.max(m, l.minutosPase ?? 0), 0)

  return (
    <section className="shrink-0 border-t border-slate-200 bg-white">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-4 px-4 py-2.5 text-left"
      >
        <span className="text-sm font-semibold">Tiempos</span>

        <span className={cn('flex items-center gap-1.5 text-sm', peor >= DEMORA_COCINA ? 'font-semibold text-red-600' : 'text-slate-500')}>
          <Soup className="h-4 w-4" />
          {enCocina.length} en cocina
          {enCocina.length > 0 && ` · ${duracion(peor)}`}
        </span>

        <span className={cn('flex items-center gap-1.5 text-sm', pasePeor >= DEMORA_PASE ? 'font-semibold text-amber-600' : 'text-slate-500')}>
          <Flame className="h-4 w-4" />
          {enPase.length} en el pase
          {enPase.length > 0 && ` · ${duracion(pasePeor)}`}
        </span>

        <span className="ml-auto text-slate-400">
          {abierto ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </span>
      </button>

      {abierto && (
        <div className="max-h-44 overflow-y-auto border-t border-slate-100">
          {enviadas.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Todavía no se comandó nada en esta mesa.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {enviadas.map((l) => {
                  const demorado = (l.minutosCocina ?? 0) >= DEMORA_COCINA && l.estadoKds !== 'despachado'
                  return (
                    <tr key={l.id}>
                      <td className="w-10 px-3 py-1.5 text-xs text-slate-400">#{l.comanda ?? 1}</td>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{l.cantidad}× {l.nombre}</span>
                        {l.marca && <span className="ml-1.5 rounded bg-orange-100 px-1 text-[10px] font-bold text-orange-700">{l.marca}</span>}
                      </td>
                      <td className="w-20 px-2 py-1.5 text-xs text-slate-500">{l.enviadoHora}</td>
                      <td className={cn('w-28 px-2 py-1.5 text-xs', demorado ? 'font-semibold text-red-600' : 'text-slate-500')}>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> cocina {duracion(l.minutosCocina)}
                        </span>
                      </td>
                      <td className="w-24 px-2 py-1.5 text-xs text-slate-500">
                        {l.minutosPase != null ? `pase ${duracion(l.minutosPase)}` : ''}
                      </td>
                      <td className="w-24 px-3 py-1.5 text-right text-xs text-slate-500">{ESTADO[l.estadoKds ?? 'enviado']}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}

const ESTADO: Record<string, string> = {
  pendiente: 'sin enviar',
  enviado: 'en cocina',
  marchado: 'marchado',
  entregado: 'listo',
  despachado: 'servido',
}
