'use client'

import { cn } from '@/lib/utils'

export interface HeaderProps {
  title: string
  description?: string | undefined
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function Header({ title, description, actions, children, className }: HeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pb-6',
        className
      )}
    >
      {/* pl en mobile para no quedar tapado por el botón hamburguesa fijo
          (top-3 left-3). En lg+ el sidebar es fijo y no hace falta. */}
      <div className="pl-11 lg:pl-0">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {(actions || children) && (
        <div className="flex items-center gap-2 mt-4 sm:mt-0">{actions || children}</div>
      )}
    </div>
  )
}

// Alias for backward compatibility
export const PageHeader = Header
