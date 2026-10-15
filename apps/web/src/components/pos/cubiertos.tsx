'use client'

import { Users } from 'lucide-react'

/**
 * Los cubiertos de la mesa, que es lo primero que se carga al sentar gente.
 *
 * De ahí sale el promedio por cubierto, que es el número con el que se mira
 * el negocio: sin eso, una mesa de dos y una de ocho se parecen.
 */
export function Cubiertos({
  mesa,
  onElegir,
  onCancelar,
}: {
  mesa: string
  onElegir: (n: number) => void
  onCancelar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-bold">
          <Users className="h-5 w-5 text-slate-400" /> Mesa {mesa}
        </p>
        <p className="mt-1 text-sm text-slate-500">¿Cuántos cubiertos?</p>
        <div className="mt-5 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
            <button
              key={n}
              onClick={() => onElegir(n)}
              className="h-16 rounded-xl bg-slate-100 text-2xl font-bold active:scale-95"
            >
              {n}
            </button>
          ))}
        </div>
        <button onClick={onCancelar} className="mt-5 h-12 w-full rounded-xl text-slate-500">
          Cancelar
        </button>
      </div>
    </div>
  )
}
