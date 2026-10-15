'use client'

import { cn } from '@/lib/utils'
import { Minus, Plus, Trash2, X } from 'lucide-react'
import type { OpcionElegida } from './opciones-producto'

/**
 * El consumo de la mesa o del mostrador.
 *
 * Los + y − son dos botones grandes y separados, no una rueda ni un campo de
 * texto: subir de 2 a 3 es lo que más se hace en toda la pantalla.
 *
 * Lo que ya salió a cocina se ve distinto y no se puede bajar desde acá. Para
 * sacar un plato que la cocina ya tiene hay que anularlo, que deja rastro y
 * pide permiso; que un mozo lo borre con un toque es justo lo que no se
 * quiere.
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
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export function Carrito({
  titulo,
  subtitulo,
  lineas,
  bloqueado,
  onCambiar,
  onCerrar,
  children,
}: {
  titulo: string
  subtitulo?: string | null
  lineas: Linea[]
  bloqueado?: boolean
  onCambiar: (id: string, delta: number) => void
  onCerrar: () => void
  children?: React.ReactNode
}) {
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)

  return (
    <aside className="flex max-h-[48dvh] w-full shrink-0 flex-col border-t border-slate-200 bg-white lg:max-h-none lg:w-[24rem] lg:border-l lg:border-t-0">
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

      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {lineas.length === 0 && (
          <li className="p-10 text-center text-slate-400">Tocá un producto para agregarlo</li>
        )}
        {lineas.map((l) => (
          <li key={l.id} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium">{l.nombre}</p>
                <p className="text-sm text-slate-400">
                  {pesos(l.precioUnitario)}
                  {l.enviado && <span className="ml-2 text-emerald-600">en cocina</span>}
                </p>
              </div>
              <button
                onClick={() => onCambiar(l.id, -1)}
                disabled={l.enviado || bloqueado}
                className="grid h-12 w-12 place-items-center rounded-lg bg-slate-100 disabled:opacity-30"
                aria-label="Quitar uno"
              >
                {l.cantidad === 1 ? <Trash2 className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
              </button>
              <span className="w-7 text-center text-lg font-bold tabular-nums">{l.cantidad}</span>
              <button
                onClick={() => onCambiar(l.id, 1)}
                disabled={bloqueado}
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
          </li>
        ))}
      </ul>

      <div className={cn('border-t border-slate-200 p-3', bloqueado && 'bg-amber-50')}>
        {bloqueado && (
          <p className="mb-2 text-center text-sm font-medium text-amber-800">
            Precuenta impresa: la mesa no admite más cargas
          </p>
        )}
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-slate-500">Total</span>
          <span className="text-3xl font-bold tabular-nums">{pesos(total)}</span>
        </div>
        {children}
      </div>
    </aside>
  )
}
