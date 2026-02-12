'use client'

import { cn } from '@/lib/utils'

type DocumentStatus = 'PENDIENTE' | 'CONFIRMADO' | 'PAGADO'
type PaymentOrderStatus = 'BORRADOR' | 'EMITIDA' | 'PAGADA'

interface StatusBadgeProps {
  status: DocumentStatus | PaymentOrderStatus
  size?: 'sm' | 'default'
  className?: string
}

const statusConfig = {
  PENDIENTE: {
    label: 'Pendiente',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  CONFIRMADO: {
    label: 'Confirmado',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  PAGADO: {
    label: 'Pagado',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  BORRADOR: {
    label: 'Borrador',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
  },
  EMITIDA: {
    label: 'Emitida',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  PAGADA: {
    label: 'Pagada',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
}

export function StatusBadge({ status, size = 'default', className }: StatusBadgeProps) {
  const config = statusConfig[status]

  if (!config) {
    return null
  }

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0 text-[10px]'
    : 'px-2 py-0.5 text-xs'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        sizeClasses,
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}
