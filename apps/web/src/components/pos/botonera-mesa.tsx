'use client'

import { cn } from '@/lib/utils'
import { ChefHat, Percent, Printer, Split, Wallet, X } from 'lucide-react'

/**
 * La botonera de la mesa, de íconos.
 *
 * Es la forma en que se trabaja en una caja: la mano va siempre al mismo
 * lugar y no se lee nada. Por eso son íconos del mismo tamaño en una fila
 * fija, y no botones de texto que cambian de ancho según lo que digan.
 *
 * Salir es la última, al lado de dividir, y manda a cocina lo que falte: en
 * el salón uno se va de la mesa, no "confirma el pedido".
 *
 * Lo que todavía no existe se muestra apagado en vez de esconderse: que el
 * lugar esté reservado ayuda a aprender la pantalla, y esconder y aparecer
 * botones es peor que tenerlos en gris.
 */

export interface AccionMesa {
  icono: typeof ChefHat
  nombre: string
  onClick?: (() => void) | undefined
  badge?: number | undefined
  destacado?: boolean | undefined
  deshabilitado?: boolean | undefined
  proximamente?: boolean | undefined
}

export function BotoneraMesa({ acciones }: { acciones: AccionMesa[] }) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {acciones.map((a) => {
        const off = a.deshabilitado || a.proximamente || !a.onClick
        return (
          <button
            key={a.nombre}
            onClick={a.onClick}
            disabled={off}
            title={a.proximamente ? `${a.nombre} — llega con el cobro` : a.nombre}
            className={cn(
              'relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-transform active:scale-95',
              off
                ? 'bg-slate-50 text-slate-300'
                : a.destacado
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700'
            )}
          >
            <a.icono className="h-5 w-5" />
            {a.nombre}
            {!!a.badge && a.badge > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#1f7fe6] px-1 text-[10px] font-bold text-white">
                {a.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Las acciones de una mesa en el salón, en el orden en que se usan. */
export function accionesMesa(o: {
  sinEnviar: number
  vacio?: boolean
  bloqueado?: boolean
  onComandar?: () => void
  onCuenta?: () => void
  onCobrar?: (() => void) | undefined
  onDescuento?: (() => void) | undefined
  onSalir?: () => void
}): AccionMesa[] {
  return [
    {
      icono: ChefHat,
      nombre: 'Comandar',
      onClick: o.onComandar,
      badge: o.sinEnviar,
      destacado: o.sinEnviar > 0,
      deshabilitado: o.sinEnviar === 0,
    },
    { icono: Printer, nombre: 'Cuenta', onClick: o.onCuenta, deshabilitado: o.vacio || o.bloqueado },
    { icono: Wallet, nombre: 'Cobrar', onClick: o.onCobrar, deshabilitado: o.vacio, proximamente: !o.onCobrar },
    { icono: Percent, nombre: 'Descuento', onClick: o.onDescuento, deshabilitado: o.vacio, proximamente: !o.onDescuento },
    { icono: Split, nombre: 'Dividir', proximamente: true },
    { icono: X, nombre: 'Salir', onClick: o.onSalir },
  ]
}
