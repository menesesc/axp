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
import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, SlidersHorizontal, X, Calendar } from 'lucide-react'

interface Proveedor {
  id: string
  razonSocial: string
}

type QuickDateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth'

function getDateRange(filter: QuickDateFilter): { desde: Date | undefined; hasta: Date | undefined } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (filter) {
    case 'today':
      return { desde: today, hasta: today }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { desde: yesterday, hasta: yesterday }
    }
    case 'week': {
      const weekStart = new Date(today)
      const day = weekStart.getDay()
      const diff = day === 0 ? 6 : day - 1
      weekStart.setDate(weekStart.getDate() - diff)
      return { desde: weekStart, hasta: today }
    }
    case 'lastWeek': {
      const lastWeekEnd = new Date(today)
      const day = lastWeekEnd.getDay()
      const diffToLastSunday = day === 0 ? 7 : day
      lastWeekEnd.setDate(lastWeekEnd.getDate() - diffToLastSunday)
      const lastWeekStart = new Date(lastWeekEnd)
      lastWeekStart.setDate(lastWeekStart.getDate() - 6)
      return { desde: lastWeekStart, hasta: lastWeekEnd }
    }
    case 'month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      return { desde: monthStart, hasta: today }
    }
    case 'lastMonth': {
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      return { desde: lastMonthStart, hasta: lastMonthEnd }
    }
    default:
      return { desde: undefined, hasta: undefined }
  }
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

  const handleQuickDateChange = (filter: QuickDateFilter) => {
    onQuickDateFilterChange(filter)
    const { desde, hasta } = getDateRange(filter)
    onDateFromChange(desde)
    onDateToChange(hasta)
  }

  return (
    <div className="space-y-4">
      {/* Quick Date Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500 flex items-center gap-1.5 mr-1">
          <Calendar className="h-4 w-4" />
          Período:
        </span>
        {[
          { value: 'all' as const, label: 'Todo' },
          { value: 'today' as const, label: 'Hoy' },
          { value: 'yesterday' as const, label: 'Ayer' },
          { value: 'week' as const, label: 'Semana' },
          { value: 'lastWeek' as const, label: 'Sem. Ant.' },
          { value: 'month' as const, label: 'Mes' },
          { value: 'lastMonth' as const, label: 'Mes Ant.' },
        ].map((opt) => (
          <Button
            key={opt.value}
            variant={quickDateFilter === opt.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleQuickDateChange(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Main Filter Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Estado Tabs */}
        <Tabs value={estado || 'all'} onValueChange={(v) => onEstadoChange(v === 'all' ? '' : v)}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="PENDIENTE">Pendientes</TabsTrigger>
            <TabsTrigger value="CONFIRMADO">Confirmados</TabsTrigger>
            <TabsTrigger value="PAGADO">Pagados</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sin Items Toggle */}
        <Button
          variant={sinItems ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSinItemsChange(!sinItems)}
          className="gap-1.5"
        >
          Sin items
          {sinItems && <X className="h-3 w-3" />}
        </Button>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
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
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {hasActiveFilters && (
                <span className="flex h-2 w-2 rounded-full bg-blue-600" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="font-medium text-sm">Filtros avanzados</div>

              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase tracking-wider">
                  Fecha de emisión
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker
                    date={dateFrom}
                    onDateChange={onDateFromChange}
                    placeholder="Desde"
                    className="text-xs"
                  />
                  <DatePicker
                    date={dateTo}
                    onDateChange={onDateToChange}
                    placeholder="Hasta"
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Confidence Filter */}
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase tracking-wider">
                  Confianza OCR
                </label>
                <Select value={confidenceFilter} onValueChange={onConfidenceFilterChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Cualquier confianza" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cualquier confianza</SelectItem>
                    <SelectItem value="high">Alta (90%+)</SelectItem>
                    <SelectItem value="medium">Media (80-89%)</SelectItem>
                    <SelectItem value="low">Baja (&lt;80%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Proveedor Filter */}
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase tracking-wider">
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
