'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { formatCurrency, formatNumeroOrden } from '@/lib/utils'
import { hoyAR, diasEntre } from '@/lib/fechas'

/**
 * Cheques y eCheq entregados que todavía no se debitaron.
 *
 * No dependen del mes que se esté mirando: un eCheq entregado hoy con fecha
 * de diciembre es plata comprometida que hay que tener ese día, y mirando el
 * calendario de octubre no aparecía en ninguna parte.
 */

export interface ChequePendiente {
  fecha: string
  pagoId: string
  numero: number
  tipo: string
  monto: number
  proveedor: string
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const capitalizar = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

function cuando(iso: string, hoy: string): string {
  const dias = diasEntre(hoy, iso)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias <= 30) return `en ${dias} días`
  const meses = Math.round(dias / 30)
  return `en ${meses} mes${meses === 1 ? '' : 'es'}`
}

export function ChequesPorDebitar({ cheques, cargando }: { cheques: ChequePendiente[]; cargando?: boolean }) {
  const hoy = hoyAR()
  const total = cheques.reduce((s, c) => s + c.monto, 0)

  if (cargando) return <div className="h-48 animate-pulse rounded-2xl bg-slate-900/[0.04]" />
  if (cheques.length === 0) return null

  return (
    <section className="ax-card ax-entra p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="ax-card-titulo flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#f5a524]" />
            Por debitar
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ter)]">Cheques y eCheq entregados que aún no vencieron</p>
        </div>
        <span className="ax-num shrink-0 text-base font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>

      <ul className="mt-4 space-y-1 border-t border-slate-900/[0.06] pt-3">
        {cheques.map((c, i) => {
          const f = new Date(`${c.fecha}T12:00:00`)
          return (
            <li key={`${c.pagoId}-${i}`}>
              <Link
                href={`/pagos/${c.pagoId}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgba(59,155,255,0.06)]"
              >
                <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-[rgba(245,165,36,0.12)] leading-none text-[#b26a00]">
                  <span className="text-sm font-semibold tabular-nums">{f.getDate()}</span>
                  <span className="text-[9px]">{MESES[f.getMonth()]}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{capitalizar(c.proveedor)}</span>
                  <span className="text-[11px] text-slate-500">
                    {c.tipo === 'ECHEQ' ? 'eCheq' : 'Cheque'} · OP {formatNumeroOrden(c.numero)} · {cuando(c.fecha, hoy)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(c.monto)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
