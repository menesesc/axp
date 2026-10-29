'use client'

import { useId, useState } from 'react'

/** Camino suave (curva cardinal) entre puntos. */
function camino(puntos: Array<[number, number]>) {
  if (puntos.length < 2) return ''
  let d = `M ${puntos[0]![0]} ${puntos[0]![1]}`
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1] ?? puntos[i]!
    const p1 = puntos[i]!
    const p2 = puntos[i + 1]!
    const p3 = puntos[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

/** Gráfico de área con una o dos series y tooltip al pasar el mouse. */
export function Area({
  etiquetas,
  series,
  alto = 220,
  formato = (n: number) => n.toLocaleString('es-AR'),
}: {
  etiquetas: string[]
  series: Array<{ nombre: string; valores: number[]; color: string; punteada?: boolean }>
  alto?: number
  formato?: (n: number) => string
}) {
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = alto
  const pad = { t: 12, r: 8, b: 26, l: 8 }
  const max = Math.max(...series.flatMap((s) => s.valores)) * 1.12
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (etiquetas.length - 1)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible" role="img" aria-label={series.map((s) => s.nombre).join(' y ')}>
        <defs>
          {series.map((s, n) => (
            <linearGradient key={n} id={`${id}-g${n}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={s.punteada ? 0 : 0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="rgba(15,23,42,0.06)" />
        ))}
        {series.map((s, n) => {
          const pts = s.valores.map((v, i) => [x(i), y(v)] as [number, number])
          const linea = camino(pts)
          return (
            <g key={s.nombre}>
              {!s.punteada && <path d={`${linea} L ${x(pts.length - 1)} ${H - pad.b} L ${x(0)} ${H - pad.b} Z`} fill={`url(#${id}-g${n})`} />}
              <path d={linea} fill="none" stroke={s.color} strokeWidth={s.punteada ? 1.6 : 2.4} strokeDasharray={s.punteada ? '5 6' : undefined} strokeLinecap="round" />
            </g>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(15,23,42,0.18)" />
            {series.map((s) => (
              <circle key={s.nombre} cx={x(hover)} cy={y(s.valores[hover]!)} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.4} />
            ))}
          </g>
        )}
        {etiquetas.map((e, i) =>
          (i % Math.ceil(etiquetas.length / 8) === 0 && etiquetas.length - 1 - i >= Math.ceil(etiquetas.length / 8) / 2) || i === etiquetas.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#8590a6">
              {e}
            </text>
          ) : null
        )}
        {etiquetas.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W / etiquetas.length) / 2}
            y={0}
            width={W / etiquetas.length}
            height={H}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-[var(--borde-fuerte)] bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="mb-1 text-[var(--ter)]">{etiquetas[hover]}</p>
          {series.map((s) => (
            <p key={s.nombre} className="flex items-center gap-2 pt-num">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[var(--sec)]">{s.nombre}</span>
              <span className="ml-auto pl-3 font-medium">{formato(s.valores[hover]!)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** Mini línea de tendencia para KPIs. */
export function Sparkline({ valores, color = '#3b9bff' }: { valores: number[]; color?: string }) {
  const id = useId().replace(/:/g, '')
  const W = 120
  const H = 36
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const pts = valores.map((v, i) => [(i * W) / (valores.length - 1), H - 3 - ((v - min) / (max - min || 1)) * (H - 6)] as [number, number])
  const d = camino(pts)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-28" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

/** Dona de proporciones con leyenda. */
export function Dona({
  partes,
  centro,
  bajada,
}: {
  partes: Array<{ nombre: string; valor: number; color: string }>
  centro: string
  bajada: string
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0)
  const R = 44
  const C = 2 * Math.PI * R
  let acum = 0
  return (
    <div className="flex items-center gap-6">
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
                strokeDasharray={`${Math.max(largo - 2, 0)} ${C}`}
                strokeDashoffset={-acum}
                strokeLinecap="butt"
              />
            )
            acum += largo
            return el
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="pt-display text-xl font-semibold pt-num">{centro}</p>
            <p className="text-[11px] text-[var(--ter)]">{bajada}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-2 text-sm min-w-0 flex-1">
        {partes.map((p) => (
          <li key={p.nombre} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-[4px] shrink-0" style={{ background: p.color }} />
            <span className="truncate text-[var(--sec)]">{p.nombre}</span>
            <span className="ml-auto pt-num font-medium">
              {(() => {
                const pc = (p.valor / total) * 100
                return pc > 0 && pc < 1 ? '< 1 %' : `${Math.round(pc)} %`
              })()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Barras verticales con la última resaltada y el valor al pasar el mouse. */
export function Barras({
  etiquetas,
  valores,
  formato = (n: number) => n.toLocaleString('es-AR'),
  alto = 220,
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
  const pad = { t: 26, b: 26 }
  const max = Math.max(...valores) * 1.1
  const paso = W / valores.length
  const ancho = paso * 0.56
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" onMouseLeave={() => setHover(null)} role="img" aria-label="Gráfico de barras">
      <defs>
        <linearGradient id={`b-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7cc4ff" />
          <stop offset="100%" stopColor="#cfe6ff" />
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
        const h = (v / max) * (H - pad.t - pad.b)
        const x = i * paso + (paso - ancho) / 2
        const y = H - pad.b - h
        const destacada = hover === i || (hover === null && i === valores.length - 1)
        return (
          <g key={i} onMouseEnter={() => setHover(i)}>
            <rect x={i * paso} y={0} width={paso} height={H} fill="transparent" />
            <rect
              x={x}
              y={y}
              width={ancho}
              height={h}
              rx="6"
              fill={`url(#${destacada ? 'bf' : 'b'}-${id})`}
              className="pt-barra-v"
              style={{ animationDelay: `${i * 50}ms` }}
            />
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
