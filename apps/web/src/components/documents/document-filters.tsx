'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ATAJOS_LISTADO, periodoDe, periodoPersonalizado, type AtajoPeriodo, type Periodo } from '@/components/ui/periodo'
import { BarraFiltros, CampoFiltro } from '@/components/ui/barra-filtros'
import { MessageSquareWarning, Package } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

interface Proveedor {
  id: string
  razonSocial: string
}

type QuickDateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth'

const A_PERIODO: Record<Exclude<QuickDateFilter, 'all'>, AtajoPeriodo> = {
  today: 'hoy',
  yesterday: 'ayer',
  week: 'semana',
  lastWeek: 'semanaAnterior',
  month: 'mes',
  lastMonth: 'mesAnterior',
}
const DE_PERIODO: Partial<Record<AtajoPeriodo, QuickDateFilter>> = {
  todo: 'all',
  hoy: 'today',
  ayer: 'yesterday',
  semana: 'week',
  semanaAnterior: 'lastWeek',
  mes: 'month',
  mesAnterior: 'lastMonth',
}

interface DocumentFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  estado: string
  onEstadoChange: (value: string) => void
  confidenceFilter: string
  onConfidenceFilterChange: (value: string) => void
  proveedorId: string
  onProveedorChange: (value: string) => void
  proveedores: Proveedor[]
  sinItems: boolean
  onSinItemsChange: (value: boolean) => void
  conAnotaciones: boolean
  onConAnotacionesChange: (value: boolean) => void
  dateFrom?: Date | undefined
  dateTo?: Date | undefined
  onDateFromChange: (date: Date | undefined) => void
  onDateToChange: (date: Date | undefined) => void
  quickDateFilter: QuickDateFilter
  onQuickDateFilterChange: (filter: QuickDateFilter) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}

export function DocumentFilters({
  search,
  onSearchChange,
  estado,
  onEstadoChange,
  confidenceFilter,
  onConfidenceFilterChange,
  proveedorId,
  onProveedorChange,
  proveedores,
  sinItems,
  onSinItemsChange,
  conAnotaciones,
  onConAnotacionesChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  quickDateFilter,
  onQuickDateFilterChange,
  onClearFilters,
  hasActiveFilters: _hayFiltros,
}: DocumentFiltersProps) {
  // El selector trabaja con fechas YYYY-MM-DD de Argentina; la página, con Date.
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const periodo: Periodo =
    quickDateFilter !== 'all'
      ? periodoDe(A_PERIODO[quickDateFilter])
      : dateFrom && dateTo
        ? periodoPersonalizado(iso(dateFrom), iso(dateTo))
        : periodoDe('todo')

  const cambiarPeriodo = (p: Periodo) => {
    onQuickDateFilterChange(p.clave === 'personalizado' ? 'all' : DE_PERIODO[p.clave] ?? 'all')
    onDateFromChange(p.desde ? new Date(`${p.desde}T00:00:00`) : undefined)
    onDateToChange(p.hasta ? new Date(`${p.hasta}T23:59:59`) : undefined)
  }

  const activos = [
    estado,
    search,
    quickDateFilter !== 'all' || dateFrom ? 'p' : '',
    confidenceFilter && confidenceFilter !== 'all' ? 'c' : '',
    proveedorId && proveedorId !== 'all' ? 'pr' : '',
    conAnotaciones ? 'a' : '',
    sinItems ? 'i' : '',
  ].filter(Boolean).length
  const masActivos = [confidenceFilter && confidenceFilter !== 'all', proveedorId && proveedorId !== 'all', conAnotaciones, sinItems].filter(Boolean).length

  return (
    <BarraFiltros
      periodo={{ valor: periodo, onCambiar: cambiarPeriodo, atajos: ATAJOS_LISTADO }}
      busqueda={{ valor: search, onCambiar: onSearchChange, placeholder: 'Buscar proveedor o número' }}
      estados={{
        valor: estado || 'all',
        onCambiar: (v) => onEstadoChange(v === 'all' ? '' : v),
        opciones: [
          { valor: 'all', texto: 'Todos' },
          { valor: 'PENDIENTE', texto: 'Para revisar' },
          { valor: 'CONFIRMADO', texto: 'Confirmados' },
          { valor: 'PAGADO', texto: 'Pagados' },
        ],
      }}
      activos={activos}
      onLimpiar={onClearFilters}
      masFiltros={
        <>
          <CampoFiltro etiqueta="Proveedor">
            <Select value={proveedorId || 'all'} onValueChange={onProveedorChange}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los proveedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                <SelectItem value="none">Sin proveedor</SelectItem>
                {proveedores.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.razonSocial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFiltro>
          <CampoFiltro etiqueta="Seguridad de la lectura">
            <Select value={confidenceFilter || 'all'} onValueChange={onConfidenceFilterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Cualquiera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cualquiera</SelectItem>
                <SelectItem value="high">Alta (90 % o más)</SelectItem>
                <SelectItem value="medium">Media (80 a 89 %)</SelectItem>
                <SelectItem value="low">Baja (menos de 80 %)</SelectItem>
              </SelectContent>
            </Select>
          </CampoFiltro>
          <div className="space-y-3 border-t border-slate-900/[0.08] pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={conAnotaciones} onCheckedChange={(c) => onConAnotacionesChange(c === true)} />
              <MessageSquareWarning className="h-4 w-4 text-amber-500" /> Con anotaciones
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={sinItems} onCheckedChange={(c) => onSinItemsChange(c === true)} />
              <Package className="h-4 w-4 text-slate-400" /> Sin items cargados
            </label>
          </div>
          {masActivos > 0 && <p className="text-xs text-slate-500">{masActivos} {masActivos === 1 ? 'filtro activo' : 'filtros activos'} acá.</p>}
        </>
      }
    />
  )
}
