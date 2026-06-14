'use client'

import { fmtAR, fmtNumAR } from '@/components/sales/shared'
import { AlertTriangle } from 'lucide-react'

export interface MargenProducto {
  productMasterId: string
  nombre: string
  rubroNombre: string | null
  unidadesVendidas: number
  precioVenta: number | null
  costoReceta: number
  foodCostPct: number | null
  margenUnitario: number | null
  margenTotal: number | null
  costoIncompleto: boolean
}

function foodCostColor(pct: number | null): string {
  if (pct == null) return 'text-slate-300'
  if (pct <= 30) return 'text-emerald-600'
  if (pct <= 40) return 'text-amber-600'
  return 'text-red-600'
}

export function MargenTable({ productos }: { productos: MargenProducto[] }) {
  if (productos.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">
        Sin productos con receta y ventas en el período.
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Producto</th>
            <th className="text-right px-4 py-2.5 font-medium">Vendidas</th>
            <th className="text-right px-4 py-2.5 font-medium">Precio</th>
            <th className="text-right px-4 py-2.5 font-medium">Costo receta</th>
            <th className="text-right px-4 py-2.5 font-medium">Food cost</th>
            <th className="text-right px-4 py-2.5 font-medium">Margen u.</th>
            <th className="text-right px-4 py-2.5 font-medium">Margen total</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.productMasterId} className="border-b border-slate-100">
              <td className="px-4 py-2.5">
                <span className="text-slate-800">{p.nombre}</span>
                {p.costoIncompleto && (
                  <span title="Falta costo de uno o más insumos en el período" className="ml-1.5 inline-flex">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  </span>
                )}
                {p.rubroNombre && <span className="block text-[11px] text-slate-400">{p.rubroNombre}</span>}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(p.unidadesVendidas)}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{fmtAR(p.precioVenta)}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{fmtAR(p.costoReceta)}</td>
              <td className={`px-4 py-2.5 text-right font-medium ${foodCostColor(p.foodCostPct)}`}>
                {p.foodCostPct == null ? '—' : `${fmtNumAR(p.foodCostPct, 1)}%`}
              </td>
              <td className="px-4 py-2.5 text-right text-slate-700">{fmtAR(p.margenUnitario)}</td>
              <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtAR(p.margenTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-400 px-4 py-2 border-t border-slate-100">
        <AlertTriangle className="h-3 w-3 text-amber-500 inline mr-1" />
        = costo incompleto (algún insumo sin compra en el período). Food cost coloreado: ≤30% verde, ≤40% ámbar, &gt;40% rojo.
      </p>
    </div>
  )
}
