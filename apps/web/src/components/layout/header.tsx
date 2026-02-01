'use client'

import { cn } from '@/lib/utils'

export interface HeaderProps {
  title: string
  description?: string | undefined
  actions?: React.ReactNode
  className?: string
}

export function Header({ title, description, actions, className }: HeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pb-6',
        className
      )}
    >
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 mt-4 sm:mt-0">{actions}</div>}
    </div>
  )
}
