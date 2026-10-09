'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { formatCurrency, formatNumeroOrden } from '@/lib/utils'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { cn } from '@/lib/utils'

interface CalendarEventItem {
  clase?: 'pago' | 'vencimiento' | 'estimado'
  pagoId: string | null
  documentoId?: string | null
  numero: number | null
  etiqueta?: string
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

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const METODO: Record<string, { texto: string; color: string }> = {
  TRANSFERENCIA: { texto: 'Transferencia', color: '#3b9bff' },
  ECHEQ: { texto: 'eCheq', color: '#f5a524' },
  CHEQUE: { texto: 'Cheque', color: '#f5a524' },
  EFECTIVO: { texto: 'Efectivo', color: '#10b981' },
  VENCIMIENTO: { texto: 'Vence sin orden', color: '#ef4444' },
}

const capitalizar = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

/** Lo que hay que pagar en los próximos 30 días, día por día. */
export function UpcomingPayments() {
  // Fechas del calendario argentino (con UTC, de noche "hoy" caía en mañana).
  const desde = hoyAR()
  const hasta = sumarDias(desde, 30)
  const manana = sumarDias(desde, 1)

  const { data, isLoading } = useQuery<{ eventos: CalendarEvent[] }>({
    queryKey: ['pagos-calendario', desde, hasta, 'pendientes'],
    queryFn: async () => {
      // Acá sólo lo que falta pagar: una transferencia ya hecha no es un
      // próximo pago, aunque sí sea un movimiento del calendario.
      const res = await fetch(`/api/pagos/calendario?desde=${desde}&hasta=${hasta}&pendientes=1`)
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
  })

  const eventos = data?.eventos || []
  const total = eventos.reduce((s, e) => s + e.total, 0)

  return (
    <section className="ax-card ax-entra p-5">
      <div className="mb-4">
        <h2 className="ax-card-titulo flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[var(--azul)]" />
          Próximos pagos
        </h2>
        {!isLoading && (
          <p className="mt-1 text-xs text-[var(--ter)]">
            {eventos.length ? (
              <>
                <span className="font-medium text-[var(--texto)] tabular-nums">{formatCurrency(total)}</span> en los próximos 30 días
              </>
            ) : (
              'Nada programado en los próximos 30 días.'
            )}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-900/[0.04]" />
          ))}
        </div>
      ) : (
        <ol className="space-y-4">
          {eventos.map((evento) => {
            const f = new Date(`${evento.fecha}T12:00:00`)
            const esHoy = evento.fecha === desde
            const etiqueta = esHoy ? 'Hoy' : evento.fecha === manana ? 'Mañana' : DIAS[f.getDay()]
            return (
              <li key={evento.fecha} className="flex gap-3">
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none',
                    esHoy ? 'bg-gradient-to-b from-[#4aa6ff] to-[#1f7fe6] text-white' : 'bg-slate-900/[0.04] text-slate-700'
                  )}
                >
                  <span className={cn('text-[10px] font-medium', esHoy ? 'text-white/80' : 'text-slate-500')}>{etiqueta}</span>
                  <span className="mt-0.5 text-base font-semibold tabular-nums">{f.getDate()}</span>
                  <span className={cn('text-[9px]', esHoy ? 'text-white/70' : 'text-slate-400')}>{MESES[f.getMonth()]}</span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {evento.items.map((item, i) => {
                    const m = METODO[item.tipo] ?? { texto: item.tipo, color: '#94a3b8' }
                    return (
                      <Link
                        key={`${item.pagoId ?? item.documentoId}-${i}`}
                        href={item.clase === 'vencimiento' && item.documentoId ? `/documento/${item.documentoId}` : `/pagos/${item.pagoId}`}
                        className={cn(
                          'block rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[rgba(59,155,255,0.06)]',
                          item.estado === 'BORRADOR' && 'border border-dashed border-slate-900/[0.12]'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-slate-800">{capitalizar(item.proveedor)}</span>
                          <span className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(item.monto)}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
                          {m.texto}
                          {item.clase === 'vencimiento'
                            ? item.etiqueta
                              ? ` · ${item.etiqueta}`
                              : ''
                            : ` · OP ${formatNumeroOrden(item.numero ?? 0)}`}
                          {item.estado === 'BORRADOR' && <span className="text-slate-400">· borrador</span>}
                          {item.estado === 'PAGADO' && <span className="text-slate-400">· entregado</span>}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
