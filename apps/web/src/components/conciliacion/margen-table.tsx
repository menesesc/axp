'use client'

import { useMemo, useState } from 'react'
import { fmtAR, fmtNumAR } from '@/components/sales/shared'
import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react'

export interface MargenProducto {
  productMasterId: string
  nombre: string
  rubroNombre: string | null
  unidadesVendidas: number
  precioVenta: number | null
  precioVentaBruto?: number | null
  costoReceta: number
  foodCostPct: number | null
  margenUnitario: number | null
  margenTotal: number | null
  costoIncompleto: boolean
}

type SortKey = 'nombre' | 'unidadesVendidas' | 'precioVenta' | 'costoReceta' | 'foodCostPct' | 'margenUnitario' | 'margenTotal'

function foodCostColor(pct: number | null): string {
  if (pct == null) return 'text-slate-300'
  if (pct <= 30) return 'text-emerald-600'
  if (pct <= 40) return 'text-amber-600'
  return 'text-red-600'
}

const COLS: Array<{ key: SortKey; label: string; align: 'left' | 'right'; title?: string }> = [
  { key: 'nombre', label: 'Producto', align: 'left' },
  { key: 'unidadesVendidas', label: 'Vendidas', align: 'right' },
  { key: 'precioVenta', label: 'Precio neto', align: 'right', title: 'Precio de venta neto (sin IVA), comparable al costo' },
  { key: 'costoReceta', label: 'Costo receta', align: 'right' },
  { key: 'foodCostPct', label: 'Costo %', align: 'right', title: 'Costo de receta sobre precio neto (incluye comida y bebida)' },
  { key: 'margenUnitario', label: 'Margen u.', align: 'right' },
  { key: 'margenTotal', label: 'Margen total', align: 'right' },
]

export function MargenTable({ productos }: { productos: MargenProducto[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'margenTotal', dir: 'desc' })

  const sorted = useMemo(() => {
    const arr = [...productos]
    arr.sort((a, b) => {
      const va = a[sort.key]
      const vb = b[sort.key]
      // Nulos siempre al final, sin importar la dirección.
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [productos, sort])

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'nombre' ? 'asc' : 'desc' }))
  }

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
            {COLS.map((c) => {
              const active = sort.key === c.key
              return (
                <th key={c.key} className={`px-4 py-2.5 font-medium ${c.align === 'left' ? 'text-left' : 'text-right'}`} title={c.title}>
                  <button
                    onClick={() => toggle(c.key)}
                    className={`group inline-flex items-center gap-1 hover:text-slate-700 transition ${c.align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-slate-700' : ''}`}
                  >
                    {c.label}
                    {active ? (
                      sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
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
              <td className="px-4 py-2.5 text-right text-slate-600">
                {fmtAR(p.precioVenta)}
                {p.precioVentaBruto != null && (
                  <span className="block text-[11px] text-slate-400">menú {fmtAR(p.precioVentaBruto)}</span>
                )}
              </td>
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
        = costo incompleto (algún insumo sin compra en el período). Costo % coloreado: ≤30% verde, ≤40% ámbar, &gt;40% rojo.
        Margen y costo % <span className="font-medium">netos (sin IVA)</span>: el precio se descuenta con el IVA de venta de los cierres; el costo de factura ya viene neto.
      </p>
    </div>
  )
}
