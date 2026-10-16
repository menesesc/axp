'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ChefHat, Clock, Receipt, Users, Utensils } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MesaEstado } from './mapa-mesas'

/**
 * Lo que el encargado mira cuando no está cargando una mesa: cuánto se
 * vendió, cuántas mesas hay abiertas y cuáles necesitan algo ya.
 *
 * Las mesas se ordenan por urgencia, no por número: primero las que esperan
 * cocina hace más de quince minutos, después las que pidieron la cuenta y
 * después el resto, de la que lleva más tiempo a la que menos.
 */

export const DEMORA_COCINA = 15

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/** Minutos legibles: 45′, 1 h 05′. */
export function duracion(min: number | null | undefined) {
  if (min == null) return ''
  if (min < 60) return `${min}′`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}′`
}

/** Reloj que avanza solo (para la barra de la caja y del mozo). */
export function Reloj({ className }: { className?: string }) {
  const [ahora, setAhora] = useState<Date | null>(null)
  useEffect(() => {
    setAhora(new Date())
    const t = setInterval(() => setAhora(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  if (!ahora) return null
  return (
    <span className={cn('tabular-nums', className)}>
      {ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
    </span>
  )
}

const ORDEN_ESTADO: Record<MesaEstado['estado'], number> = { cuenta: 1, facturada: 1, postre: 2, ocupada: 2, libre: 9 }

export function urgencia(m: MesaEstado) {
  const demorada = m.enCocina > 0 && (m.minutosCocina ?? 0) >= DEMORA_COCINA
  return demorada ? 0 : ORDEN_ESTADO[m.estado]
}

const CHIP: Record<MesaEstado['estado'], { texto: string; clase: string }> = {
  libre: { texto: 'Libre', clase: 'bg-slate-100 text-slate-500' },
  ocupada: { texto: 'Comiendo', clase: 'bg-sky-100 text-sky-800' },
  postre: { texto: 'Postre', clase: 'bg-violet-100 text-violet-800' },
  cuenta: { texto: 'Pidió la cuenta', clase: 'bg-amber-100 text-amber-800' },
  facturada: { texto: 'Falta cobrar', clase: 'bg-emerald-100 text-emerald-800' },
}

/** Cifras del salón en una fila: ocupación, cubiertos, consumo y demoras. */
export function CifrasSalon({ mesas }: { mesas: MesaEstado[] }) {
  const abiertas = mesas.filter((m) => m.estado !== 'libre')
  const cubiertos = abiertas.reduce((s, m) => s + (m.comensales ?? 0), 0)
  const consumo = abiertas.reduce((s, m) => s + (m.total ?? 0), 0)
  const demoradas = abiertas.filter((m) => m.enCocina > 0 && (m.minutosCocina ?? 0) >= DEMORA_COCINA).length
  const cuenta = abiertas.filter((m) => m.estado === 'cuenta' || m.estado === 'facturada').length
  const pct = mesas.length ? Math.round((abiertas.length / mesas.length) * 100) : 0

  const cifras = [
    { icono: Utensils, etiqueta: 'Mesas ocupadas', valor: `${abiertas.length}/${mesas.length}`, nota: `${pct}% del salón`, tono: 'text-slate-900' },
    { icono: Users, etiqueta: 'Cubiertos', valor: String(cubiertos), nota: 'en el salón ahora', tono: 'text-slate-900' },
    { icono: Receipt, etiqueta: 'Consumo abierto', valor: pesos(consumo), nota: cuenta ? `${cuenta} pidieron la cuenta` : 'sin cobrar todavía', tono: 'text-slate-900' },
    {
      icono: demoradas ? AlertTriangle : ChefHat,
      etiqueta: 'Esperando cocina',
      valor: String(demoradas),
      nota: demoradas ? `más de ${DEMORA_COCINA}′` : 'todo a tiempo',
      tono: demoradas ? 'text-red-600' : 'text-emerald-600',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {cifras.map((c) => (
        <div key={c.etiqueta} className="rounded-2xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <c.icono className="h-3.5 w-3.5" /> {c.etiqueta}
          </p>
          <p className={cn('mt-1 text-2xl font-bold leading-none tabular-nums [font-family:var(--font-display),system-ui]', c.tono)}>{c.valor}</p>
          <p className="mt-1 truncate text-[11px] text-slate-400">{c.nota}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * Lista de mesas abiertas por urgencia. Con `soloMozoId` muestra sólo las
 * del mozo ("Tus mesas").
 */
export function MesasAbiertas({
  mesas,
  onAbrir,
  soloMozoId,
  titulo = 'Mesas abiertas',
  className,
}: {
  mesas: MesaEstado[]
  onAbrir: (m: MesaEstado) => void
  soloMozoId?: string | null | undefined
  titulo?: string
  className?: string
}) {
  const lista = mesas
    .filter((m) => m.estado !== 'libre' && (!soloMozoId || m.mozoId === soloMozoId))
    .sort((a, b) => urgencia(a) - urgencia(b) || (b.minutosCocina ?? 0) - (a.minutosCocina ?? 0) || (b.minutos ?? 0) - (a.minutos ?? 0))

  return (
    <section className={cn('flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="font-semibold">{titulo}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{lista.length}</span>
      </div>
      {lista.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">{soloMozoId ? 'No tenés mesas abiertas.' : 'Todas las mesas están libres.'}</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {lista.map((m) => {
            const demorada = m.enCocina > 0 && (m.minutosCocina ?? 0) >= DEMORA_COCINA
            const chip = CHIP[m.estado]
            return (
              <li key={m.id}>
                <button
                  onClick={() => onAbrir(m)}
                  className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-slate-50', demorada && 'bg-red-50/60')}
                >
                  <span
                    className={cn(
                      'grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold tabular-nums',
                      demorada ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
                    )}
                  >
                    {m.nombre}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', chip.clase)}>{chip.texto}</span>
                      {m.minutos != null && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" /> {duracion(m.minutos)}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {m.comensales ?? 0} cub.{m.mozo && !soloMozoId ? ` · ${m.mozo}` : ''}
                      {m.enCocina > 0 && (
                        <span className={cn('font-semibold', demorada ? 'text-red-600' : 'text-sky-700')}>
                          {` · ${m.enCocina} en cocina ${duracion(m.minutosCocina)}`}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-base font-bold tabular-nums">{pesos(m.total ?? 0)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
