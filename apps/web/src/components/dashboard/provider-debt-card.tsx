'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, cn } from '@/lib/utils'
import { DollarSign, Calendar, ArrowRight, Wallet } from 'lucide-react'

interface ProveedorDeuda {
  proveedorId: string
  razonSocial: string
  saldo: number
  cantidadDocs: number
  facturaViejaMas: string | null
  diasVencido: number
  ultimoPago: string | null
}

interface ProviderDebtCardProps {
  data: ProveedorDeuda[]
  isLoading?: boolean
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const parts = dateStr.split('-')
  if (parts.length < 3) return '--'
  return `${parts[2]}/${parts[1]}`
}

function getAgingColor(dias: number): string {
  if (dias > 60) return 'bg-red-500'
  if (dias > 30) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function getAgingTextColor(dias: number): string {
  if (dias > 60) return 'text-red-600'
  if (dias > 30) return 'text-amber-600'
  return 'text-emerald-600'
}

export function ProviderDebtCard({ data, isLoading }: ProviderDebtCardProps) {
  const [sortBy, setSortBy] = useState<'monto' | 'antiguedad'>('monto')

  const sorted = useMemo(() => {
    if (!data) return []
    const items = [...data]
    if (sortBy === 'antiguedad') {
      items.sort((a, b) => b.diasVencido - a.diasVencido)
    }
    // Default: ya viene por monto DESC del API
    return items
  }, [data, sortBy])

  const maxSaldo = sorted.length > 0 ? Math.max(...sorted.map(d => d.saldo)) : 0

  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">
            Deuda por proveedor
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 bg-slate-100 rounded w-32" />
                  <div className="h-3.5 bg-slate-100 rounded w-20" />
                </div>
                <div className="h-2 bg-slate-100 rounded-full w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Deuda por proveedor
          </CardTitle>
          <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-2 text-xs',
                sortBy === 'monto' && 'bg-white shadow-sm'
              )}
              onClick={() => setSortBy('monto')}
            >
              <DollarSign className="h-3 w-3 mr-1" />
              Monto
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-2 text-xs',
                sortBy === 'antiguedad' && 'bg-white shadow-sm'
              )}
              onClick={() => setSortBy('antiguedad')}
            >
              <Calendar className="h-3 w-3 mr-1" />
              Antigüedad
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {sorted.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Sin deuda"
            description="No hay proveedores con saldo pendiente"
          />
        ) : (
          <div className="space-y-3">
            {sorted.map((item) => (
              <div key={item.proveedorId}>
                {/* Row: nombre + monto */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <p
                      className="text-sm text-slate-700 truncate"
                      title={item.razonSocial}
                    >
                      {item.razonSocial}
                    </p>
                    {/* Aging indicator dot */}
                    <div
                      className={cn(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        getAgingColor(item.diasVencido)
                      )}
                      title={`${item.diasVencido} días`}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-900 tabular-nums shrink-0 ml-3">
                    {formatCurrency(item.saldo)}
                  </span>
                </div>

                {/* Bar */}
                <div className="h-2 rounded-full overflow-hidden bg-slate-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      getAgingColor(item.diasVencido)
                    )}
                    style={{ width: `${(item.saldo / maxSaldo) * 100}%` }}
                  />
                </div>

                {/* Metadata row */}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-slate-400">
                    {item.cantidadDocs} doc{item.cantidadDocs !== 1 ? 's' : ''}
                    {item.facturaViejaMas && (
                      <>
                        {' · '}
                        <span className={getAgingTextColor(item.diasVencido)}>
                          {item.diasVencido}d
                        </span>
                        {' desde '}
                        {formatShortDate(item.facturaViejaMas)}
                      </>
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {item.ultimoPago
                      ? `Últ. pago: ${formatShortDate(item.ultimoPago)}`
                      : 'Sin pagos'}
                  </span>
                </div>
              </div>
            ))}

            {/* Footer link */}
            <div className="pt-2 border-t">
              <Button variant="ghost" size="sm" asChild className="text-slate-500 -ml-2 h-7 text-xs">
                <Link href="/informes/cuenta-corriente">
                  Ver cuenta corriente
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
