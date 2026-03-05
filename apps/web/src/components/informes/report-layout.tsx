'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Printer,
  Calendar,
  PieChart,
  FileText,
  BarChart3,
  Package,
  Sparkles,
} from 'lucide-react'

type QuickDateFilter = 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom'

function getDateRange(filter: QuickDateFilter): { desde: string; hasta: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]!

  switch (filter) {
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { desde: fmt(start), hasta: fmt(today) }
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return { desde: fmt(start), hasta: fmt(end) }
    }
    case 'quarter': {
      const quarterMonth = Math.floor(today.getMonth() / 3) * 3
      const start = new Date(today.getFullYear(), quarterMonth, 1)
      return { desde: fmt(start), hasta: fmt(today) }
    }
    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1)
      return { desde: fmt(start), hasta: fmt(today) }
    }
    default:
      return { desde: '', hasta: '' }
  }
}

const reportTabs = [
  { name: 'Resumen', href: '/informes', icon: PieChart },
  { name: 'Cuenta Corriente', href: '/informes/cuenta-corriente', icon: FileText },
  { name: 'Precios', href: '/informes/precios', icon: BarChart3 },
  { name: 'Compras', href: '/informes/compras', icon: Package },
  { name: 'Proyecciones IA', href: '/informes/proyecciones', icon: Sparkles },
]

export interface ReportFilters {
  desde: string
  hasta: string
  proveedorId?: string
}

interface Proveedor {
  id: string
  razonSocial: string
}

interface ReportLayoutProps {
  title: string
  description: string
  children: React.ReactNode
  filters: ReportFilters
  onFiltersChange: (filters: ReportFilters) => void
  showProveedorFilter?: boolean
  proveedores?: Proveedor[]
  printRef?: React.Ref<HTMLDivElement>
}

export function ReportLayout({
  title,
  description,
  children,
  filters,
  onFiltersChange,
  showProveedorFilter = false,
  proveedores = [],
  printRef,
}: ReportLayoutProps) {
  const pathname = usePathname()
  const [quickFilter, setQuickFilter] = useState<QuickDateFilter>('month')

  const applyQuickFilter = (filter: QuickDateFilter) => {
    setQuickFilter(filter)
    if (filter !== 'custom') {
      const { desde, hasta } = getDateRange(filter)
      onFiltersChange({ ...filters, desde, hasta })
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Header title={title} description={description} />
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>

        {/* Report tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto print:hidden">
          {reportTabs.map((tab) => {
            const isActive = pathname === tab.href
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm rounded-md whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm font-medium'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </Link>
            )
          })}
        </div>

        {/* Filters */}
        <div className="bg-white border rounded-lg p-4 space-y-3 print:hidden">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-slate-500 flex items-center gap-1 mr-2">
              <Calendar className="h-4 w-4" />
              Período:
            </span>
            {([
              { value: 'month' as const, label: 'Mes actual' },
              { value: 'lastMonth' as const, label: 'Mes anterior' },
              { value: 'quarter' as const, label: 'Trimestre' },
              { value: 'year' as const, label: 'Año' },
              { value: 'custom' as const, label: 'Personalizado' },
            ]).map((opt) => (
              <Button
                key={opt.value}
                variant={quickFilter === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {quickFilter === 'custom' && (
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Desde</label>
                <Input
                  type="date"
                  value={filters.desde}
                  onChange={(e) => onFiltersChange({ ...filters, desde: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Hasta</label>
                <Input
                  type="date"
                  value={filters.hasta}
                  onChange={(e) => onFiltersChange({ ...filters, hasta: e.target.value })}
                />
              </div>
            </div>
          )}

          {showProveedorFilter && (
            <div className="max-w-xs">
              <Select
                value={filters.proveedorId || 'all'}
                onValueChange={(v) => onFiltersChange({ ...filters, proveedorId: v === 'all' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los proveedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proveedores</SelectItem>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.razonSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Print header (hidden on screen) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500">
            Período: {filters.desde} al {filters.hasta} | Generado: {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>

        {/* Report content */}
        <div ref={printRef}>
          {children}
        </div>
      </div>
    </DashboardLayout>
  )
}
