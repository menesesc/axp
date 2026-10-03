'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'

export interface RubroTotal {
  nombre: string
  total: number
}

interface RubrosBreakdownCardProps {
  title: string
  /** Aclaración corta bajo el total (ej. "sin IVA · por categoría"). */
  hint?: string
  data: RubroTotal[]
  /** Clase de color de las barras (un solo tono por tarjeta: es magnitud, no identidad). */
  barClass: string
  href?: string
  emptyText: string
  isLoading?: boolean
  /** Cantidad de filas visibles; el resto se agrupa en "Otros". */
  maxRows?: number
}

/**
 * Participación de cada rubro/categoría en un total (gastos o ingresos).
 * Barras horizontales ordenadas en vez de torta: con 15-20 categorías una torta
 * no se lee, y la barra deja comparar magnitudes a ojo.
 */
export function RubrosBreakdownCard({
  title,
  hint,
  data,
  barClass,
  href,
  emptyText,
  isLoading,
  maxRows = 8,
}: RubrosBreakdownCardProps) {
  const header = (
    <CardHeader className="pb-2 pt-3 px-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {href && (
          <Button variant="ghost" size="sm" asChild className="text-slate-500 -mr-2 h-7 text-xs">
            <Link href={href}>
              Ver detalle
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>
    </CardHeader>
  )

  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        {header}
        <CardContent className="px-4 pb-3">
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 bg-slate-100 rounded w-32" />
                  <div className="h-3.5 bg-slate-100 rounded w-20" />
                </div>
                <div className="h-2 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const positivos = data.filter((d) => d.total > 0).sort((a, b) => b.total - a.total)
  const total = positivos.reduce((s, d) => s + d.total, 0)
  const visibles = positivos.slice(0, maxRows)
  const resto = positivos.slice(maxRows)
  const filas: Array<RubroTotal & { otros?: number }> =
    resto.length > 0
      ? [...visibles, { nombre: 'Otros', total: resto.reduce((s, d) => s + d.total, 0), otros: resto.length }]
      : visibles
  const max = filas.length > 0 ? Math.max(...filas.map((f) => f.total)) : 0

  return (
    <Card className="border shadow-sm">
      {header}
      <CardContent className="px-4 pb-3">
        {total === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-slate-400 text-center px-6">
            {emptyText}
          </div>
        ) : (
          <>
            <div className="mb-3">
              <p className="text-xl font-semibold text-slate-900 tabular-nums">{formatCurrency(total)}</p>
              {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
            </div>
            <div className="space-y-2.5">
              {filas.map((f) => {
                const pct = (f.total / total) * 100
                const label = f.otros ? `Otros (${f.otros})` : f.nombre
                return (
                  <div key={label} title={`${label}: ${formatCurrency(f.total)} · ${pct.toFixed(1)}%`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-slate-700 truncate max-w-[55%]">{label}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400 tabular-nums w-9 text-right">
                          {pct < 1 ? '<1' : pct.toFixed(0)}%
                        </span>
                        <span className="text-sm font-medium text-slate-900 tabular-nums">
                          {formatCurrency(f.total)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${f.otros ? 'bg-slate-300' : barClass}`}
                        style={{ width: `${max > 0 ? (f.total / max) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
