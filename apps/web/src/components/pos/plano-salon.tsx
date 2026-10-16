'use client'

import { cn } from '@/lib/utils'
import type { MesaEstado } from './mapa-mesas'

/**
 * El plano del salón dibujado, no una grilla de cuadraditos.
 *
 * Un salón de verdad tiene mesas de cuatro y de seis, redondas y
 * rectangulares, giradas contra la pared, y además la barra, el baño y la
 * entrada. Eso es lo que hace que el mozo encuentre la mesa 14 sin pensarlo,
 * y por eso el mismo dibujo se usa en la pantalla del cajero y en la del
 * diseñador: si no son idénticos, lo que se diseña no es lo que se ve.
 *
 * Va en SVG sobre un lienzo lógico de 1000 x 700. Las coordenadas no son
 * píxeles de pantalla: el plano tiene que verse igual en la tablet del mozo
 * y en el monitor de la caja.
 */

export const LIENZO = { ancho: 1000, alto: 700 }

export interface ElementoPlano {
  id: string
  sectorId: string | null
  tipo: string
  etiqueta: string | null
  x: number
  y: number
  ancho: number
  alto: number
  rotacion: number
  color: string | null
}

type Estado = MesaEstado['estado']

const COLOR: Record<Estado, { relleno: string; borde: string; texto: string }> = {
  libre: { relleno: '#ffffff', borde: '#cbd5e1', texto: '#64748b' },
  ocupada: { relleno: '#e0f2fe', borde: '#38bdf8', texto: '#075985' },
  postre: { relleno: '#f3e8ff', borde: '#a855f7', texto: '#6b21a8' },
  cuenta: { relleno: '#fef3c7', borde: '#f59e0b', texto: '#92400e' },
  facturada: { relleno: '#d1fae5', borde: '#10b981', texto: '#065f46' },
}

/** Lo que no es mesa. Formas simples: el plano se lee de lejos. */
const ELEMENTO: Record<string, { nombre: string; relleno: string; borde: string; icono?: string }> = {
  entrada: { nombre: 'Entrada', relleno: '#e2e8f0', borde: '#94a3b8', icono: '🚪' },
  puerta: { nombre: 'Puerta', relleno: '#e2e8f0', borde: '#94a3b8', icono: '🚪' },
  barra: { nombre: 'Barra', relleno: '#334155', borde: '#1e293b' },
  bano: { nombre: 'Baños', relleno: '#e2e8f0', borde: '#94a3b8', icono: '🚻' },
  cocina: { nombre: 'Cocina', relleno: '#fee2e2', borde: '#f87171', icono: '🍳' },
  caja: { nombre: 'Caja', relleno: '#dbeafe', borde: '#60a5fa', icono: '💳' },
  escalera: { nombre: 'Escalera', relleno: '#e2e8f0', borde: '#94a3b8', icono: '🪜' },
  pared: { nombre: 'Pared', relleno: '#94a3b8', borde: '#64748b' },
  columna: { nombre: 'Columna', relleno: '#cbd5e1', borde: '#94a3b8' },
  planta: { nombre: 'Planta', relleno: '#dcfce7', borde: '#4ade80', icono: '🪴' },
  arbol: { nombre: 'Árbol', relleno: '#dcfce7', borde: '#22c55e', icono: '🌳' },
  texto: { nombre: 'Texto', relleno: 'transparent', borde: 'transparent' },
}

export const TIPOS_ELEMENTO = Object.entries(ELEMENTO)
  .filter(([t]) => t !== 'texto')
  .map(([tipo, d]) => ({ tipo, nombre: d.nombre, icono: d.icono ?? '▭' }))

/**
 * Dónde se sientan.
 *
 * Las sillas no son decoración: una mesa de seis con dos cabeceras no se
 * ocupa igual que una de seis a lo largo, y el mozo lo mira para saber si la
 * mesa que tiene libre le sirve al grupo que está en la puerta.
 */
function sillas(m: { capacidad: number; forma: string; ancho: number; alto: number; cabeceras: number }) {
  const out: Array<{ x: number; y: number; w: number; h: number }> = []
  const s = 12
  const sep = 4

  if (m.forma === 'redonda') {
    const n = Math.max(1, m.capacidad)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      const rx = m.ancho / 2 + sep + s / 2
      const ry = m.alto / 2 + sep + s / 2
      out.push({ x: Math.cos(a) * rx - s / 2, y: Math.sin(a) * ry - s / 2, w: s, h: s })
    }
    return out
  }

  const cab = Math.min(m.cabeceras, m.capacidad)
  const lados = Math.max(0, m.capacidad - cab)
  const arriba = Math.ceil(lados / 2)
  const abajo = lados - arriba

  const fila = (cuantas: number, y: number) => {
    for (let i = 0; i < cuantas; i++) {
      const paso = m.ancho / (cuantas + 1)
      out.push({ x: -m.ancho / 2 + paso * (i + 1) - s / 2, y, w: s, h: s })
    }
  }
  fila(arriba, -m.alto / 2 - sep - s)
  fila(abajo, m.alto / 2 + sep)

  for (let i = 0; i < cab; i++) {
    const x = i === 0 ? -m.ancho / 2 - sep - s : m.ancho / 2 + sep
    out.push({ x, y: -s / 2, w: s, h: s })
  }
  return out
}

export function PlanoSalon({
  mesas,
  elementos,
  seleccion,
  edicion,
  onTocarMesa,
  onTocarElemento,
  onFondo,
  onArrastrar,
}: {
  mesas: MesaEstado[]
  elementos: ElementoPlano[]
  /** Id de la pieza seleccionada, sólo en el diseñador. */
  seleccion?: string | null
  edicion?: boolean
  onTocarMesa?: (m: MesaEstado) => void
  onTocarElemento?: (e: ElementoPlano) => void
  onFondo?: () => void
  /** Arranca el arrastre de una pieza. Sólo en el diseñador. */
  onArrastrar?: (id: string, tipo: 'mesa' | 'elemento', ev: React.PointerEvent<SVGGElement>) => void
}) {
  return (
    <svg
      viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('h-full w-full touch-none select-none', edicion && 'cursor-default')}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onFondo?.()
      }}
    >
      {edicion && (
        <>
          <defs>
            <pattern id="grilla" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e2e8f0" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={LIENZO.ancho} height={LIENZO.alto} fill="url(#grilla)" />
        </>
      )}

      {/* Primero lo fijo, que es el fondo del salón. */}
      {elementos.map((e) => {
        const d = ELEMENTO[e.tipo] ?? ELEMENTO.texto!
        const sel = seleccion === e.id
        return (
          <g
            key={e.id}
            transform={`translate(${e.x} ${e.y}) rotate(${e.rotacion})`}
            onPointerDown={(ev) => onArrastrar?.(e.id, 'elemento', ev)}
            onClick={() => onTocarElemento?.(e)}
            className={edicion ? 'cursor-move' : undefined}
          >
            {e.tipo === 'columna' ? (
              <ellipse rx={e.ancho / 2} ry={e.alto / 2} fill={e.color ?? d.relleno} stroke={d.borde} strokeWidth={2} />
            ) : e.tipo !== 'texto' ? (
              <rect
                x={-e.ancho / 2}
                y={-e.alto / 2}
                width={e.ancho}
                height={e.alto}
                rx={e.tipo === 'pared' ? 2 : 8}
                fill={e.color ?? d.relleno}
                stroke={d.borde}
                strokeWidth={2}
              />
            ) : null}
            {d.icono && e.alto >= 34 && (
              <text y={-4} textAnchor="middle" fontSize={20}>
                {d.icono}
              </text>
            )}
            {(e.etiqueta || (e.tipo !== 'pared' && e.tipo !== 'columna')) && (
              <text
                y={d.icono && e.alto >= 34 ? 16 : 5}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill={e.tipo === 'barra' ? '#f8fafc' : '#475569'}
              >
                {e.etiqueta || d.nombre}
              </text>
            )}
            {sel && (
              <rect
                x={-e.ancho / 2 - 6}
                y={-e.alto / 2 - 6}
                width={e.ancho + 12}
                height={e.alto + 12}
                rx={10}
                fill="none"
                stroke="#0f172a"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}
          </g>
        )
      })}

      {mesas.map((m) => {
        const c = COLOR[m.estado]
        const sel = seleccion === m.id
        const demorada = (m.minutosCocina ?? 0) >= 15
        const geo = { capacidad: m.capacidad, forma: m.forma, ancho: m.ancho, alto: m.alto, cabeceras: m.cabeceras }
        return (
          <g
            key={m.id}
            transform={`translate(${m.x ?? 0} ${m.y ?? 0}) rotate(${m.rotacion})`}
            onPointerDown={(ev) => onArrastrar?.(m.id, 'mesa', ev)}
            onClick={() => onTocarMesa?.(m)}
            className={edicion ? 'cursor-move' : 'cursor-pointer'}
          >
            {sillas(geo).map((s, i) => (
              <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill="#cbd5e1" />
            ))}

            {m.forma === 'redonda' ? (
              <ellipse rx={m.ancho / 2} ry={m.alto / 2} fill={c.relleno} stroke={c.borde} strokeWidth={3} />
            ) : (
              <rect
                x={-m.ancho / 2}
                y={-m.alto / 2}
                width={m.ancho}
                height={m.alto}
                rx={8}
                fill={c.relleno}
                stroke={c.borde}
                strokeWidth={3}
              />
            )}

            {/* El número se deja derecho aunque la mesa esté girada: girado no
                se lee, y es lo único que hay que leer rápido. */}
            <g transform={`rotate(${-m.rotacion})`}>
              <text textAnchor="middle" y={m.estado === 'libre' ? 7 : 0} fontSize={22} fontWeight={700} fill={c.texto}>
                {m.nombre}
              </text>
              {m.estado !== 'libre' && (
                <text textAnchor="middle" y={17} fontSize={11} fontWeight={600} fill={demorada ? '#dc2626' : c.texto}>
                  {m.comensales ?? 0} cub{m.minutos != null ? ` · ${m.minutos}′` : ''}
                </text>
              )}
              {m.enCocina > 0 && (
                <circle cx={m.ancho / 2 - 8} cy={-m.alto / 2 + 8} r={7} fill={demorada ? '#dc2626' : '#0ea5e9'} />
              )}
              {m.enCocina > 0 && (
                <text x={m.ancho / 2 - 8} y={-m.alto / 2 + 12} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                  {m.enCocina}
                </text>
              )}
            </g>

            {sel && (
              <rect
                x={-m.ancho / 2 - 8}
                y={-m.alto / 2 - 8}
                width={m.ancho + 16}
                height={m.alto + 16}
                rx={12}
                fill="none"
                stroke="#0f172a"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
