'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatCurrency, formatNumeroOrden } from '@/lib/utils'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'
import type { PaymentMethod } from '@/components/ui/payment-method-badge'
import { X, Building2, CreditCard } from 'lucide-react'

interface CalendarEventItem {
  pagoId: string
  numero: number
  proveedor: string
  estado: string
  monto: number
  tipo: string
}

/** Suma diferenciada por medio de pago: transferencia vs cheques/eCheq (vs resto). */
function splitByMethod(items: CalendarEventItem[]) {
  let transferencia = 0
  let chequeEcheq = 0
  let otros = 0
  for (const it of items) {
    if (it.tipo === 'TRANSFERENCIA') transferencia += it.monto
    else if (it.tipo === 'CHEQUE' || it.tipo === 'ECHEQ') chequeEcheq += it.monto
    else otros += it.monto
  }
  return { transferencia, chequeEcheq, otros }
}

/** Monto compacto para celdas chicas: $1,2M · $50k · $300. */
function formatCompactARS(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

interface CalendarEvent {
  fecha: string
  total: number
  items: CalendarEventItem[]
}

interface PaymentCalendarProps {
  month: Date
  eventos: CalendarEvent[]
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function getCalendarDays(month: Date): Date[] {
  const year = month.getFullYear()
  const m = month.getMonth()

  // First day of the month
  const firstDay = new Date(year, m, 1)

  // Day of week for first day (0=Sun, adjust to Mon=0)
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  // Build array starting from the Monday before the first day
  const days: Date[] = []
  const start = new Date(firstDay)
  start.setDate(start.getDate() - startDow)

  // Always show 6 weeks (42 days) for consistent layout
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start))
    start.setDate(start.getDate() + 1)
  }

  return days
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function PaymentCalendar({ month, eventos }: PaymentCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const days = getCalendarDays(month)
  const today = new Date()

  // Map events by date key
  const eventsByDay = new Map<string, CalendarEvent>()
  for (const e of eventos) {
    eventsByDay.set(e.fecha, e)
  }

  const selectedEvent = selectedDay ? eventsByDay.get(selectedDay) : null

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 bg-slate-50 border-b">
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-slate-500 text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = formatDateKey(day)
            const event = eventsByDay.get(key)
            const isToday = isSameDay(day, today)
            const isCurrentMonth = day.getMonth() === month.getMonth()
            const isSelected = selectedDay === key

            return (
              <div
                key={key}
                onClick={() => event && setSelectedDay(isSelected ? null : key)}
                className={cn(
                  'min-h-[80px] p-1.5 border-b border-r text-xs transition-colors',
                  !isCurrentMonth && 'bg-slate-50/50 text-slate-300',
                  isToday && 'ring-2 ring-inset ring-blue-500',
                  isSelected && 'bg-blue-50',
                  event && 'cursor-pointer hover:bg-slate-50'
                )}
              >
                <div className={cn(
                  'font-medium',
                  isToday && 'text-blue-600',
                  !isCurrentMonth && 'text-slate-300',
                )}>
                  {day.getDate()}
                </div>
                {event && isCurrentMonth && (() => {
                  const split = splitByMethod(event.items)
                  return (
                  <div className="mt-1 space-y-0.5">
                    <div className="font-semibold text-slate-900 tabular-nums text-[11px]">
                      {formatCurrency(event.total)}
                    </div>
                    {(split.transferencia > 0 || split.chequeEcheq > 0) && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-tight">
                        {split.transferencia > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-blue-600 tabular-nums">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            {formatCompactARS(split.transferencia)}
                          </span>
                        )}
                        {split.chequeEcheq > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-orange-600 tabular-nums">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                            {formatCompactARS(split.chequeEcheq)}
                          </span>
                        )}
                      </div>
                    )}
                    {event.items.slice(0, 2).map((item, i) => (
                      <div
                        key={i}
                        className={cn(
                          'truncate rounded px-1 py-0.5 text-[10px]',
                          item.estado === 'BORRADOR'
                            ? 'bg-slate-100 text-slate-500 border border-dashed border-slate-300'
                            : 'bg-blue-50 text-blue-700'
                        )}
                      >
                        {item.proveedor}
                      </div>
                    ))}
                    {event.items.length > 2 && (
                      <div className="text-[10px] text-slate-400">
                        +{event.items.length - 2} más
                      </div>
                    )}
                  </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selectedEvent && selectedDay && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-slate-900">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </h4>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-900 tabular-nums">
                Total: {formatCurrency(selectedEvent.total)}
              </span>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {(() => {
            const split = splitByMethod(selectedEvent.items)
            if (split.transferencia <= 0 && split.chequeEcheq <= 0) return null
            return (
              <div className="flex flex-wrap gap-2 mb-3">
                {split.transferencia > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                    <Building2 className="h-3 w-3" />
                    Transferencia
                    <span className="font-semibold tabular-nums">{formatCurrency(split.transferencia)}</span>
                  </span>
                )}
                {split.chequeEcheq > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-700">
                    <CreditCard className="h-3 w-3" />
                    Cheques/eCheq
                    <span className="font-semibold tabular-nums">{formatCurrency(split.chequeEcheq)}</span>
                  </span>
                )}
              </div>
            )
          })()}
          <div className="space-y-2">
            {selectedEvent.items.map((item, i) => (
              <Link
                key={`${item.pagoId}-${i}`}
                href={`/pagos/${item.pagoId}`}
                className={cn(
                  'flex items-center justify-between p-2 rounded-md hover:bg-slate-50 transition-colors',
                  item.estado === 'BORRADOR' && 'border border-dashed border-slate-200'
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 tabular-nums">
                    #{formatNumeroOrden(item.numero)}
                  </span>
                  <span className="text-sm text-slate-700">{item.proveedor}</span>
                  <PaymentMethodBadge method={item.tipo as PaymentMethod} showIcon={false} />
                  {item.estado === 'BORRADOR' && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      Borrador
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                  {formatCurrency(item.monto)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
