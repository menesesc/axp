'use client'

import { cn } from '@/lib/utils'
import { Clock, Flame, Minus, Plus, Trash2, X } from 'lucide-react'
import type { OpcionElegida } from './opciones-producto'

/**
 * El consumo de la mesa.
 *
 * Lo que el mozo mira acá no es sólo qué pidieron: es qué está pasando con
 * cada plato. Cuándo entró a cocina, hace cuánto, si ya salió, si va con
 * marcha o a la parrilla. Esa es la conversación que tiene con la cocina
 * cuando el cliente pregunta cuánto falta.
 *
 * Se agrupa por comanda porque así salió: los principales en una, el postre
 * de media hora después en otra. Mezclarlos en una lista plana pierde
 * justamente el dato del tiempo.
 *
 * Lo que ya salió a cocina no se baja de un toque: hay que anularlo, que
 * pide llave y deja rastro. La mercadería ya se usó.
 */

export interface Linea {
  id: string
  productoId: string
  nombre: string
  cantidad: number
  precioUnitario: number
  alicuotaIva: number
  enviado: boolean
  nota: string | null
  opciones: OpcionElegida[]
  /** MS (marcha y sale) o PAR (parrilla). */
  marca: string | null
  comanda: number | null
  enviadoHora: string | null
  minutosCocina: number | null
  estadoKds: string | null
}

export const MARCAS = [
  { valor: 'MS', nombre: 'Marcha y sale' },
  { valor: 'PAR', nombre: 'A la parrilla' },
]

const ESTADO_KDS: Record<string, string> = {
  pendiente: 'sin enviar',
  enviado: 'en cocina',
  marchado: 'marchado',
  entregado: 'listo',
  despachado: 'servido',
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function Carrito({
  titulo,
  subtitulo,
  lineas,
  bloqueado,
  onCambiar,
  onMarca,
  onAnular,
  onCerrar,
  className,
  children,
}: {
  titulo: string
  subtitulo?: string | null
  lineas: Linea[]
  bloqueado?: boolean
  onCambiar: (id: string, delta: number) => void
  onMarca?: (id: string, marca: string | null) => void
  /** Sacar un plato que ya salió a cocina. Pide llave arriba. */
  onAnular?: (l: Linea) => void
  onCerrar: () => void
  className?: string
  children?: React.ReactNode
}) {
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)

  // Las comandas ya enviadas, en orden, y al final lo que todavía no salió.
  const comandas = [...new Set(lineas.filter((l) => l.enviado).map((l) => l.comanda ?? 0))].sort((a, b) => a - b)
  const nuevas = lineas.filter((l) => !l.enviado)

  // Lo que la cocina todavía no sirvió, y el plato que más espera.
  const enCocina = lineas.filter((l) => l.enviado && l.estadoKds !== 'despachado')
  const espera = Math.max(0, ...enCocina.map((l) => l.minutosCocina ?? 0))
  const demora = espera >= 15

  return (
    <aside className={cn('flex min-h-0 w-full flex-col bg-white lg:w-[25rem] lg:shrink-0 lg:border-l lg:border-slate-200', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight">{titulo}</p>
          {subtitulo && <p className="truncate text-xs text-slate-500">{subtitulo}</p>}
        </div>
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {comandas.length > 0 && (
        <div className={cn('flex items-center gap-3 border-b px-3 py-2 text-sm', demora ? 'border-red-100 bg-red-50 text-red-700' : 'border-slate-100 bg-slate-50 text-slate-600')}>
          <Clock className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {comandas.length} {comandas.length === 1 ? 'comanda' : 'comandas'}
            {enCocina.length > 0 ? (
              <>
                {' · '}
                <b>{enCocina.reduce((s, l) => s + l.cantidad, 0)}</b> en cocina, el que más espera hace <b>{espera}′</b>
              </>
            ) : (
              ' · todo servido'
            )}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lineas.length === 0 && (
          <p className="p-10 text-center text-slate-400">Tocá un producto para agregarlo</p>
        )}

        {comandas.map((c) => {
          const items = lineas.filter((l) => l.enviado && (l.comanda ?? 0) === c)
          const hora = items.find((i) => i.enviadoHora)?.enviadoHora
          const pendientes = items.filter((i) => i.estadoKds !== 'despachado')
          const min = Math.max(0, ...pendientes.map((i) => i.minutosCocina ?? 0))
          const servida = pendientes.length === 0
          return (
            <div key={c}>
              <p className="sticky top-0 z-10 flex items-center gap-2 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Comanda {c || 1}
                {hora && <span className="font-normal text-slate-400">{hora}</span>}
                <span
                  className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    servida ? 'bg-emerald-100 text-emerald-700' : min >= 15 ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'
                  )}
                >
                  {servida ? 'Servida' : `En cocina · ${min}′`}
                </span>
              </p>
              <ul className="divide-y divide-slate-100">
                {items.map((l) => (
                  <Fila key={l.id} l={l} bloqueado={bloqueado} onCambiar={onCambiar} onMarca={onMarca} onAnular={onAnular} />
                ))}
              </ul>
            </div>
          )
        })}

        {nuevas.length > 0 && (
          <div>
            <p className="sticky top-0 z-10 flex items-center bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              Sin comandar
              <span className="ml-auto rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px]">{nuevas.reduce((s, l) => s + l.cantidad, 0)} por enviar</span>
            </p>
            <ul className="divide-y divide-slate-100">
              {nuevas.map((l) => (
                <Fila key={l.id} l={l} bloqueado={bloqueado} onCambiar={onCambiar} onMarca={onMarca} onAnular={onAnular} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={cn('border-t border-slate-200 p-3', bloqueado && 'bg-amber-50')}>
        {bloqueado && (
          <p className="mb-2 text-center text-sm font-medium text-amber-800">
            Precuenta impresa: la mesa no admite más cargas
          </p>
        )}
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-slate-500">Total</span>
          <span className="text-3xl font-bold tabular-nums [font-family:var(--font-display),system-ui]">{pesos(total)}</span>
        </div>
        {children}
      </div>
    </aside>
  )
}

function Fila({
  l,
  bloqueado,
  onCambiar,
  onMarca,
  onAnular,
}: {
  l: Linea
  bloqueado: boolean | undefined
  onCambiar: (id: string, delta: number) => void
  onMarca: ((id: string, marca: string | null) => void) | undefined
  onAnular: ((l: Linea) => void) | undefined
}) {
  const demorado = !!l.minutosCocina && l.minutosCocina >= 15 && l.estadoKds !== 'despachado'
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{l.nombre}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-400">
            <span>{pesos(l.precioUnitario)}</span>
            {l.marca && (
              <span className="rounded bg-orange-100 px-1 text-[11px] font-bold text-orange-700">{l.marca}</span>
            )}
            {l.enviado && (
              <span className={cn('flex items-center gap-1 text-xs', demorado ? 'font-semibold text-red-600' : 'text-emerald-600')}>
                <Clock className="h-3 w-3" />
                {ESTADO_KDS[l.estadoKds ?? 'enviado'] ?? 'en cocina'}
                {l.minutosCocina != null && ` · ${l.minutosCocina}′`}
              </span>
            )}
          </p>
        </div>

        {l.enviado ? (
          <button
            onClick={() => onAnular?.(l)}
            disabled={!onAnular}
            className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500 disabled:opacity-30"
            aria-label="Anular, pide autorización"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => onCambiar(l.id, -1)}
            disabled={bloqueado}
            className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 disabled:opacity-30"
            aria-label="Quitar uno"
          >
            {l.cantidad === 1 ? <Trash2 className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
          </button>
        )}
        <span className="w-7 text-center text-lg font-bold tabular-nums">{l.cantidad}</span>
        <button
          onClick={() => onCambiar(l.id, 1)}
          disabled={bloqueado || l.enviado}
          className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 disabled:opacity-30"
          aria-label="Agregar uno"
        >
          <Plus className="h-5 w-5" />
        </button>
        <span className="w-20 text-right text-base font-semibold tabular-nums">
          {pesos(l.cantidad * l.precioUnitario)}
        </span>
      </div>

      {(l.opciones.length > 0 || l.nota) && (
        <p className="mt-0.5 pr-24 text-xs leading-tight text-slate-500">
          {l.opciones.map((o) => o.nombre).join(' · ')}
          {l.opciones.length > 0 && l.nota ? ' — ' : ''}
          {l.nota && <span className="italic">{l.nota}</span>}
        </p>
      )}

      {/* Las marcas se ponen antes de comandar: después ya viajaron. */}
      {!l.enviado && onMarca && !bloqueado && (
        <div className="mt-1 flex gap-1">
          {MARCAS.map((m) => (
            <button
              key={m.valor}
              onClick={() => onMarca(l.id, l.marca === m.valor ? null : m.valor)}
              title={m.nombre}
              className={cn(
                'flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-bold',
                l.marca === m.valor ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'
              )}
            >
              {m.valor === 'PAR' && <Flame className="h-3 w-3" />}
              {m.valor}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
