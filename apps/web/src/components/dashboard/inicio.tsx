'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { cn } from '@/lib/utils'

export const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`
export const millones = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$ ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : pesos(n)

const COLOR = { azul: '#3b9bff', ambar: '#f5a524', verde: '#10b981', rojo: '#ef4444' } as const
export type Tono = keyof typeof COLOR

/* ---------------------------------------------------------- mini gráfico */

export function Sparkline({ valores, color = COLOR.azul }: { valores: number[]; color?: string }) {
  if (valores.length < 2) return null
  const W = 96
  const H = 34
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * W, H - 3 - ((v - min) / (max - min || 1)) * (H - 6)] as const)
  const linea = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const id = `sp-${color.slice(1)}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-24 shrink-0" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linea} L${W} ${H} L0 ${H} Z`} fill={`url(#${id})`} />
      <path d={linea} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------------------------------------------------------------- KPI */

export function Kpi({
  etiqueta,
  valor,
  nota,
  variacion,
  bueno = 'sube',
  serie,
  tono = 'azul',
  icono: Icono,
  href,
  cargando,
}: {
  etiqueta: string
  valor: string
  nota?: string | undefined
  /** Variación porcentual contra el período anterior. */
  variacion?: number | undefined
  bueno?: 'sube' | 'baja'
  serie?: number[] | undefined
  tono?: Tono
  icono: typeof ArrowUpRight
  href?: string | undefined
  cargando?: boolean | undefined
}) {
  const color = COLOR[tono]
  const positivo = variacion !== undefined && (bueno === 'sube' ? variacion >= 0 : variacion <= 0)
  const cuerpo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[var(--sec)]">{etiqueta}</p>
        <span className="ax-icono h-8 w-8" style={{ '--c1': color } as React.CSSProperties}>
          <Icono className="h-4 w-4" />
        </span>
      </div>
      {cargando ? (
        <div className="mt-2 h-8 w-28 animate-pulse rounded-lg bg-slate-900/[0.06]" />
      ) : (
        <p className="ax-display ax-num mt-2 truncate text-[1.75rem] font-semibold leading-none">{valor}</p>
      )}
      <div className="mt-3 flex min-h-9 items-end justify-between gap-2">
        {variacion !== undefined && !cargando ? (
          <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', positivo ? 'text-[var(--verde)]' : 'text-[var(--rojo-t)]')}>
            {variacion >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(variacion).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
            <span className="font-normal text-[var(--ter)]">vs. período anterior</span>
          </span>
        ) : (
          <span className="text-xs text-[var(--ter)]">{nota}</span>
        )}
        {serie && !cargando && <Sparkline valores={serie} color={color} />}
      </div>
    </>
  )
  return href ? (
    <Link href={href as Route} className="ax-card ax-entra group block p-5 transition-transform hover:-translate-y-0.5" data-tono={tono === 'azul' ? undefined : tono}>
      {cuerpo}
    </Link>
  ) : (
    <section className="ax-card ax-entra p-5" data-tono={tono === 'azul' ? undefined : tono}>
      {cuerpo}
    </section>
  )
}

/* ------------------------------------------------------- avisos de hoy */

export interface Aviso {
  id: string
  texto: string
  href: string
  tono: Tono
  icono: typeof ArrowUpRight
}

/**
 * Lo que pide atención hoy, en una sola fila de chips. Reemplaza a los
 * banners grandes: cada chip lleva a la pantalla donde se resuelve.
 */
export function AvisosHoy({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null
  return (
    <div className="ax-entra mb-6 flex flex-wrap items-center gap-2" role="list" aria-label="Para atender hoy">
      {avisos.map((a) => {
        const c = COLOR[a.tono]
        return (
          <Link
            key={a.id}
            role="listitem"
            href={a.href as Route}
            className="group inline-flex items-center gap-2 rounded-full border bg-white py-1.5 pl-1.5 pr-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:bg-slate-50"
            style={{ borderColor: `color-mix(in srgb, ${c} 35%, transparent)` }}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full text-white" style={{ background: c }}>
              <a.icono className="h-3.5 w-3.5" />
            </span>
            <span className="text-[var(--texto)]">{a.texto}</span>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ter)] transition-transform group-hover:translate-x-0.5" />
          </Link>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------- vencimientos semana */

interface Evento {
  fecha: string
  total: number
  items: Array<{ pagoId: string; numero: number; proveedor: string; estado: string; monto: number; tipo: string }>
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

/** Los próximos 7 días con lo que vence cada uno (cheques, eCheq, transferencias). */
export function VencimientosSemana({ verImportes }: { verImportes: boolean }) {
  const hoy = hoyAR()
  const hasta = sumarDias(hoy, 6)
  const { data, isLoading } = useQuery({
    queryKey: ['vencimientos-semana', hoy],
    queryFn: async () => {
      const r = await fetch(`/api/pagos/calendario?desde=${hoy}&hasta=${hasta}`)
      if (!r.ok) return [] as Evento[]
      return ((await r.json()).eventos ?? []) as Evento[]
    },
    staleTime: 5 * 60_000,
  })
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i))
  const porDia = new Map((data ?? []).map((e) => [e.fecha, e]))
  const total = (data ?? []).reduce((s, e) => s + e.total, 0)

  return (
    <section className="ax-card ax-entra p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="ax-card-titulo">Lo que vence esta semana</h2>
          {!isLoading && (
            <p className="mt-0.5 text-xs text-[var(--ter)]">
              {(data ?? []).length === 0 ? 'Nada programado en los próximos 7 días' : verImportes ? `${pesos(total)} en total` : `${(data ?? []).reduce((s, e) => s + e.items.length, 0)} pagos`}
            </p>
          )}
        </div>
        <Link href={'/finanzas' as Route} className="text-sm text-[var(--azul-2)] underline-offset-4 hover:underline">
          Ver calendario
        </Link>
      </div>
      <div className="ax-sin-barra -mx-1 overflow-x-auto px-1">
        <div className="grid min-w-[38rem] grid-cols-7 gap-2">
          {dias.map((d, i) => {
            const e = porDia.get(d)
            const fecha = new Date(`${d}T12:00:00`)
            return (
              <div
                key={d}
                className={cn('min-h-[6.5rem] rounded-xl border p-2.5', i === 0 ? 'border-[rgba(59,155,255,0.45)] bg-[rgba(59,155,255,0.06)]' : 'border-[var(--borde)] bg-[var(--pizarra-2)]')}
              >
                <p className={cn('text-xs', i === 0 ? 'font-medium text-[var(--azul-2)]' : 'text-[var(--ter)]')}>
                  {i === 0 ? 'Hoy' : `${DIAS[fecha.getDay()]} ${fecha.getDate()}`}
                </p>
                {isLoading ? (
                  <div className="mt-2 h-5 animate-pulse rounded-md bg-slate-900/[0.05]" />
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {e?.items.slice(0, 2).map((it) => (
                      <Link
                        key={it.pagoId + it.tipo}
                        href={`/pagos/${it.pagoId}` as Route}
                        title={`${it.proveedor} · OP ${it.numero}`}
                        className={cn(
                          'block truncate rounded-md px-1.5 py-1 text-[11px] leading-tight',
                          it.tipo === 'TRANSFERENCIA' ? 'bg-[rgba(59,155,255,0.14)] text-[var(--azul-2)]' : 'bg-[rgba(245,165,36,0.16)] text-[var(--ambar-2)]'
                        )}
                      >
                        {verImportes ? millones(it.monto) : it.proveedor}
                      </Link>
                    ))}
                    {(e?.items.length ?? 0) > 2 && <p className="text-[11px] text-[var(--ter)]">y {e!.items.length - 2} más</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- uso del plan */

export function UsoPlan({ usados, limite, plan }: { usados: number; limite: number | null; plan?: string | undefined }) {
  const pct = limite ? Math.min(100, (usados / limite) * 100) : 0
  const tono = pct >= 90 ? COLOR.rojo : pct >= 70 ? COLOR.ambar : COLOR.azul
  return (
    <section className="ax-card ax-entra p-5">
      <div className="flex items-center justify-between">
        <h2 className="ax-card-titulo">Facturas del mes</h2>
        {plan && <span className="ax-chip ax-chip-gris">Plan {plan}</span>}
      </div>
      <p className="ax-display ax-num mt-3 text-2xl font-semibold">
        {usados.toLocaleString('es-AR')}
        {limite ? <span className="text-base font-normal text-[var(--ter)]"> de {limite.toLocaleString('es-AR')}</span> : null}
      </p>
      {limite ? (
        <>
          <div className="ax-barra mt-3" style={{ '--c1': tono } as React.CSSProperties}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-[var(--ter)]">
            {pct >= 90 ? 'Estás cerca del límite del plan.' : `Te quedan ${(limite - usados).toLocaleString('es-AR')} este mes.`}{' '}
            <Link href={'/configuracion/plan' as Route} className="text-[var(--azul-2)] hover:underline">
              Ver plan
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-[var(--ter)]">Sin límite mensual.</p>
      )}
    </section>
  )
}
