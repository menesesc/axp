'use client'

import { fmtAR, fmtNumAR } from '@/components/sales/shared'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

export interface ConciliacionItem {
  insumoId: string
  nombre: string
  unidadBase: string
  consumoTeorico: number
  compradoBase: number
  costoComprado: number
  costoUnitario: number | null
  diferencia: number
  diferenciaPct: number | null
  incidencia: boolean
}

export function ConciliacionTable({ items }: { items: ConciliacionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">
        Sin datos para el período. Cargá recetas y alias de insumos, o ampliá el rango de fechas.
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Insumo</th>
            <th className="text-right px-4 py-2.5 font-medium">Consumo teórico</th>
            <th className="text-right px-4 py-2.5 font-medium">Comprado</th>
            <th className="text-right px-4 py-2.5 font-medium">Diferencia</th>
            <th className="text-right px-4 py-2.5 font-medium">Dif. %</th>
            <th className="text-right px-4 py-2.5 font-medium">$ comprado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const pos = it.diferencia >= 0
            return (
              <tr key={it.insumoId} className={`border-b border-slate-100 ${it.incidencia ? 'bg-amber-50/60' : ''}`}>
                <td className="px-4 py-2.5">
                  <span className="text-slate-800">{it.nombre}</span>
                  {it.incidencia && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                      incidencia
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">
                  {fmtNumAR(it.consumoTeorico, 2)} <span className="text-slate-400 text-xs">{it.unidadBase}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-slate-600">
                  {fmtNumAR(it.compradoBase, 2)} <span className="text-slate-400 text-xs">{it.unidadBase}</span>
                </td>
                <td className={`px-4 py-2.5 text-right font-medium ${pos ? 'text-slate-700' : 'text-red-600'}`}>
                  {pos ? '+' : ''}{fmtNumAR(it.diferencia, 2)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {it.diferenciaPct == null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className={`inline-flex items-center gap-0.5 font-medium ${it.incidencia ? (pos ? 'text-amber-700' : 'text-red-600') : 'text-slate-500'}`}>
                      {pos ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {fmtNumAR(Math.abs(it.diferenciaPct), 1)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-500">{fmtAR(it.costoComprado)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
