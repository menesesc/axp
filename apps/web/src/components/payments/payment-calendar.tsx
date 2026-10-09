'use client'

import Link from 'next/link'
import { cn, formatCurrency, formatNumeroOrden } from '@/lib/utils'
import { CalendarDays, Clock } from 'lucide-react'

/**
 * Un día del calendario mezcla tres cosas distintas y conviene no confundirlas:
 * lo que ya tiene orden de pago (`pago`), lo que vence y todavía no la tiene
 * (`vencimiento`) y lo que sabemos que vence aunque no haya llegado el papel
 * (`estimado`, de las obligaciones periódicas).
 */
export type ClaseEvento = 'pago' | 'vencimiento' | 'estimado'

export interface CalendarEventItem {
  clase?: ClaseEvento
  pagoId: string | null
  documentoId?: string | null
  obligacionId?: string | null
  numero: number | null
  etiqueta?: string
  proveedor: string
  estado: string
  monto: number
  tipo: string
  rubro?: string | null
}

export interface CalendarEvent {
  fecha: string
  total: number
  items: CalendarEventItem[]
}

export const COLOR_METODO = {
  transferencia: '#3b9bff',
  cheque: '#f5a524',
  otros: '#10b981',
  vencimiento: '#ef4444',
  estimado: '#94a3b8',
}

const clase = (it: CalendarEventItem): ClaseEvento => it.clase ?? 'pago'

/** Suma del día partida en lo que se compara: medio de pago y clase. */
export function porMetodo(items: CalendarEventItem[]) {
  let transferencia = 0
  let cheque = 0
  let otros = 0
  let vencimiento = 0
  let estimado = 0
  for (const it of items) {
    const c = clase(it)
    if (c === 'vencimiento') vencimiento += it.monto
    else if (c === 'estimado') estimado += it.monto
    else if (it.tipo === 'TRANSFERENCIA') transferencia += it.monto
    else if (it.tipo === 'CHEQUE' || it.tipo === 'ECHEQ') cheque += it.monto
    else otros += it.monto
  }
  return { transferencia, cheque, otros, vencimiento, estimado }
}

/** Monto compacto para celdas chicas: $ 1,2 M · $ 50 mil. */
function compacto(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$ ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `$ ${Math.round(n / 1_000)} mil`
  return `$ ${Math.round(n)}`
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const METODO: Record<string, { texto: string; color: string }> = {
  TRANSFERENCIA: { texto: 'Transferencia', color: COLOR_METODO.transferencia },
  ECHEQ: { texto: 'eCheq', color: COLOR_METODO.cheque },
  CHEQUE: { texto: 'Cheque', color: COLOR_METODO.cheque },
  EFECTIVO: { texto: 'Efectivo', color: COLOR_METODO.otros },
}

export const claveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const capitalizar = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

/** 6 semanas (lunes a domingo) que contienen al mes. */
function diasDelCalendario(mes: Date): Date[] {
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1)
  const desplazamiento = (primero.getDay() + 6) % 7
  const inicio = new Date(primero)
  inicio.setDate(1 - desplazamiento)
  return Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
}

/** Grilla mensual: cada día con el total y la barra de transferencias / cheques. */
export function PaymentCalendar({
  month,
  eventos,
  seleccionado,
  onSeleccionar,
  hoy,
}: {
  month: Date
  eventos: CalendarEvent[]
  seleccionado: string | null
  onSeleccionar: (dia: string) => void
  hoy: string
}) {
  const dias = diasDelCalendario(month)
  const porDia = new Map(eventos.map((e) => [e.fecha, e]))

  return (
    <section className="ax-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-900/[0.08] bg-[#f7f9fc]">
        {DIAS.map((d, i) => (
          <div key={d} className={cn('px-2 py-2.5 text-center text-xs font-medium', i >= 5 ? 'text-slate-400' : 'text-slate-500')}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia, i) => {
          const clave = claveDia(dia)
          const enMes = dia.getMonth() === month.getMonth()
          const evento = enMes ? porDia.get(clave) : undefined
          const esHoy = clave === hoy
          const elegido = clave === seleccionado
          const pasado = clave < hoy
          const m = evento ? porMetodo(evento.items) : null
          const finde = i % 7 >= 5
          return (
            <button
              key={clave}
              type="button"
              disabled={!enMes}
              onClick={() => onSeleccionar(clave)}
              aria-pressed={elegido}
              aria-label={`${dia.getDate()}${evento ? `, ${evento.items.length} pagos` : ''}`}
              className={cn(
                'relative flex min-h-[5.75rem] flex-col items-stretch gap-1 border-b border-r border-slate-900/[0.06] p-2 text-left transition-colors [&:nth-child(7n)]:border-r-0',
                !enMes && 'cursor-default bg-slate-50/60',
                enMes && finde && 'bg-slate-50/40',
                enMes && 'hover:bg-[rgba(59,155,255,0.05)]',
                elegido && 'bg-[rgba(59,155,255,0.08)] shadow-[inset_0_0_0_2px_#3b9bff] hover:bg-[rgba(59,155,255,0.08)]'
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full text-xs font-medium tabular-nums',
                  esHoy ? 'bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-white' : !enMes ? 'text-slate-300' : pasado ? 'text-slate-400' : 'text-slate-700'
                )}
              >
                {dia.getDate()}
              </span>
              {evento && m && (
                <>
                  <span className={cn('flex items-center gap-1 text-[12px] font-semibold tabular-nums', pasado ? 'text-slate-400' : 'text-slate-900')}>
                    {compacto(evento.total)}
                    {/* Un cheque con fecha futura todavía no se debitó: hay que
                        tener la plata ese día, y de un vistazo no se distinguía
                        de un pago ya hecho. */}
                    {!pasado && !esHoy && m.cheque > 0 && (
                      <Clock className="h-3 w-3 shrink-0" style={{ color: COLOR_METODO.cheque }} aria-label="cheque o eCheq por debitar" />
                    )}
                  </span>
                  <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-900/[0.06]">
                    {m.transferencia > 0 && <i style={{ width: `${(m.transferencia / evento.total) * 100}%`, background: COLOR_METODO.transferencia }} />}
                    {m.cheque > 0 && <i style={{ width: `${(m.cheque / evento.total) * 100}%`, background: COLOR_METODO.cheque }} />}
                    {m.otros > 0 && <i style={{ width: `${(m.otros / evento.total) * 100}%`, background: COLOR_METODO.otros }} />}
                    {m.vencimiento > 0 && <i style={{ width: `${(m.vencimiento / evento.total) * 100}%`, background: COLOR_METODO.vencimiento }} />}
                    {m.estimado > 0 && <i style={{ width: `${(m.estimado / evento.total) * 100}%`, background: COLOR_METODO.estimado }} />}
                  </span>
                  <span className="hidden truncate text-[11px] text-slate-500 md:block">
                    {evento.items.length === 1 ? capitalizar(evento.items[0]!.proveedor) : `${evento.items.length} pagos`}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-900/[0.06] px-4 py-2.5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.transferencia }} /> Transferencias
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.cheque }} /> Cheques y eCheq
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.otros }} /> Efectivo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.vencimiento }} /> Vence sin orden
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.estimado }} /> Estimado
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" style={{ color: COLOR_METODO.cheque }} /> Cheque por debitar
        </span>
      </div>
    </section>
  )
}

/**
 * Una línea del detalle del día. Un pago lleva a su orden, un vencimiento al
 * comprobante y un estimado no lleva a ningún lado porque todavía no existe.
 */
function ItemDelDia({ it, esFuturo }: { it: CalendarEventItem; esFuturo: boolean }) {
  const c = clase(it)
  const met =
    c === 'vencimiento'
      ? { texto: 'Vence sin orden', color: COLOR_METODO.vencimiento }
      : c === 'estimado'
        ? { texto: 'Estimado', color: COLOR_METODO.estimado }
        : (METODO[it.tipo] ?? { texto: it.tipo, color: '#94a3b8' })

  const detalle =
    c === 'pago'
      ? `${met.texto} · OP ${formatNumeroOrden(it.numero ?? 0)}${estadoTexto(it, esFuturo)}`
      : `${met.texto}${it.etiqueta ? ` · ${it.etiqueta}` : ''}`

  const cuerpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{capitalizar(it.proveedor)}</span>
        <span className={cn('shrink-0 text-sm font-medium tabular-nums', c === 'estimado' && 'text-slate-500')}>
          {it.monto > 0 ? formatCurrency(it.monto) : 'a confirmar'}
        </span>
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: met.color }} />
        <span className="truncate">{detalle}</span>
      </p>
    </>
  )

  const estilo = cn(
    'block rounded-xl px-3 py-2',
    it.estado === 'BORRADOR' && 'border border-dashed border-slate-900/[0.14]',
    c === 'estimado' && 'border border-dashed border-slate-900/[0.14] bg-slate-50/60'
  )

  const destino = c === 'pago' && it.pagoId ? `/pagos/${it.pagoId}` : c === 'vencimiento' && it.documentoId ? `/documento/${it.documentoId}` : null

  if (!destino) return <div className={estilo}>{cuerpo}</div>
  return (
    <Link href={destino} className={cn(estilo, 'transition-colors hover:bg-[rgba(59,155,255,0.06)]')}>
      {cuerpo}
    </Link>
  )
}

/**
 * Qué decir de cada pago. Para un cheque lo que importa no es el estado de la
 * orden sino si ya se debitó: uno entregado con fecha futura sigue siendo
 * plata que hay que tener.
 */
function estadoTexto(it: CalendarEventItem, esFuturo: boolean): string {
  if (it.estado === 'BORRADOR') return ' · borrador'
  const esCheque = it.tipo === 'CHEQUE' || it.tipo === 'ECHEQ'
  if (esCheque) return esFuturo ? ' · por debitar' : it.estado === 'PAGADO' ? ' · debitado' : ' · entregado'
  return it.estado === 'PAGADO' ? ' · pagado' : ''
}

/** Panel con los pagos del día elegido. */
export function DetalleDia({
  dia,
  evento,
  hoy,
}: {
  dia: string | null
  evento: CalendarEvent | undefined
  hoy?: string
}) {
  if (!dia) return null
  const esFuturo = !!hoy && dia > hoy
  const fecha = new Date(`${dia}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const m = evento ? porMetodo(evento.items) : null
  return (
    <section className="ax-card ax-entra p-5">
      <p className="text-xs text-[var(--ter)]">Pagos del</p>
      <h2 className="ax-display mt-0.5 text-lg font-semibold first-letter:uppercase">{fecha}</h2>
      {!evento ? (
        <div className="mt-6 flex flex-col items-center py-6 text-center">
          <span className="ax-icono h-10 w-10">
            <CalendarDays className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm text-[var(--sec)]">No hay pagos programados este día.</p>
        </div>
      ) : (
        <>
          <p className="ax-display ax-num mt-3 text-2xl font-semibold">{formatCurrency(evento.total)}</p>
          {m && (
            <div className="mt-3 space-y-1.5 text-xs">
              {m.transferencia > 0 && (
                <p className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.transferencia }} /> Transferencias
                  </span>
                  <span className="tabular-nums">{formatCurrency(m.transferencia)}</span>
                </p>
              )}
              {m.cheque > 0 && (
                <p className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.cheque }} /> Cheques y eCheq
                  </span>
                  <span className="tabular-nums">{formatCurrency(m.cheque)}</span>
                </p>
              )}
              {m.vencimiento > 0 && (
                <p className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.vencimiento }} /> Vence sin orden
                  </span>
                  <span className="tabular-nums">{formatCurrency(m.vencimiento)}</span>
                </p>
              )}
              {m.estimado > 0 && (
                <p className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: COLOR_METODO.estimado }} /> Estimado
                  </span>
                  <span className="tabular-nums">{formatCurrency(m.estimado)}</span>
                </p>
              )}
            </div>
          )}
          <ul className="mt-4 space-y-1.5 border-t border-slate-900/[0.06] pt-4">
            {evento.items.map((it, i) => (
              <li key={`${it.pagoId ?? it.documentoId ?? it.obligacionId}-${i}`}>
                <ItemDelDia it={it} esFuturo={esFuturo} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
