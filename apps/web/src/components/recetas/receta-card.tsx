'use client'

import Link from 'next/link'
import { Clock, Heart, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMin, fmtPesos, fotoUrl, type RecetaListada } from './tipos'

/**
 * Tarjeta del mosaico: la foto manda y el título va encima, con un degradé al
 * pie para que se lea sobre cualquier imagen.
 */
export function RecetaCard({
  receta,
  alto = 'aspect-[4/3]',
  onFavorita,
}: {
  receta: RecetaListada
  alto?: string
  onFavorita?: (id: string) => void
}) {
  const url = fotoUrl(receta.fotoKey)
  return (
    <div className={cn('group relative overflow-hidden rounded-xl bg-slate-200', alto)}>
      <Link href={`/recetas/${receta.id}`} className="absolute inset-0">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full items-center justify-center bg-gradient-to-br from-slate-300 to-slate-400 text-5xl font-bold text-white/30">
            {receta.titulo[0]}
          </span>
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

        <span className="absolute inset-x-0 bottom-0 p-3">
          {receta.categoria && (
            <span className="block text-[10px] font-bold uppercase tracking-wider text-white/75">
              {receta.categoria.nombre}
            </span>
          )}
          <span className="mt-0.5 block text-[15px] font-bold leading-tight text-white drop-shadow">
            {receta.titulo}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-white/85">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtMin(receta.totalMin)}
            </span>
            {receta.costoPorcion !== null && (
              <span title={receta.costoParcial ? 'Faltan ingredientes por costear' : undefined}>
                {fmtPesos(receta.costoPorcion)}/porción{receta.costoParcial && ' *'}
              </span>
            )}
          </span>
        </span>
      </Link>

      <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {receta.estado === 'borrador' && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950">
              Borrador
            </span>
          )}
          {receta.youtubeUrl && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              <Play className="h-3 w-3" />
              Video
            </span>
          )}
        </div>
        {onFavorita && (
          <button
            type="button"
            onClick={() => onFavorita(receta.id)}
            aria-label={receta.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}
            className="pointer-events-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/90 backdrop-blur transition hover:bg-white"
          >
            <Heart className={cn('h-4 w-4', receta.favorita ? 'fill-rose-500 text-rose-500' : 'text-slate-600')} />
          </button>
        )}
      </div>
    </div>
  )
}
