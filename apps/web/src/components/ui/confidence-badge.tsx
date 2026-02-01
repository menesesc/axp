'use client'

import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ConfidenceBadgeProps {
  score: number
  showBar?: boolean
  className?: string
}

function getConfidenceConfig(score: number) {
  if (score >= 90) {
    return {
      label: 'Alta',
      className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      barColor: 'bg-emerald-500',
      description: 'Alta confianza en el OCR',
    }
  }
  if (score >= 80) {
    return {
      label: 'Media',
      className: 'text-amber-700 bg-amber-50 border-amber-200',
      barColor: 'bg-amber-500',
      description: 'Confianza media, revisar campos',
    }
  }
  return {
    label: 'Baja',
    className: 'text-red-700 bg-red-50 border-red-200',
    barColor: 'bg-red-500',
    description: 'Baja confianza, verificar datos',
  }
}

export function ConfidenceBadge({ score, showBar = true, className }: ConfidenceBadgeProps) {
  const config = getConfidenceConfig(score)
  const normalizedScore = Math.min(100, Math.max(0, score))

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('inline-flex items-center gap-1.5', className)}>
            {showBar && (
              <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', config.barColor)}
                  style={{ width: `${normalizedScore}%` }}
                />
              </div>
            )}
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                config.className
              )}
            >
              {normalizedScore}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs">
            <p className="font-medium">Confianza OCR: {normalizedScore}%</p>
            <p className="text-slate-400">{config.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface ConfidenceAverageProps {
  score: number
  className?: string
}

export function ConfidenceAverage({ score, className }: ConfidenceAverageProps) {
  const config = getConfidenceConfig(score)
  const normalizedScore = Math.min(100, Math.max(0, score))

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', config.barColor)}
          style={{ width: `${normalizedScore}%` }}
        />
      </div>
      <span className="text-sm font-medium tabular-nums text-slate-700">
        {normalizedScore.toFixed(0)}%
      </span>
    </div>
  )
}
