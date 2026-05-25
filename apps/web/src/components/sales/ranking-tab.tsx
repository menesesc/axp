'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, defaultRange } from './shared'
import { Package } from 'lucide-react'

interface RankingItem {
  codigo?: string
  nombre?: string
  rubroCodigo: string | null
  rubroNombre: string | null
  unidades: number
  importe: number
}

export function RankingTab() {
  const [{ from, to }, setRange] = useState(defaultRange())
  const [groupBy, setGroupBy] = useState<'item' | 'rubro'>('item')

  const params = useMemo(() => {
    const p = new URLSearchParams({ from, to, groupBy, limit: '100' })
    return p.toString()
  }, [from, to, groupBy])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-ranking', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/ranking?${params}`)
      if (!res.ok) throw new Error('Error cargando ranking')
      return res.json() as Promise<{
        ranking: RankingItem[]
        groupBy: 'item' | 'rubro'
        total: { unidades: number; importe: number }
      }>
    },
    staleTime: 60_000,
  })

  const items = data?.ranking ?? []
  const maxImporte = items[0]?.importe ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DateRange from={from} to={to} onChange={setRange} />
        <div className="inline-flex bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setGroupBy('item')}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              groupBy === 'item' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
            }`}
          >
            Por producto
          </button>
          <button
            onClick={() => setGroupBy('rubro')}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              groupBy === 'rubro' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
            }`}
          >
            Por rubro
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">Sin datos en este rango</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium w-10">#</th>
                {groupBy === 'item' && <th className="text-left px-4 py-2.5 font-medium">Código</th>}
                <th className="text-left px-4 py-2.5 font-medium">{groupBy === 'item' ? 'Producto' : 'Rubro'}</th>
                {groupBy === 'item' && <th className="text-left px-4 py-2.5 font-medium">Rubro</th>}
                <th className="text-right px-4 py-2.5 font-medium w-24">Unidades</th>
                <th className="text-right px-4 py-2.5 font-medium w-32">Importe</th>
                <th className="px-4 py-2.5 w-48">Participación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const pct = maxImporte > 0 ? (it.importe / maxImporte) * 100 : 0
                return (
                  <tr key={`${it.codigo ?? ''}-${it.rubroCodigo ?? ''}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
                    {groupBy === 'item' && <td className="px-4 py-2.5 text-slate-500 text-xs">{it.codigo}</td>}
                    <td className="px-4 py-2.5 text-slate-700">{groupBy === 'item' ? it.nombre : it.rubroNombre}</td>
                    {groupBy === 'item' && <td className="px-4 py-2.5 text-slate-500 text-xs">{it.rubroNombre ?? '—'}</td>}
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(it.unidades, 1)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtAR(it.importe)}</td>
                    <td className="px-4 py-2.5">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {data?.total && (
                <tr className="bg-slate-50 font-medium">
                  <td colSpan={groupBy === 'item' ? 4 : 2} className="px-4 py-2.5 text-slate-600 text-right">Total mostrado</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtNumAR(data.total.unidades, 1)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">{fmtAR(data.total.importe)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
