'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ATAJOS_VENTAS, SelectorPeriodo, periodoDesdeRango } from '@/components/ui/periodo'

interface Props {
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  sucursales?: string[] | undefined
  sucursal?: string | undefined
  onSucursalChange?: ((s: string) => void) | undefined
}

/**
 * Rango de fechas de ventas: el mismo selector de período que el resto de la
 * app (atajos en calendario argentino y rango a medida), más la sucursal.
 */
export function DateRange({ from, to, onChange, sucursales, sucursal, onSucursalChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectorPeriodo
        valor={periodoDesdeRango(from, to, ATAJOS_VENTAS)}
        onCambiar={(p) => onChange({ from: p.desde, to: p.hasta })}
        atajos={ATAJOS_VENTAS}
      />
      {sucursales && sucursales.length > 1 && onSucursalChange && (
        <Select value={sucursal || 'todas'} onValueChange={(v) => onSucursalChange(v === 'todas' ? '' : v)}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Todas las sucursales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las sucursales</SelectItem>
            {sucursales.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
