'use client'

import { useId, useState } from 'react'

export const PALETA = ['#3b9bff', '#f5a524', '#10b981', '#a78bfa', '#22d3ee', '#f472b6', '#94a3b8']

/** Dona con leyenda. `formato` da el texto de cada parte (monto o %). */
export function Dona({
  partes,
  centro,
  bajada,
  formato,
}: {
  partes: Array<{ nombre: string; valor: number; color: string }>
  centro: string
  bajada: string
  formato?: (valor: number, pct: number) => string
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1
  const R = 44
  const C = 2 * Math.PI * R
  let acum = 0
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(15,23,42,0.06)" strokeWidth="14" />
          {partes.map((p) => {
            const largo = (p.valor / total) * C
            const el = (
              <circle
                key={p.nombre}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth="14"
                strokeDasharray={`${Math.max(largo - 1.5, 0)} ${C}`}
                strokeDashoffset={-acum}
                className="ax-dona-seg"
              />
            )
            acum += largo
            return el
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="ax-display ax-num text-lg font-semibold leading-tight">{centro}</p>
            <p className="text-[11px] text-[var(--ter)]">{bajada}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {partes.map((p) => {
          const pct = (p.valor / total) * 100
          return (
            <li key={p.nombre} className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate text-[var(--sec)]">{p.nombre}</span>
              <span className="ax-num font-medium">{formato ? formato(p.valor, pct) : `${pct < 1 && pct > 0 ? '< 1' : Math.round(pct)} %`}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Barras verticales; resalta la última o la que está bajo el mouse. */
export function Barras({
  etiquetas,
  valores,
  formato = (n: number) => n.toLocaleString('es-AR'),
  alto = 200,
}: {
  etiquetas: string[]
  valores: number[]
  formato?: (n: number) => string
  alto?: number
}) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = alto
  const pad = { t: 26, b: 24 }
  const max = Math.max(...valores, 1) * 1.1
  const paso = W / Math.max(valores.length, 1)
  const ancho = paso * 0.56
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setHover(null)} role="img" aria-label="Gráfico de barras">
      <defs>
        <linearGradient id={`b-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7cc4ff" />
          <stop offset="100%" stopColor="#d3e9ff" />
        </linearGradient>
        <linearGradient id={`bf-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b9bff" />
          <stop offset="100%" stopColor="#1f6fd1" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="rgba(15,23,42,0.06)" />
      ))}
      {valores.map((v, i) => {
        const h = Math.max((v / max) * (H - pad.t - pad.b), v > 0 ? 3 : 0)
        const x = i * paso + (paso - ancho) / 2
        const y = H - pad.b - h
        const destacada = hover === i || (hover === null && i === valores.length - 1)
        return (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={i * paso} y={0} width={paso} height={H} fill="transparent" />
            <rect x={x} y={y} width={ancho} height={h} rx="6" fill={`url(#${destacada ? 'bf' : 'b'}-${id})`} className="ax-barra-v" style={{ animationDelay: `${i * 45}ms` }} />
            {destacada && (
              <text x={x + ancho / 2} y={y - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f1a2e">
                {formato(v)}
              </text>
            )}
            <text x={x + ancho / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#8590a6">
              {etiquetas[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Avatar con iniciales y color estable por nombre. */
export function Inicial({ nombre }: { nombre: string }) {
  let h = 0
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const color = PALETA[h % (PALETA.length - 1)]!
  const ini = nombre
    .replace(/\b(S\.?A\.?S?|S\.?R\.?L|SAS|SRL|SA)\b\.?/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 32%, transparent)` }}
    >
      {ini || '?'}
    </span>
  )
}
