'use client'

import { fmtAR, fmtNumAR } from '@/components/sales/shared'
import { AlertTriangle, ShieldCheck } from 'lucide-react'

interface Cobertura {
  coberturaPct: number
  unidadesTotales: number
  unidadesConReceta: number
  productosSinReceta: Array<{ productMasterId: string; nombre: string; unidades: number; importe: number }>
  insumosSinCompra: Array<{ insumoId: string; nombre: string; consumoTeorico: number; unidadBase: string }>
}

export function CoberturaCard({ cobertura }: { cobertura: Cobertura }) {
  const pct = cobertura.coberturaPct
  const color = pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'red'
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-500',
    amber: 'text-amber-600 bg-amber-500',
    red: 'text-red-600 bg-red-500',
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <ShieldCheck className={`h-4 w-4 ${colorMap[color]!.split(' ')[0]}`} />
            Cobertura del cuadre
          </span>
          <span className={`text-sm font-semibold ${colorMap[color]!.split(' ')[0]}`}>
            {fmtNumAR(pct, 1)}%
          </span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${colorMap[color]!.split(' ')[1]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          {fmtNumAR(cobertura.unidadesConReceta)} de {fmtNumAR(cobertura.unidadesTotales)} unidades vendidas provienen de productos con receta.
        </p>
      </div>

      {cobertura.productosSinReceta.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Productos vendidos sin receta ({cobertura.productosSinReceta.length})
          </p>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {cobertura.productosSinReceta.slice(0, 20).map((p) => (
              <li key={p.productMasterId} className="flex items-center justify-between text-xs text-slate-500">
                <span className="truncate">{p.nombre}</span>
                <span className="shrink-0 ml-2">{fmtNumAR(p.unidades)} u · {fmtAR(p.importe)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cobertura.insumosSinCompra.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            Insumos consumidos sin compra ({cobertura.insumosSinCompra.length})
          </p>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {cobertura.insumosSinCompra.map((i) => (
              <li key={i.insumoId} className="flex items-center justify-between text-xs text-slate-500">
                <span className="truncate">{i.nombre}</span>
                <span className="shrink-0 ml-2">{fmtNumAR(i.consumoTeorico, 2)} {i.unidadBase}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400 mt-1">Falta un alias o no hubo compras en el período.</p>
        </div>
      )}
    </div>
  )
}
