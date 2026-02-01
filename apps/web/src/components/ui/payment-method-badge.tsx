'use client'

import { cn } from '@/lib/utils'
import { Banknote, Building2, CreditCard } from 'lucide-react'

export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'ECHEQ' | 'CHEQUE'

interface PaymentMethodBadgeProps {
  method: PaymentMethod
  className?: string
  showIcon?: boolean
}

const methodConfig = {
  EFECTIVO: {
    label: 'Efectivo',
    icon: Banknote,
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  TRANSFERENCIA: {
    label: 'Transferencia',
    icon: Building2,
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  ECHEQ: {
    label: 'eCheq',
    icon: CreditCard,
    className: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  CHEQUE: {
    label: 'Cheque',
    icon: CreditCard,
    className: 'bg-orange-50 text-orange-700 border-orange-200',
  },
}

export function PaymentMethodBadge({
  method,
  className,
  showIcon = true,
}: PaymentMethodBadgeProps) {
  const config = methodConfig[method]

  if (!config) {
    return null
  }

  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </span>
  )
}
