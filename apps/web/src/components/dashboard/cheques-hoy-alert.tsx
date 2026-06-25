'use client'

import Link from 'next/link'
import { CalendarClock, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ChequesHoy {
  cantidad: number
  total: number
  cheque: { cantidad: number; total: number }
  echeq: { cantidad: number; total: number }
}

interface ChequesHoyAlertProps {
  data?: ChequesHoy
}

function tramo(n: number, singular: string, plural: string): string | null {
  if (n <= 0) return null
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * Aviso en el dashboard cuando hay cheques o eCheq cuyo vencimiento es hoy.
 * No renderiza nada si no hay vencimientos (para no agregar ruido).
 */
export function ChequesHoyAlert({ data }: ChequesHoyAlertProps) {
  if (!data || data.cantidad <= 0) return null

  const partes = [
    tramo(data.cheque.cantidad, 'cheque', 'cheques'),
    tramo(data.echeq.cantidad, 'eCheq', 'eCheq'),
  ].filter(Boolean)

  return (
    <Link
      href="/finanzas"
      className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100/70"
    >
      <div className="rounded-lg bg-amber-100 p-2">
        <CalendarClock className="h-4 w-4 text-amber-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-900">
          {partes.join(' y ')} {data.cantidad === 1 ? 'vence' : 'vencen'} hoy
        </p>
        <p className="text-xs text-amber-700">Ver en el calendario financiero</p>
      </div>
      <span className="tabular-nums text-sm font-semibold text-amber-900">
        {formatCurrency(data.total)}
      </span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-amber-600" />
    </Link>
  )
}
