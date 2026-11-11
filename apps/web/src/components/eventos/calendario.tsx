'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { CalendarClock, Lock, Users } from 'lucide-react'
import { SIGLAS, dadaDeBaja } from '@/lib/eventos/constantes'
import type { AgendaFila, EventoResumen, ReservaFila } from '@/lib/eventos/db'
import { sumarDias } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { BarraCobro, BarraEstados, textoCobrado } from './comunes'

/*
 * Las piezas del calendario de eventos. Una "entrada" es cualquier cosa que
 * ocupa un lugar en un día: un evento (con la mezcla de estados de sus
 * reservas y el % cobrado), una reserva suelta (coloreada por su estado) o un pendiente de agenda (con
 * borde punteado, para que no se confunda con algo que ocupa el salón).
 */

export type Entrada =
  | { clase: 'evento'; id: string; fecha: string; hora: string | null; e: EventoResumen }
  | { clase: 'reserva'; id: string; fecha: string; hora: string | null; r: ReservaFila }
  | { clase: 'agenda'; id: string; fecha: string; hora: string | null; g: AgendaFila }

const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

/** 0 = lunes. */
export function diaSemana(iso: string) {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
}

export function inicioSemana(iso: string) {
  return sumarDias(iso, -diaSemana(iso))
}

/** Grilla del mes: de lunes a domingo, completando con los días vecinos. */
export function diasDelMes(mes: string) {
  const primero = `${mes}-01`
  const desde = inicioSemana(primero)
  const [y, m] = mes.split('-').map(Number) as [number, number]
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const hasta = sumarDias(ultimo, 6 - diaSemana(ultimo))
  const dias: string[] = []
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d)
  return dias
}

export function colorTipo(color: string | null | undefined) {
  return color ?? '#64748b'
}

/** Chip de una entrada. `denso` para las celdas del mes. */
export function ChipEntrada({ x, colorDe, denso }: { x: Entrada; colorDe: (tipo: string) => string; denso?: boolean }) {
  if (x.clase === 'evento') {
    const e = x.e
    return (
      <Link
        href={`/eventos/evento/${e.id}` as Route}
        className={cn('block rounded-lg border border-slate-900/[0.1] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-slate-900/[0.25]', denso ? 'px-1.5 py-1' : 'p-2.5')}
        style={{ borderLeft: `3px solid ${colorDe(e.tipo)}` }}
        title={`${e.nombre} · ${e.personas}${e.cupo ? `/${e.cupo}` : ''} personas · ${e.reservas} reservas · cobrado ${textoCobrado(e.porcentajeCobrado)}`}
      >
        <div className={cn('flex items-center gap-1', denso ? 'text-[11px]' : 'text-sm')}>
          {e.horaInicio && <span className="ax-num text-[var(--ter)]">{e.horaInicio}</span>}
          <span className="truncate font-medium">{e.nombre}</span>
        </div>
        <div className={cn('flex items-center gap-1.5 text-[var(--sec)]', denso ? 'text-[10px]' : 'mt-0.5 text-xs')}>
          <Users className="h-3 w-3 shrink-0" />
          <span className="ax-num">
            {e.personas}
            {e.cupo ? `/${e.cupo}` : ''}
          </span>
          {!denso && <span>· {e.reservas} reservas</span>}
          {e.reservas > 0 && <BarraCobro pct={e.porcentajeCobrado} className="ml-auto" denso={denso} />}
        </div>
        <BarraEstados siglas={e.siglas} className={denso ? 'mt-1 h-1' : 'mt-2'} />
      </Link>
    )
  }
  if (x.clase === 'reserva') {
    const r = x.r
    const s = SIGLAS[r.sigla]
    return (
      <Link
        href={`/eventos/reserva/${r.id}` as Route}
        className={cn('block rounded-lg border', s.fondo, s.borde, denso ? 'px-1.5 py-0.5' : 'p-2.5')}
        title={`${r.nombre} · ${r.personas} personas · ${s.texto} · cobrado ${textoCobrado(r.porcentajeCobrado)}`}
      >
        <div className={cn('flex items-center gap-1', denso ? 'text-[11px]' : 'text-sm', s.color)}>
          {r.hora && <span className="ax-num opacity-70">{r.hora}</span>}
          <span className="truncate font-medium">{r.nombre}</span>
          <span className="ax-num ml-auto shrink-0 opacity-80">{r.personas}p</span>
        </div>
        {!denso && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--sec)]">
            <span className="font-mono font-semibold">{r.sigla}</span>
            {r.salon && <span>· {r.salon}</span>}
            {r.mesas.length > 0 && (
              <span className="inline-flex items-center gap-0.5">
                · {r.mesaInamovible && <Lock className="h-3 w-3" />}
                {r.mesas.join(', ')}
              </span>
            )}
            {!dadaDeBaja(r.estado) && <BarraCobro pct={r.porcentajeCobrado} className="ml-auto" denso />}
          </div>
        )}
      </Link>
    )
  }
  const g = x.g
  const pendiente = g.estado === 'PENDIENTE'
  return (
    <Link
      href={(g.reservaId ? `/eventos/reserva/${g.reservaId}` : `/eventos/evento/${g.eventoId}`) as Route}
      className={cn(
        'block rounded-lg border border-dashed',
        pendiente ? 'border-sky-400 bg-sky-50/50 text-sky-900' : 'border-slate-300 text-[var(--ter)] line-through',
        denso ? 'px-1.5 py-0.5' : 'p-2.5'
      )}
      title={`${g.titulo}${g.responsableNombre ? ` · ${g.responsableNombre}` : ''}`}
    >
      <div className={cn('flex items-center gap-1', denso ? 'text-[11px]' : 'text-sm')}>
        <CalendarClock className="h-3 w-3 shrink-0" />
        {x.hora && <span className="ax-num opacity-70">{x.hora}</span>}
        <span className="truncate">{g.titulo}</span>
      </div>
      {!denso && (g.reservaNombre || g.eventoNombre || g.responsableNombre) && (
        <div className="mt-0.5 truncate text-xs opacity-80">
          {[g.reservaNombre ? `#${g.reservaNumero} ${g.reservaNombre}` : g.eventoNombre, g.responsableNombre].filter(Boolean).join(' · ')}
        </div>
      )}
    </Link>
  )
}

export function VistaMes({
  mes,
  porDia,
  hoy,
  colorDe,
  onDia,
}: {
  mes: string
  porDia: Map<string, Entrada[]>
  hoy: string
  colorDe: (tipo: string) => string
  onDia: (d: string) => void
}) {
  const dias = diasDelMes(mes)
  return (
    <div className="ax-card overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-slate-900/[0.08] text-center text-xs uppercase tracking-wide text-[var(--ter)]">
        {DIAS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const xs = porDia.get(d) ?? []
          const fuera = !d.startsWith(mes)
          const personas = xs.reduce((s, x) => s + (x.clase === 'evento' ? x.e.personas : x.clase === 'reserva' && !dadaDeBaja(x.r.estado) ? x.r.personas : 0), 0)
          return (
            <div key={d} className={cn('min-h-[5.5rem] border-b border-r border-slate-900/[0.06] p-1 sm:min-h-[8rem] sm:p-1.5', fuera && 'bg-slate-900/[0.02]')}>
              <button type="button" onClick={() => onDia(d)} className="mb-1 flex w-full items-center justify-between text-left">
                <span
                  className={cn(
                    'grid h-6 w-6 place-items-center rounded-full text-xs',
                    d === hoy ? 'bg-[var(--azul)] font-semibold text-white' : fuera ? 'text-[var(--ter)]' : 'text-slate-700'
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {personas > 0 && <span className="ax-num hidden text-[10px] text-[var(--ter)] sm:inline">{personas}p</span>}
              </button>
              {/* En el teléfono no entran chips: puntos de color y se toca el día. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {xs.slice(0, 6).map((x) => (
                  <span
                    key={x.id}
                    className={cn('h-1.5 w-1.5 rounded-full', x.clase === 'agenda' && 'ring-1 ring-sky-400')}
                    style={{ background: x.clase === 'evento' ? colorDe(x.e.tipo) : x.clase === 'reserva' ? SIGLAS[x.r.sigla].punto : 'transparent' }}
                  />
                ))}
              </div>
              <div className="hidden space-y-1 sm:block">
                {xs.slice(0, 3).map((x) => (
                  <ChipEntrada key={x.id} x={x} colorDe={colorDe} denso />
                ))}
                {xs.length > 3 && (
                  <button type="button" onClick={() => onDia(d)} className="w-full rounded px-1 text-left text-[11px] text-[var(--azul-2)] hover:bg-slate-900/[0.04]">
                    +{xs.length - 3} más
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function VistaSemana({
  desde,
  porDia,
  hoy,
  colorDe,
  onDia,
}: {
  desde: string
  porDia: Map<string, Entrada[]>
  hoy: string
  colorDe: (tipo: string) => string
  onDia: (d: string) => void
}) {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i))
  return (
    <div className="grid gap-3 md:grid-cols-7 md:gap-2">
      {dias.map((d, i) => {
        const xs = porDia.get(d) ?? []
        return (
          <div key={d} className={cn('ax-card min-h-[6rem] p-2', d === hoy && 'ring-2 ring-[var(--azul)]/40')}>
            <button type="button" onClick={() => onDia(d)} className="mb-2 flex w-full items-baseline gap-1.5 text-left">
              <span className="text-xs uppercase text-[var(--ter)]">{DIAS[i]}</span>
              <span className="text-sm font-semibold">{Number(d.slice(8))}</span>
            </button>
            <div className="space-y-1.5">
              {xs.length === 0 && <p className="text-xs text-[var(--ter)]">—</p>}
              {xs.map((x) => (
                <ChipEntrada key={x.id} x={x} colorDe={colorDe} denso />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Vista del día por hora. Lo que cae en la misma hora va lado a lado: la
 * noche del 31 puede tener el evento grande y dos privados a las 21.
 */
export function VistaDia({ entradas, colorDe }: { entradas: Entrada[]; colorDe: (tipo: string) => string }) {
  const sinHora = entradas.filter((x) => !x.hora)
  const grupos = new Map<number, Entrada[]>()
  for (const x of entradas) {
    if (!x.hora) continue
    const h = Number(x.hora.slice(0, 2))
    const arr = grupos.get(h)
    if (arr) arr.push(x)
    else grupos.set(h, [x])
  }
  const horas = [...grupos.keys()]
  const min = Math.min(11, ...horas)
  const max = Math.max(23, ...horas)
  return (
    <div className="ax-card p-0">
      {sinHora.length > 0 && (
        <div className="flex gap-3 border-b border-slate-900/[0.06] p-2">
          <span className="w-12 shrink-0 pt-2 text-right text-xs text-[var(--ter)]">Sin hora</span>
          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sinHora.map((x) => (
              <ChipEntrada key={x.id} x={x} colorDe={colorDe} />
            ))}
          </div>
        </div>
      )}
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((h) => {
        const xs = grupos.get(h) ?? []
        return (
          <div key={h} className="flex min-h-[3rem] gap-3 border-b border-slate-900/[0.06] p-2 last:border-0">
            <span className="ax-num w-12 shrink-0 pt-1 text-right text-xs text-[var(--ter)]">{String(h).padStart(2, '0')}:00</span>
            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {xs.map((x) => (
                <ChipEntrada key={x.id} x={x} colorDe={colorDe} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
