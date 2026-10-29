'use client'

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Sparkline } from './graficos'

export const pesos = (n: number, dec = 0) =>
  `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`

export function Card({
  titulo,
  accion,
  tono,
  className = '',
  children,
  sinPadding,
}: {
  titulo?: string
  accion?: React.ReactNode
  tono?: 'ambar' | 'verde' | 'rojo' | undefined
  className?: string
  children: React.ReactNode
  sinPadding?: boolean
}) {
  return (
    <section className={`pt-card pt-entra ${sinPadding ? '' : 'p-5'} ${className}`} data-tono={tono}>
      {(titulo || accion) && (
        <div className={`flex items-center justify-between gap-3 ${sinPadding ? 'px-5 pt-5 pb-3' : 'mb-4'}`}>
          {titulo && <h2 className="pt-card-titulo">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  )
}

/** Indicador: número grande, variación contra el período anterior y tendencia. */
export function Kpi({
  etiqueta,
  valor,
  variacion,
  bueno = 'sube',
  serie,
  tono,
  icono: Icono,
  nota,
}: {
  etiqueta: string
  valor: string
  variacion?: number
  bueno?: 'sube' | 'baja'
  serie?: number[]
  tono?: 'ambar' | 'verde' | 'rojo'
  icono?: typeof ArrowUpRight
  nota?: string
}) {
  const positivo = variacion !== undefined && (bueno === 'sube' ? variacion >= 0 : variacion <= 0)
  const color = tono === 'ambar' ? '#f5a524' : tono === 'verde' ? '#34d399' : tono === 'rojo' ? '#f87171' : '#3b9bff'
  return (
    <section className="pt-card pt-entra p-5" data-tono={tono}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[var(--sec)]">{etiqueta}</p>
        {Icono && (
          <span className="pt-icono h-8 w-8" style={{ '--c1': color } as React.CSSProperties}>
            <Icono className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="pt-display pt-num mt-2 text-[1.9rem] font-semibold leading-none">{valor}</p>
      <div className="mt-3 flex items-end justify-between gap-2 min-h-9">
        {variacion !== undefined ? (
          <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${positivo ? 'text-[var(--verde)]' : 'text-[var(--rojo-t)]'}`}>
            {variacion >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(variacion).toLocaleString('es-AR')}% <span className="text-[var(--ter)] font-normal whitespace-nowrap">vs. mes anterior</span>
          </span>
        ) : (
          <span className="text-xs text-[var(--ter)]">{nota}</span>
        )}
        {serie && <Sparkline valores={serie} color={color} />}
      </div>
    </section>
  )
}

export function Tabs({
  opciones,
  activa,
  onCambiar,
}: {
  opciones: Array<{ v: string; t: string; n?: number }>
  activa: string
  onCambiar: (v: string) => void
}) {
  return (
    <div className="pt-tabs" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={activa === o.v}
          data-activo={activa === o.v ? '1' : '0'}
          className="pt-tab"
          onClick={() => onCambiar(o.v)}
        >
          {o.t}
          {o.n !== undefined && <span className="ml-1.5 text-xs text-[var(--ter)]">{o.n}</span>}
        </button>
      ))}
    </div>
  )
}

/** Avatar con iniciales del proveedor, color estable por nombre. */
export function Inicial({ nombre }: { nombre: string }) {
  const colores = ['#3b9bff', '#34d399', '#f5a524', '#a78bfa', '#f472b6', '#22d3ee']
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const color = colores[h % colores.length]!
  const ini = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      {ini}
    </span>
  )
}

export function Aviso({
  tono = 'ambar',
  icono: Icono,
  titulo,
  texto,
  accion,
}: {
  tono?: 'ambar' | 'azul'
  icono: typeof ArrowUpRight
  titulo: string
  texto: string
  accion?: React.ReactNode
}) {
  const estilos =
    tono === 'ambar'
      ? 'border-[rgba(245,165,36,0.35)] bg-[linear-gradient(90deg,rgba(245,165,36,0.12),rgba(245,165,36,0.03))]'
      : 'border-[rgba(59,155,255,0.3)] bg-[linear-gradient(90deg,rgba(59,155,255,0.12),rgba(59,155,255,0.03))]'
  return (
    <div className={`pt-entra mb-6 flex flex-wrap items-center gap-4 rounded-2xl border px-4 py-3.5 ${estilos}`}>
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tono === 'ambar' ? 'bg-[var(--ambar)] text-[#1c1405]' : 'bg-[var(--azul)] text-white'}`}>
        <Icono className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${tono === 'ambar' ? 'text-[var(--ambar-2)]' : 'text-[var(--azul-2)]'}`}>{titulo}</p>
        <p className="text-sm text-[var(--sec)]">{texto}</p>
      </div>
      {accion}
    </div>
  )
}
