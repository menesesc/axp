'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatNumeroOrden } from '@/lib/utils'
import { CalendarDays } from 'lucide-react'
import type { PaymentMethod } from '@/components/ui/payment-method-badge'

interface CalendarEventItem {
  pagoId: string
  numero: number
  proveedor: string
  estado: string
  monto: number
  tipo: string
}

interface CalendarEvent {
  fecha: string
  total: number
  items: CalendarEventItem[]
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === tomorrow.toDateString()) return 'Mañana'

  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function UpcomingPayments() {
  const desde = new Date().toISOString().split('T')[0]
  const hasta = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data, isLoading } = useQuery<{ eventos: CalendarEvent[] }>({
    queryKey: ['pagos-calendario', desde, hasta],
    queryFn: async () => {
      const res = await fetch(`/api/pagos/calendario?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
  })

  const eventos = data?.eventos || []

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500" />
          Próximos pagos (30 días)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : eventos.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">
            Sin pagos programados
          </div>
        ) : (
          <div className="space-y-1">
            {eventos.map((evento) => (
              <div key={evento.fecha}>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs font-medium text-slate-500">
                    {formatShortDate(evento.fecha)}
                  </span>
                  <span className="text-xs font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(evento.total)}
                  </span>
                </div>
                <div className="space-y-1 ml-2 pb-2 border-l-2 border-slate-100 pl-3">
                  {evento.items.map((item, i) => (
                    <Link
                      key={`${item.pagoId}-${i}`}
                      href={`/pagos/${item.pagoId}`}
                      className={`block rounded-md px-2 py-1.5 hover:bg-slate-50 transition-colors ${
                        item.estado === 'BORRADOR'
                          ? 'border border-dashed border-slate-200'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            #{formatNumeroOrden(item.numero)}
                          </span>
                          <span className="text-xs text-slate-700 truncate">
                            {item.proveedor}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-slate-900 tabular-nums shrink-0">
                          {formatCurrency(item.monto)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <PaymentMethodBadge method={item.tipo as PaymentMethod} showIcon={false} />
                        {item.estado === 'BORRADOR' && (
                          <span className="text-[10px] text-slate-400">Borrador</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
