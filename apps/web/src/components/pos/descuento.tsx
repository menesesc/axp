'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

/**
 * Descuento sobre la mesa.
 *
 * En porcentaje casi siempre (el 10% del personal, el 15% de la promo) y en
 * pesos cuando se arregla un problema: "le saco cinco mil por la demora".
 * Queda en el pedido entero y no repartido en los platos, así el ticket dice
 * una cosa sola y se puede explicar.
 */
export function Descuento({
  total,
  pct,
  importe,
  onCerrar,
  onAplicar,
}: {
  total: number
  pct: number
  importe: number
  onCerrar: () => void
  onAplicar: (pct: number, importe: number, motivo: string) => void
}) {
  const [p, setP] = useState(String(pct || ''))
  const [i, setI] = useState(String(importe || ''))
  const [motivo, setMotivo] = useState('')

  const nPct = Math.min(100, Number(p) || 0)
  const nImp = Number(i) || 0
  const resultado = Math.max(0, total * (1 - nPct / 100) - nImp)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <div className="mb-3 flex items-start justify-between">
          <p className="text-lg font-bold">Descuento</p>
          <button onClick={onCerrar} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {[5, 10, 15, 20, 25, 50].map((x) => (
            <button
              key={x}
              onClick={() => { setP(String(x)); setI('') }}
              className={cn(
                'h-11 w-16 rounded-xl text-base font-bold',
                nPct === x ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              )}
            >
              {x}%
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            Porcentaje
            <input
              value={p}
              onChange={(e) => setP(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="h-12 w-full rounded-xl border border-slate-200 px-3 text-right text-lg font-semibold tabular-nums outline-none focus:border-slate-900"
            />
          </label>
          <label className="text-xs text-slate-500">
            O en pesos
            <input
              value={i}
              onChange={(e) => setI(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="h-12 w-full rounded-xl border border-slate-200 px-3 text-right text-lg font-semibold tabular-nums outline-none focus:border-slate-900"
            />
          </label>
        </div>

        <label className="mt-3 block text-xs text-slate-500">
          Motivo
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Personal, demora, promoción…"
            className="h-12 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-slate-900"
          />
        </label>

        <div className="mt-4 flex items-baseline justify-between rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-500">Queda en</span>
          <span className="text-xl font-bold tabular-nums">
            ${Math.round(resultado).toLocaleString('es-AR')}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          {(pct > 0 || importe > 0) && (
            <button
              onClick={() => onAplicar(0, 0, 'Se quitó el descuento')}
              className="h-14 flex-1 rounded-xl bg-slate-100 font-semibold text-slate-600"
            >
              Quitar
            </button>
          )}
          <button
            onClick={() => onAplicar(nPct, nImp, motivo)}
            className="h-14 flex-[2] rounded-xl bg-slate-900 font-semibold text-white"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
