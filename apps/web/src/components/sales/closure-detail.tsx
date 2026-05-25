'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { fmtAR, fmtNumAR } from './shared'

interface ClosureDetailData {
  closure: {
    id: string
    fecha: string
    nroCierre: number
    turnoNombre: string
    sucursal: string | null
    empresaNombre: string | null
    usuarioApertura: string | null
    horaApertura: string | null
    usuarioCierre: string | null
    horaCierre: string | null
    totalVentas: string | null
    cantTickets: number | null
    cantCubiertos: string | null
    netoGravado: string | null
    ivaTotal: string | null
    efectivo: string | null
    ctaCte: string | null
    tarjetas: string | null
    descuentoTotal: string | null
    pdfR2Key: string | null
    payments: Array<{ id: string; formaCobro: string; sigla: string | null; total: string; cantidad: number }>
    waiters: Array<{ id: string; codigo: string; nombre: string; importe: string; cantVentas: number; cantCubiertos: number }>
    movements: Array<{ id: string; tipo: 'INGRESO' | 'EGRESO'; conceptoCodigo: string; detalle: string; total: string }>
    items: Array<{
      id: string
      rubroCodigo: string | null
      rubroNombre: string | null
      codigo: string
      nombre: string
      unidades: string
      importe: string
    }>
  }
}

export function ClosureDetail({ closureId }: { closureId: string }) {
  const queryClient = useQueryClient()
  const [reparsing, setReparsing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sales-closure', closureId],
    queryFn: async () => {
      const res = await fetch(`/api/sales/closures/${closureId}`)
      if (!res.ok) throw new Error('No se pudo cargar el cierre')
      return res.json() as Promise<ClosureDetailData>
    },
    staleTime: 60_000,
  })

  async function handleReparse() {
    setReparsing(true)
    try {
      const res = await fetch(`/api/sales/closures/${closureId}/reparse`, { method: 'POST' })
      const body = await res.json()
      if (res.ok && body.status === 'OK') {
        toast.success(body.message ?? 'Cierre re-parseado')
        queryClient.invalidateQueries({ queryKey: ['sales-closure', closureId] })
        queryClient.invalidateQueries({ queryKey: ['sales-closures'] })
        queryClient.invalidateQueries({ queryKey: ['sales-audit-summary'] })
        queryClient.invalidateQueries({ queryKey: ['sales-audit-events'] })
      } else {
        toast.error(body.message || 'Error re-parseando')
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setReparsing(false)
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Cargando detalle...</div>
  if (!data) return null
  const c = data.closure

  // Agrupar items por rubro
  const byRubro = new Map<string, typeof c.items>()
  for (const it of c.items) {
    const key = it.rubroNombre ?? 'Sin rubro'
    const arr = byRubro.get(key) ?? []
    arr.push(it)
    byRubro.set(key, arr)
  }

  return (
    <div className="p-6 space-y-6 text-sm">
      {/* Header info + botón reparsear */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          <Info label="Apertura" value={c.usuarioApertura ? `${c.horaApertura} — ${c.usuarioApertura}` : '—'} />
          <Info label="Cierre" value={c.usuarioCierre ? `${c.horaCierre} — ${c.usuarioCierre}` : '—'} />
          <Info label="Neto" value={fmtAR(c.netoGravado)} />
          <Info label="IVA" value={fmtAR(c.ivaTotal)} />
        </div>
        <Button onClick={handleReparse} disabled={reparsing} variant="outline" size="sm">
          {reparsing ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Re-parseando...</>
          ) : (
            <><RefreshCw className="h-4 w-4 mr-1.5" /> Re-parsear</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Formas de pago */}
        <Card title="Formas de cobro">
          <table className="w-full text-xs">
            <tbody>
              {c.payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5">{p.formaCobro}</td>
                  <td className="py-1.5 text-right text-slate-500">{p.cantidad}</td>
                  <td className="py-1.5 text-right font-medium">{fmtAR(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Mozos */}
        <Card title="Mozos">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400">
                <th className="text-left font-medium py-1">Nombre</th>
                <th className="text-right font-medium py-1">Vtas</th>
                <th className="text-right font-medium py-1">Cub.</th>
                <th className="text-right font-medium py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {c.waiters.map((w) => (
                <tr key={w.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5">{w.nombre}</td>
                  <td className="py-1.5 text-right text-slate-500">{w.cantVentas}</td>
                  <td className="py-1.5 text-right text-slate-500">{w.cantCubiertos}</td>
                  <td className="py-1.5 text-right font-medium">{fmtAR(w.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Movimientos */}
        <Card title="Movimientos">
          <table className="w-full text-xs">
            <tbody>
              {c.movements.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded mr-1 ${
                      m.tipo === 'INGRESO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {m.tipo === 'INGRESO' ? 'IN' : 'OUT'}
                    </span>
                    {m.detalle}
                  </td>
                  <td className="py-1.5 text-right font-medium">{fmtAR(m.total)}</td>
                </tr>
              ))}
              {c.movements.length === 0 && (
                <tr><td className="py-2 text-slate-400 italic text-center">Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Artículos por rubro */}
      <div>
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Artículos vendidos</h4>
        <div className="bg-white rounded border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr className="text-slate-500">
                <th className="text-left px-3 py-2 font-medium">Rubro</th>
                <th className="text-left px-3 py-2 font-medium">Cód.</th>
                <th className="text-left px-3 py-2 font-medium">Producto</th>
                <th className="text-right px-3 py-2 font-medium w-20">Unid.</th>
                <th className="text-right px-3 py-2 font-medium w-28">Importe</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byRubro.entries()).map(([rubro, items]) => (
                <RubroBlock key={rubro} rubro={rubro} items={items} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-slate-700 mt-0.5">{value}</p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded border border-slate-200 p-3">
      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </div>
  )
}

function RubroBlock({
  rubro,
  items,
}: {
  rubro: string
  items: Array<{ id: string; codigo: string; nombre: string; unidades: string; importe: string }>
}) {
  const totalImporte = items.reduce((s, i) => s + Number(i.importe), 0)
  const totalUnid = items.reduce((s, i) => s + Number(i.unidades), 0)
  return (
    <>
      <tr className="bg-slate-50/70">
        <td className="px-3 py-1.5 text-slate-600 font-medium" colSpan={3}>{rubro}</td>
        <td className="px-3 py-1.5 text-right text-slate-500">{fmtNumAR(totalUnid)}</td>
        <td className="px-3 py-1.5 text-right text-slate-700 font-medium">{fmtAR(totalImporte)}</td>
      </tr>
      {items.map((it) => (
        <tr key={it.id} className="border-t border-slate-100">
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-slate-400">{it.codigo}</td>
          <td className="px-3 py-1.5 text-slate-700">{it.nombre}</td>
          <td className="px-3 py-1.5 text-right text-slate-600">{fmtNumAR(Number(it.unidades))}</td>
          <td className="px-3 py-1.5 text-right text-slate-700">{fmtAR(it.importe)}</td>
        </tr>
      ))}
    </>
  )
}
