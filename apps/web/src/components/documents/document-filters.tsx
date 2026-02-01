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
import { Search, SlidersHorizontal, X } from 'lucide-react'

interface Proveedor {
  id: string
  razonSocial: string
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
  dateFrom?: Date | undefined
  dateTo?: Date | undefined
  onDateFromChange: (date: Date | undefined) => void
  onDateToChange: (date: Date | undefined) => void
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
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClearFilters,
  hasActiveFilters,
}: DocumentFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

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
