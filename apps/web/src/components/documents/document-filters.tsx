'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ATAJOS_LISTADO, SelectorPeriodo, periodoDe, periodoPersonalizado, type AtajoPeriodo, type Periodo } from '@/components/ui/periodo'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, SlidersHorizontal, X, MessageSquareWarning, Package, CheckCircle } from 'lucide-react'
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
  hasActiveFilters,
}: DocumentFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

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

  return (
    <div className="space-y-4">
      {/* Main Filter Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Estado Tabs */}
        <Tabs value={estado || 'all'} onValueChange={(v) => onEstadoChange(v === 'all' ? '' : v)}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="PENDIENTE">Pendientes</TabsTrigger>
            <TabsTrigger value="CONFIRMADO">Confirmados</TabsTrigger>
          </TabsList>
        </Tabs>

        <SelectorPeriodo valor={periodo} onCambiar={cambiarPeriodo} atajos={ATAJOS_LISTADO} />

        {/* Search */}
        <div className="relative min-w-[14rem] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Buscar proveedor o comprobante..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Advanced Filters Toggle */}
        <Popover open={showAdvanced} onOpenChange={setShowAdvanced}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {hasActiveFilters && (
                <span className="flex h-2 w-2 rounded-full bg-blue-600" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="text-sm font-semibold">Más filtros</div>

              {/* Confidence Filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">
                  Seguridad de la lectura
                </label>
                <Select value={confidenceFilter} onValueChange={onConfidenceFilterChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Cualquiera" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cualquiera</SelectItem>
                    <SelectItem value="high">Alta (90%+)</SelectItem>
                    <SelectItem value="medium">Media (80-89%)</SelectItem>
                    <SelectItem value="low">Baja (&lt;80%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Proveedor Filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500">
                  Proveedor
                </label>
                <Select value={proveedorId} onValueChange={onProveedorChange}>
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
              </div>

              {/* Checkbox Filters */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="soloPagados"
                    checked={estado === 'PAGADO'}
                    onCheckedChange={(checked) => onEstadoChange(checked ? 'PAGADO' : '')}
                  />
                  <label
                    htmlFor="soloPagados"
                    className="text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle className="h-4 w-4 text-blue-500" />
                    Solo pagados
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="conAnotaciones"
                    checked={conAnotaciones}
                    onCheckedChange={(checked) => onConAnotacionesChange(checked === true)}
                  />
                  <label
                    htmlFor="conAnotaciones"
                    className="text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquareWarning className="h-4 w-4 text-amber-500" />
                    Con anotaciones
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sinItems"
                    checked={sinItems}
                    onCheckedChange={(checked) => onSinItemsChange(checked === true)}
                  />
                  <label
                    htmlFor="sinItems"
                    className="text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Package className="h-4 w-4 text-slate-400" />
                    Solo sin items
                  </label>
                </div>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onClearFilters()
                    setShowAdvanced(false)
                  }}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Limpiar filtros
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear Filters Button (visible when active) */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>
    </div>
  )
}
