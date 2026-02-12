'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/utils'
import { CreditCard, ArrowRight, Plus, Users } from 'lucide-react'

interface PaymentOrder {
  id: string
  fecha: string
  estado: 'BORRADOR' | 'EMITIDA' | 'PAGADA'
  total: number
  proveedor: {
    razonSocial: string
  }
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '--';
  // Usar split para evitar problemas de timezone con fechas ISO
  const datePart = dateStr.split('T')[0] || dateStr;
  const parts = datePart.split('-');
  if (parts.length < 3) return '--';
  return `${parts[2]}-${parts[1]}`;
}

interface PaymentsSummaryProps {
  proveedoresConSaldo: number
  montoPendiente: number
  ordenesRecientes: PaymentOrder[]
  isLoading?: boolean
}

export function PaymentsSummary({
  proveedoresConSaldo,
  montoPendiente,
  ordenesRecientes,
  isLoading,
}: PaymentsSummaryProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Pagos pendientes */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Pagos pendientes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-blue-50">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-500">Proveedores con saldo</p>
                <p className="text-xl font-semibold text-slate-900 tabular-nums">
                  {isLoading ? '-' : proveedoresConSaldo}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-amber-50">
                <CreditCard className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-slate-500">Monto pendiente total</p>
                <p className="text-xl font-semibold text-slate-900 tabular-nums">
                  {isLoading ? '-' : formatCurrency(montoPendiente)}
                </p>
              </div>
            </div>

            <Button variant="primary" className="w-full" asChild>
              <Link href="/pagos/nueva">
                <Plus className="h-4 w-4 mr-1.5" />
                Crear orden de pago
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Órdenes recientes */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Órdenes de pago recientes</CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-slate-500 -mr-2">
              <Link href="/pagos">
                Ver todas
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 py-2">
                  <div className="h-4 bg-slate-100 rounded w-24" />
                  <div className="flex-1" />
                  <div className="h-4 bg-slate-100 rounded w-16" />
                </div>
              ))}
            </div>
          ) : ordenesRecientes.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="Sin órdenes"
              description="Las órdenes de pago aparecerán aquí"
            />
          ) : (
            <div className="space-y-1">
              {ordenesRecientes.map((orden) => (
                <Link
                  key={orden.id}
                  href={`/pagos/${orden.id}`}
                  className="flex items-center gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-slate-50 transition-colors"
                >
                  <span className="text-[10px] text-slate-400 tabular-nums w-10 flex-shrink-0">
                    {formatShortDate(orden.fecha)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-900 truncate block">
                      {orden.proveedor.razonSocial}
                    </span>
                  </div>
                  <div className="w-16 flex justify-center flex-shrink-0">
                    <StatusBadge status={orden.estado} size="sm" />
                  </div>
                  <span className="text-xs font-medium text-slate-900 tabular-nums min-w-[100px] text-right flex-shrink-0">
                    {formatCurrency(orden.total)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
