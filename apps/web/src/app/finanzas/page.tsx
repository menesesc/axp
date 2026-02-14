'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { PaymentCalendar } from '@/components/payments/payment-calendar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/use-user'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, ChevronRight, FileText, Clock, CreditCard } from 'lucide-react'

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

function getMonthRange(month: Date): { desde: string; hasta: string } {
  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDay = new Date(year, m, 1)
  const lastDay = new Date(year, m + 1, 0)

  // Include a few days before/after for calendar padding
  firstDay.setDate(firstDay.getDate() - 7)
  lastDay.setDate(lastDay.getDate() + 7)

  return {
    desde: firstDay.toISOString().split('T')[0]!,
    hasta: lastDay.toISOString().split('T')[0]!,
  }
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export default function FinanzasPage() {
  const { clienteId } = useUser()
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const { desde, hasta } = getMonthRange(currentMonth)

  const { data, isLoading } = useQuery<{ eventos: CalendarEvent[] }>({
    queryKey: ['pagos-calendario', desde, hasta],
    queryFn: async () => {
      const res = await fetch(`/api/pagos/calendario?desde=${desde}&hasta=${hasta}`)
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const eventos = data?.eventos || []

  // Calcular resumen del mes
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
  const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
  const monthEvents = eventos.filter((e) => {
    const d = new Date(e.fecha + 'T12:00:00')
    return d >= monthStart && d <= monthEnd
  })

  const totalMes = monthEvents.reduce((sum, e) => sum + e.total, 0)
  const totalEmitido = monthEvents.reduce((sum, e) => {
    return sum + e.items.filter((i) => i.estado === 'EMITIDA').reduce((s, i) => s + i.monto, 0)
  }, 0)
  const totalBorradores = monthEvents.reduce((sum, e) => {
    return sum + e.items.filter((i) => i.estado === 'BORRADOR').reduce((s, i) => s + i.monto, 0)
  }, 0)

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const goToday = () => {
    setCurrentMonth(new Date())
  }

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">
          No tienes acceso
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header title="Calendario financiero" />

        {/* Month summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total programado</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                    {isLoading ? '-' : formatCurrency(totalMes)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-100">
                  <FileText className="h-4 w-4 text-slate-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Emitidas</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                    {isLoading ? '-' : formatCurrency(totalEmitido)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-blue-50">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Borradores</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">
                    {isLoading ? '-' : formatCurrency(totalBorradores)}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-amber-50">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday}>
              Hoy
            </Button>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 capitalize">
            {formatMonthYear(currentMonth)}
          </h2>
        </div>

        {/* Calendar */}
        {isLoading ? (
          <Skeleton className="h-[500px] w-full" />
        ) : (
          <PaymentCalendar month={currentMonth} eventos={eventos} />
        )}
      </div>
    </DashboardLayout>
  )
}
