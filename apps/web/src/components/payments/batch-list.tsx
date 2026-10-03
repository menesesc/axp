'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { formatCurrency, cn } from '@/lib/utils'
import { fechaCorta } from './batch-shared'
import { ChevronRight, Layers } from 'lucide-react'

interface Lote {
  id: string
  numero: number
  fecha: string
  ordenes: number
  pagadas: number
  conComprobante: number
  montoTotal: number
}

/** Lotes de transferencias generados, con el avance de comprobantes. */
export function BatchList() {
  const { data, isLoading } = useQuery<{ lotes: Lote[] }>({
    queryKey: ['pagos-lotes'],
    queryFn: async () => {
      const res = await fetch('/api/pagos/lotes')
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
  })
  const lotes = data?.lotes ?? []

  if (isLoading) {
    return <div className="bg-white border rounded-lg p-8 text-center text-sm text-slate-400">Cargando lotes…</div>
  }
  if (lotes.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-10 text-center">
        <Layers className="h-8 w-8 mx-auto text-slate-300 mb-2" />
        <p className="text-sm font-medium text-slate-600">Todavía no hay lotes</p>
        <p className="text-xs text-slate-400 mt-1">Se crean desde “A transferir” al generar el archivo para el banco.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-lg divide-y">
      {lotes.map((l) => {
        const completo = l.ordenes > 0 && l.conComprobante === l.ordenes
        return (
          <Link key={l.id} href={`/pagos/lotes/${l.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
            <div className="w-16">
              <p className="text-sm font-semibold text-slate-800">Lote {l.numero}</p>
              <p className="text-[11px] text-slate-400">{fechaCorta(l.fecha)}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-700">
                {l.ordenes} transferencia{l.ordenes !== 1 && 's'}
              </p>
              <div className="mt-1 h-1.5 w-40 rounded-full bg-slate-100 overflow-hidden" title={`${l.conComprobante} de ${l.ordenes} con comprobante`}>
                <div
                  className={cn('h-full rounded-full', completo ? 'bg-emerald-500' : 'bg-blue-500')}
                  style={{ width: `${l.ordenes ? (l.conComprobante / l.ordenes) * 100 : 0}%` }}
                />
              </div>
            </div>
            <span
              className={cn(
                'text-[11px] font-medium px-2 py-0.5 rounded-full',
                completo ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
              )}
            >
              {completo ? 'Conciliado' : `${l.conComprobante}/${l.ordenes} comprobantes`}
            </span>
            <span className="text-sm font-semibold tabular-nums text-slate-900 w-36 text-right">{formatCurrency(l.montoTotal)}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </Link>
        )
      })}
    </div>
  )
}
