'use client'

import { useState } from 'react'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { hoyAR, inicioDeMesAR, mesAnteriorAR, sumarDias } from '@/lib/fechas'
import { cn } from '@/lib/utils'

export type ClavePeriodo = 'mes' | 'mesAnterior' | 'ultimos30' | 'trimestre' | 'anio' | 'personalizado'

export interface Periodo {
  clave: ClavePeriodo
  /** YYYY-MM-DD, fecha argentina. */
  desde: string
  hasta: string
  /** Texto corto para títulos: "Este mes", "Septiembre", "Del 1/9 al 15/9". */
  etiqueta: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const corta = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

/** Calcula el rango de un atajo en hora argentina (no UTC). */
export function periodoDe(clave: Exclude<ClavePeriodo, 'personalizado'>, hoy: string = hoyAR()): Periodo {
  const [a, m] = hoy.split('-').map(Number) as [number, number]
  switch (clave) {
    case 'mes':
      return { clave, desde: inicioDeMesAR(hoy), hasta: hoy, etiqueta: 'Este mes' }
    case 'mesAnterior': {
      const r = mesAnteriorAR(hoy)
      const mesNombre = MESES[Number(r.from.split('-')[1]) - 1]!
      return { clave, desde: r.from, hasta: r.to, etiqueta: mesNombre[0]!.toUpperCase() + mesNombre.slice(1) }
    }
    case 'ultimos30':
      return { clave, desde: sumarDias(hoy, -29), hasta: hoy, etiqueta: 'Últimos 30 días' }
    case 'trimestre': {
      const mi = Math.floor((m - 1) / 3) * 3 + 1
      return { clave, desde: `${a}-${String(mi).padStart(2, '0')}-01`, hasta: hoy, etiqueta: 'Este trimestre' }
    }
    case 'anio':
      return { clave, desde: `${a}-01-01`, hasta: hoy, etiqueta: `Año ${a}` }
  }
}

export function periodoPersonalizado(desde: string, hasta: string): Periodo {
  return { clave: 'personalizado', desde, hasta, etiqueta: `Del ${corta(desde)} al ${corta(hasta)}` }
}

const ATAJOS: Array<{ clave: Exclude<ClavePeriodo, 'personalizado'>; texto: string }> = [
  { clave: 'mes', texto: 'Este mes' },
  { clave: 'mesAnterior', texto: 'Mes anterior' },
  { clave: 'ultimos30', texto: 'Últimos 30 días' },
  { clave: 'trimestre', texto: 'Este trimestre' },
  { clave: 'anio', texto: 'Este año' },
]

/**
 * Selector de período compacto: un botón con el período elegido que abre los
 * atajos y un rango a medida. Mismo control en el dashboard, informes y
 * listados con fechas.
 */
export function SelectorPeriodo({ valor, onCambiar, className }: { valor: Periodo; onCambiar: (p: Periodo) => void; className?: string }) {
  const [abierto, setAbierto] = useState(false)
  const [desde, setDesde] = useState(valor.desde)
  const [hasta, setHasta] = useState(valor.hasta)
  const rangoValido = !!desde && !!hasta && desde <= hasta

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v)
        if (v) {
          setDesde(valor.desde)
          setHasta(valor.hasta)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-900/[0.12] bg-white px-3.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:bg-slate-50',
            className
          )}
          aria-label={`Período: ${valor.etiqueta}. Cambiar`}
        >
          <CalendarDays className="h-4 w-4 text-[#3b9bff]" />
          {valor.etiqueta}
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <ul className="space-y-0.5">
          {ATAJOS.map((a) => {
            const activo = valor.clave === a.clave
            return (
              <li key={a.clave}>
                <button
                  type="button"
                  onClick={() => {
                    onCambiar(periodoDe(a.clave))
                    setAbierto(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    activo ? 'bg-[rgba(59,155,255,0.1)] font-medium text-[#0c4c96]' : 'text-slate-700 hover:bg-slate-900/[0.04]'
                  )}
                >
                  {a.texto}
                  {activo && <Check className="h-4 w-4" />}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-1.5 border-t border-slate-900/[0.08] px-2 pb-1.5 pt-3">
          <p className="mb-2 text-xs text-slate-500">Elegir fechas</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Desde
              <input
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-900/[0.12] px-2 text-sm text-slate-900 outline-none focus:border-[#3b9bff]"
              />
            </label>
            <label className="text-xs text-slate-500">
              Hasta
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-900/[0.12] px-2 text-sm text-slate-900 outline-none focus:border-[#3b9bff]"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!rangoValido}
            onClick={() => {
              onCambiar(periodoPersonalizado(desde, hasta))
              setAbierto(false)
            }}
            className="mt-3 h-9 w-full rounded-lg bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-sm font-medium text-white disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
