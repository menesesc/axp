'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SelectorPeriodo, type AtajoPeriodo, type Periodo } from '@/components/ui/periodo'
import { cn } from '@/lib/utils'

/**
 * Barra de filtros común a todos los listados. Siempre en el mismo lugar
 * (debajo del título y del submenú) y en el mismo orden:
 *
 *   período · búsqueda · estado · más filtros · limpiar        [acciones]
 *
 * Cada pantalla pasa solo las piezas que usa.
 */
export function BarraFiltros({
  periodo,
  busqueda,
  buscador,
  estados,
  masFiltros,
  activos = 0,
  onLimpiar,
  acciones,
  className,
}: {
  periodo?: { valor: Periodo; onCambiar: (p: Periodo) => void; atajos?: AtajoPeriodo[] } | undefined
  busqueda?: { valor: string; onCambiar: (v: string) => void; placeholder: string } | undefined
  /** Buscador propio de la pantalla (p. ej. búsqueda por varias palabras), en lugar de `busqueda`. */
  buscador?: React.ReactNode
  /** Estados excluyentes (Todas / Borrador / Emitidas…), como control segmentado. */
  estados?: { opciones: Array<{ valor: string; texto: string; n?: number | undefined }>; valor: string; onCambiar: (v: string) => void } | undefined
  /** Contenido del panel "Más filtros" (selects, casillas). */
  masFiltros?: React.ReactNode
  /** Cantidad de filtros activos, para el contador y el botón Limpiar. */
  activos?: number
  onLimpiar?: (() => void) | undefined
  /** Acciones de la lista (exportar, seleccionar…), a la derecha. */
  acciones?: React.ReactNode
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className={cn('mb-5 flex flex-wrap items-center gap-2.5', className)} role="search" aria-label="Filtros">
      {periodo && <SelectorPeriodo valor={periodo.valor} onCambiar={periodo.onCambiar} {...(periodo.atajos ? { atajos: periodo.atajos } : {})} />}

      {busqueda && (
        <label className="relative flex h-10 min-w-[14rem] flex-1 items-center sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={busqueda.valor}
            onChange={(e) => busqueda.onCambiar(e.target.value)}
            placeholder={busqueda.placeholder}
            aria-label={busqueda.placeholder}
            className="h-10 w-full rounded-xl border border-slate-900/[0.12] bg-white pl-9 pr-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[#3b9bff] focus:ring-4 focus:ring-[#3b9bff]/15"
          />
        </label>
      )}

      {buscador}

      {estados && (
        <div className="ax-tabs" role="radiogroup" aria-label="Estado">
          {estados.opciones.map((o) => {
            const activo = estados.valor === o.valor
            return (
              <button key={o.valor} type="button" role="radio" aria-checked={activo} data-activo={activo ? '1' : '0'} className="ax-tab" onClick={() => estados.onCambiar(o.valor)}>
                {o.texto}
                {o.n !== undefined && <span className="ml-1.5 text-xs text-[var(--ter)]">{o.n}</span>}
              </button>
            )
          })}
        </div>
      )}

      {masFiltros && (
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900/[0.12] bg-white px-3.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-4 w-4 text-[#3b9bff]" />
              Más filtros
              {activos > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#3b9bff] px-1.5 text-[11px] font-semibold text-white">{activos}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-4">
            <p className="text-sm font-semibold">Más filtros</p>
            {masFiltros}
          </PopoverContent>
        </Popover>
      )}

      {onLimpiar && activos > 0 && (
        <button type="button" onClick={onLimpiar} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-slate-500 transition-colors hover:bg-slate-900/[0.05] hover:text-slate-900">
          <X className="h-4 w-4" /> Limpiar
        </button>
      )}

      {acciones && <div className="ml-auto flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}

/** Campo con etiqueta dentro de "Más filtros". */
export function CampoFiltro({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">{etiqueta}</p>
      {children}
    </div>
  )
}
