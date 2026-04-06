'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, cn } from '@/lib/utils'
import { Package, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'

// ─── Types ───

interface TopItem {
  descripcion: string
  totalCantidad: number
  totalSubtotal: number
  proveedores: number
}

interface PriceVariation {
  descripcion: string
  precioInicial: number
  precioFinal: number
  variacionPct: number
  compras: number
}

interface TopProvider {
  proveedorId: string | null
  proveedor: string
  totalItems: number
  totalSubtotal: number
}

interface PurchasingTabProps {
  topItems: TopItem[]
  priceVariation: PriceVariation[]
  byProvider: TopProvider[]
  isLoading?: boolean
}

// ─── Top Items Card ───

function TopItemsCard({
  items,
  priceVariation,
  isLoading,
}: {
  items: TopItem[]
  priceVariation: PriceVariation[]
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Top items comprados</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 bg-slate-100 rounded w-40" />
                  <div className="h-3.5 bg-slate-100 rounded w-20" />
                </div>
                <div className="h-2 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const data = items.slice(0, 10)
  const maxTotal = data.length > 0 ? Math.max(...data.map(d => d.totalSubtotal)) : 0

  // Build variation lookup
  const variationMap = new Map(
    priceVariation.map(v => [v.descripcion, v.variacionPct])
  )

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Top items comprados</CardTitle>
          <Button variant="ghost" size="sm" asChild className="text-slate-500 -mr-2 h-7 text-xs">
            <Link href="/items">
              Ver todos
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {data.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin items"
            description="Los items aparecerán cuando proceses documentos"
          />
        ) : (
          <div className="space-y-3">
            {data.map((item, i) => {
              const variacion = variationMap.get(item.descripcion)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <p
                      className="text-sm text-slate-700 truncate max-w-[55%]"
                      title={item.descripcion}
                    >
                      {item.descripcion}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      {variacion !== undefined && variacion !== 0 && (
                        <span
                          className={cn(
                            'text-[10px] font-medium flex items-center gap-0.5',
                            variacion > 0 ? 'text-red-600' : 'text-emerald-600'
                          )}
                        >
                          {variacion > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {Math.abs(variacion).toFixed(0)}%
                        </span>
                      )}
                      <span className="text-sm font-medium text-slate-900 tabular-nums">
                        {formatCurrency(item.totalSubtotal)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{ width: `${(item.totalSubtotal / maxTotal) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-slate-400">
                      {item.proveedores} proveedor{item.proveedores !== 1 ? 'es' : ''}
                    </span>
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {item.totalCantidad.toLocaleString('es-AR', { maximumFractionDigits: 1 })} uds
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Top Proveedores Card ───

function TopProveedoresCard({
  providers,
  isLoading,
}: {
  providers: TopProvider[]
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Top proveedores</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="h-3.5 bg-slate-100 rounded w-28" />
                <div className="flex-1" />
                <div className="h-3.5 bg-slate-100 rounded w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const data = providers.slice(0, 8)
  const totalGasto = data.reduce((sum, p) => sum + p.totalSubtotal, 0)
  const maxTotal = data.length > 0 ? Math.max(...data.map(d => d.totalSubtotal)) : 0

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Top proveedores</CardTitle>
          <Button variant="ghost" size="sm" asChild className="text-slate-500 -mr-2 h-7 text-xs">
            <Link href="/proveedores">
              Ver todos
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {data.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin datos"
            description="Los proveedores aparecerán con documentos procesados"
          />
        ) : (
          <div className="space-y-3">
            {data.map((prov, i) => {
              const pct = totalGasto > 0 ? (prov.totalSubtotal / totalGasto) * 100 : 0
              return (
                <div key={prov.proveedorId || i}>
                  <div className="flex items-center justify-between mb-1">
                    <p
                      className="text-sm text-slate-700 truncate max-w-[55%]"
                      title={prov.proveedor}
                    >
                      {prov.proveedor}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {pct.toFixed(0)}%
                      </span>
                      <span className="text-sm font-medium text-slate-900 tabular-nums">
                        {formatCurrency(prov.totalSubtotal)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-500 transition-all"
                      style={{ width: `${(prov.totalSubtotal / maxTotal) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Exported Composite ───

export function PurchasingTabContent({ topItems, priceVariation, byProvider, isLoading }: PurchasingTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <TopItemsCard items={topItems} priceVariation={priceVariation} isLoading={isLoading} />
      </div>
      <div>
        <TopProveedoresCard providers={byProvider} isLoading={isLoading} />
      </div>
    </div>
  )
}
