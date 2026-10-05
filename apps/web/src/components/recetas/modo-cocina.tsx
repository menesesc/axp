'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronLeft, X } from 'lucide-react'
import type { PasoReceta, IngredienteReceta } from './tipos'

/**
 * Modo cocina: un paso por pantalla, tipografía grande y los ingredientes a un
 * toque. Pensado para leerlo a un metro, con el celular o la tablet apoyados y
 * las manos ocupadas.
 *
 * Mientras está abierto pide no apagar la pantalla (Wake Lock, donde exista) y
 * bloquea el scroll del fondo.
 */
export function ModoCocina({
  titulo,
  pasos,
  ingredientes,
  porciones,
  factor,
  onCerrar,
}: {
  titulo: string
  pasos: PasoReceta[]
  ingredientes: IngredienteReceta[]
  porciones: number
  factor: number
  onCerrar: () => void
}) {
  const [i, setI] = useState(0)
  const [verIngredientes, setVerIngredientes] = useState(false)
  const total = pasos.length

  useEffect(() => {
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // No todos los navegadores lo tienen, y en los que sí puede fallar si la
    // pestaña no está visible. Si no se consigue, no pasa nada.
    let lock: { release: () => Promise<void> } | null = null
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof lock> } }).wakeLock
    wl?.request('screen').then((l) => { lock = l }).catch(() => {})

    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, total - 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', teclas)
    return () => {
      document.body.style.overflow = previo
      window.removeEventListener('keydown', teclas)
      lock?.release().catch(() => {})
    }
  }, [onCerrar, total])

  if (total === 0) return null
  const paso = pasos[Math.min(i, total - 1)]!
  const cant = (n: number | null) => {
    if (n == null) return ''
    const v = n * factor
    return Number.isInteger(v) ? String(v) : String(+v.toFixed(2)).replace('.', ',')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onCerrar}
          aria-label="Salir del modo cocina"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-white/50">
            Paso {i + 1} de {total}
            {paso.seccion ? ` · ${paso.seccion}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs">{porciones} porciones</span>
      </div>
      <div className="h-1 bg-white/10">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-2xl">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-xl font-bold">
            {i + 1}
          </span>
          <p className="mt-5 text-2xl leading-relaxed sm:text-[28px]">{paso.texto}</p>

          <div className="mt-8 rounded-xl bg-white/5">
            <button
              onClick={() => setVerIngredientes((v) => !v)}
              className="flex w-full items-center justify-between p-4 text-sm font-semibold text-white/70"
            >
              Ver ingredientes
              <ChevronLeft className={`h-4 w-4 transition-transform ${verIngredientes ? '-rotate-90' : 'rotate-180'}`} />
            </button>
            {verIngredientes && (
              <ul className="space-y-1.5 px-4 pb-4 text-sm text-white/80">
                {ingredientes.map((ing, k) => (
                  <li key={ing.id ?? k}>
                    <b className="tabular-nums">
                      {cant(ing.cantidad)} {ing.unidad}
                    </b>{' '}
                    de {ing.nombre}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 p-4">
        <button
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
          className="rounded-xl bg-white/10 px-5 py-3 font-semibold transition hover:bg-white/20 disabled:opacity-30"
        >
          Anterior
        </button>
        <button
          onClick={() => (i === total - 1 ? onCerrar() : setI((v) => v + 1))}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold transition hover:bg-emerald-600"
        >
          {i === total - 1 ? (
            <>
              <Check className="h-5 w-5" />
              Terminar
            </>
          ) : (
            'Siguiente'
          )}
        </button>
      </div>
    </div>
  )
}
