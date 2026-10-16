'use client'

import { useState } from 'react'
import { Delete, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Los cubiertos de la mesa, que es lo primero que se carga al sentar gente.
 *
 * De ahí sale el promedio por cubierto, que es el número con el que se mira
 * el negocio: sin eso, una mesa de dos y una de ocho se parecen.
 *
 * Los botones cubren lo que pasa casi siempre. El último lugar no es un
 * número más: es el campo donde se escribe la mesa larga de veintidós, y el
 * teclado aparece recién cuando se toca, para no robarle lugar a lo que se
 * usa siempre.
 */
export function Cubiertos({
  mesa,
  sugerido,
  onElegir,
  onCancelar,
}: {
  mesa: string
  /** La capacidad de la mesa: arranca marcada, es lo más probable. */
  sugerido?: number
  onElegir: (n: number) => void
  onCancelar: () => void
}) {
  const [manual, setManual] = useState('')
  const [tecleando, setTecleando] = useState(false)

  const escribir = (d: string) => setManual((v) => (v + d).replace(/^0+/, '').slice(0, 3))
  const n = Number(manual)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-center">
        <p className="flex items-center justify-center gap-2 text-xl font-bold">
          <Users className="h-5 w-5 text-slate-400" /> Mesa {mesa}
        </p>
        <p className="mt-1 text-sm text-slate-500">¿Cuántos cubiertos?</p>

        <div className="mt-5 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 10].map((x) => (
            <button
              key={x}
              onClick={() => onElegir(x)}
              className={cn(
                'h-16 rounded-xl text-2xl font-bold active:scale-95',
                x === sugerido ? 'bg-slate-900 text-white' : 'bg-slate-100'
              )}
            >
              {x}
            </button>
          ))}

          {/* El décimo lugar es para escribir. Con el cursor titilando se
              entiende sin leer ninguna etiqueta. */}
          <button
            onClick={() => setTecleando(true)}
            className={cn(
              'h-16 rounded-xl border-2 text-2xl font-bold tabular-nums',
              tecleando ? 'border-slate-900 bg-white' : 'border-dashed border-slate-300 bg-white text-slate-400'
            )}
          >
            {manual || <span className="animate-pulse">_</span>}
          </button>
        </div>

        {tecleando && (
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <div className="flex items-start gap-3">
              <div className="grid flex-1 grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    onClick={() => escribir(d)}
                    className="h-14 rounded-lg bg-slate-100 text-xl font-bold active:scale-95"
                  >
                    {d}
                  </button>
                ))}
                <span />
                <button onClick={() => escribir('0')} className="h-14 rounded-lg bg-slate-100 text-xl font-bold active:scale-95">
                  0
                </button>
                <button
                  onClick={() => setManual((v) => v.slice(0, -1))}
                  aria-label="Borrar"
                  className="grid h-14 place-items-center rounded-lg bg-slate-100 active:scale-95"
                >
                  <Delete className="h-5 w-5 text-slate-500" />
                </button>
              </div>
              <button
                onClick={() => onElegir(n)}
                disabled={!(n > 0)}
                className="h-[11.5rem] w-24 shrink-0 rounded-lg bg-slate-900 text-base font-semibold text-white disabled:opacity-30 active:scale-95"
              >
                Abrir
              </button>
            </div>
          </div>
        )}

        <button onClick={onCancelar} className="mt-4 h-12 w-full rounded-xl text-slate-500">
          Cancelar
        </button>
      </div>
    </div>
  )
}
