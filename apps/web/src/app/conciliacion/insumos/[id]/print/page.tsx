'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { defaultRange, fmtAR, fmtNumAR } from '@/components/sales/shared'
import { Printer } from 'lucide-react'

interface Detalle {
  insumo: { id: string; nombre: string; unidadBase: string }
  resumen: {
    consumoTeorico: number
    compradoBase: number
    costoComprado: number
    costoUnitario: number | null
    diferencia: number
    diferenciaPct: number | null
  }
  serie: Array<{ semana: string; consumo: number; comprado: number; costoUnitario: number | null }>
  stock: {
    conteos: Array<{ id: string; fecha: string; cantidad: number; nota: string | null }>
    stockTeoricoActual: number | null
    consumoDiario: number
    diasCobertura: number | null
    mermaRecetaConfigurada: boolean
    mermaIntervalo: {
      desde: string; hasta: string; stockInicial: number; comprado: number
      consumoTeorico: number; stockFinal: number; merma: number; mermaPct: number | null
    } | null
  }
}
interface MargenP {
  productMasterId: string; nombre: string; rubroNombre: string | null; unidadesVendidas: number
  precioVenta: number | null; costoReceta: number; foodCostPct: number | null
  margenUnitario: number | null; margenTotal: number | null; costoIncompleto: boolean
}
interface Alias { id: string; patron: string; factorBase: number; unidadOrigen: string | null }
interface RecetaProd { productMasterId: string; nombre: string; cantidad: number; unidad: string; mermaPct: number }

function fmtFecha(s: string): string {
  const p = String(s).slice(0, 10).split('-')
  if (p.length !== 3) return String(s)
  return `${p[2]}/${p[1]}/${p[0]}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="text-[13px] font-semibold text-slate-800 border-b border-slate-300 pb-1 mb-2 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  )
}

const th = 'text-left px-2 py-1 font-medium text-slate-500 border-b border-slate-300'
const thr = 'text-right px-2 py-1 font-medium text-slate-500 border-b border-slate-300'
const td = 'px-2 py-1 text-slate-700 border-b border-slate-100'
const tdr = 'px-2 py-1 text-right text-slate-700 border-b border-slate-100'

export default function InsumoPrintPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { from?: string; to?: string }
}) {
  const id = params.id
  const def = defaultRange()
  const from = searchParams.from || def.from
  const to = searchParams.to || def.to
  const q = `from=${from}&to=${to}`

  const detalle = useQuery({
    queryKey: ['print-detalle', id, from, to],
    queryFn: async () => {
      const r = await fetch(`/api/conciliacion/insumos/${id}/detalle?${q}`)
      if (!r.ok) throw new Error('Error')
      return r.json() as Promise<Detalle>
    },
  })
  const margen = useQuery({
    queryKey: ['print-margen', id, from, to],
    queryFn: async () => {
      const r = await fetch(`/api/conciliacion/margen?${q}&insumoId=${id}`)
      if (!r.ok) throw new Error('Error')
      return r.json() as Promise<{ productos: MargenP[] }>
    },
  })
  const alias = useQuery({
    queryKey: ['print-alias', id],
    queryFn: async () => {
      const r = await fetch(`/api/conciliacion/insumos/${id}/alias`)
      if (!r.ok) throw new Error('Error')
      return r.json() as Promise<{ alias: Alias[] }>
    },
  })
  const recetas = useQuery({
    queryKey: ['print-recetas', id],
    queryFn: async () => {
      const r = await fetch(`/api/conciliacion/insumos/${id}/recetas`)
      if (!r.ok) throw new Error('Error')
      return r.json() as Promise<{ productos: RecetaProd[] }>
    },
  })

  const listo = detalle.isSuccess && margen.isSuccess && alias.isSuccess && recetas.isSuccess
  const printedRef = useRef(false)
  useEffect(() => {
    if (listo && !printedRef.current) {
      printedRef.current = true
      const t = setTimeout(() => window.print(), 500)
      return () => clearTimeout(t)
    }
    return undefined
  }, [listo])

  if (detalle.isLoading || !detalle.data) {
    return <div className="p-8 text-sm text-slate-400">Cargando informe...</div>
  }

  const d = detalle.data
  const u = d.insumo.unidadBase
  const r = d.resumen
  const s = d.stock
  const m = s.mermaIntervalo
  const stockProbable = m ? m.stockInicial + m.comprado - m.consumoTeorico : null
  const cobertura = s.diasCobertura ?? (s.consumoDiario > 0 ? r.compradoBase / s.consumoDiario : null)
  const productos = margen.data?.productos ?? []
  const aliasList = alias.data?.alias ?? []
  const recetasList = recetas.data?.productos ?? []

  const kpis: Array<[string, string]> = [
    ['Consumo teórico', `${fmtNumAR(r.consumoTeorico, 2)} ${u}`],
    ['Comprado', `${fmtNumAR(r.compradoBase, 2)} ${u}`],
    ['Costo comprado', fmtAR(r.costoComprado)],
    ['Costo unitario', r.costoUnitario != null ? `${fmtAR(r.costoUnitario)}/${u}` : '—'],
    ['Variación de stock', `${r.diferencia >= 0 ? '+' : ''}${fmtNumAR(r.diferencia, 2)} ${u}${r.diferenciaPct != null ? ` (${r.diferenciaPct >= 0 ? '+' : ''}${fmtNumAR(r.diferenciaPct, 1)}%)` : ''}`],
    ['Cobertura', cobertura != null ? `${fmtNumAR(cobertura, 0)} días` : '—'],
    ['Stock probable hoy', s.stockTeoricoActual != null ? `${fmtNumAR(s.stockTeoricoActual, 2)} ${u}` : '— (sin conteo)'],
  ]

  return (
    <div className="bg-white text-slate-900 mx-auto" style={{ maxWidth: '190mm', padding: '0 6mm' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen { .sheet { padding-top: 16px; padding-bottom: 48px; } }
      `}</style>

      <div className="no-print flex items-center justify-between py-3 mb-3 border-b border-slate-200">
        <span className="text-sm text-slate-500">Informe de insumo (A4)</span>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-md px-3 py-1.5">
          <Printer className="h-4 w-4" /> Imprimir
        </button>
      </div>

      <div className="sheet">
        {/* Encabezado */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900">{d.insumo.nombre}</h1>
          <p className="text-[12px] text-slate-500">
            Informe de conciliación · Unidad base {u} · Período {fmtFecha(from)} – {fmtFecha(to)} · Generado {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>

        {/* Resumen */}
        <Section title="Resumen del período">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {kpis.map(([k, v]) => (
              <div key={k} className="border border-slate-200 rounded px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{k}</p>
                <p className="text-[13px] font-semibold text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Stock / desvío */}
        <Section title="Stock e inventario">
          {m && stockProbable != null ? (
            <p className="text-[12px] text-slate-700">
              Desvío {fmtFecha(m.desde)} → {fmtFecha(m.hasta)}: <span className="font-semibold">{m.merma >= 0 ? '+' : ''}{fmtNumAR(m.merma, 2)} {u}{m.mermaPct != null ? ` (${fmtNumAR(m.mermaPct, 1)}%)` : ''}</span>.{' '}
              Stock probable {fmtNumAR(stockProbable, 2)} {u} (inicial {fmtNumAR(m.stockInicial, 2)} + comprado {fmtNumAR(m.comprado, 2)} − consumo {fmtNumAR(m.consumoTeorico, 2)}) · contado {fmtNumAR(m.stockFinal, 2)} {u}.
              {!s.mermaRecetaConfigurada && ' (La receta no tiene merma configurada: el desvío sale inflado.)'}
            </p>
          ) : (
            <p className="text-[12px] text-slate-500">Sin dos conteos en el período para calcular desvío.</p>
          )}
          {s.conteos.length > 0 && (
            <table className="w-full text-[12px] mt-2">
              <thead><tr><th className={th}>Conteo</th><th className={thr}>Stock ({u})</th><th className={th}>Nota</th></tr></thead>
              <tbody>
                {s.conteos.map((c) => (
                  <tr key={c.id}><td className={td}>{fmtFecha(c.fecha)}</td><td className={tdr}>{fmtNumAR(c.cantidad, 2)}</td><td className={td}>{c.nota ?? ''}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Margen por producto */}
        <Section title="Margen de los productos que usan el insumo">
          {productos.length === 0 ? (
            <p className="text-[12px] text-slate-500">Sin productos con receta y ventas en el período.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  <th className={th}>Producto</th>
                  <th className={thr}>Vendidas</th>
                  <th className={thr}>Precio neto</th>
                  <th className={thr}>Costo receta</th>
                  <th className={thr}>Food cost</th>
                  <th className={thr}>Margen u.</th>
                  <th className={thr}>Margen total</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.productMasterId}>
                    <td className={td}>{p.nombre}{p.costoIncompleto ? ' *' : ''}</td>
                    <td className={tdr}>{fmtNumAR(p.unidadesVendidas)}</td>
                    <td className={tdr}>{fmtAR(p.precioVenta)}</td>
                    <td className={tdr}>{fmtAR(p.costoReceta)}</td>
                    <td className={tdr}>{p.foodCostPct == null ? '—' : `${fmtNumAR(p.foodCostPct, 1)}%`}</td>
                    <td className={tdr}>{fmtAR(p.margenUnitario)}</td>
                    <td className={tdr}>{fmtAR(p.margenTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-slate-400 mt-1">
            {productos.some((p) => p.costoIncompleto) && '* costo incompleto (algún insumo sin compra en el período). '}
            Margen y food cost netos (sin IVA): el precio se neteó con el IVA de venta de los cierres; el costo de factura ya es neto.
          </p>
        </Section>

        {/* Recetas */}
        <Section title="Recetas en venta">
          {recetasList.length === 0 ? (
            <p className="text-[12px] text-slate-500">No se usa en ninguna receta.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead><tr><th className={th}>Producto</th><th className={thr}>Cantidad/u</th><th className={th}>Unidad</th><th className={thr}>Merma</th></tr></thead>
              <tbody>
                {recetasList.map((p) => (
                  <tr key={p.productMasterId}>
                    <td className={td}>{p.nombre}</td>
                    <td className={tdr}>{fmtNumAR(p.cantidad, 3)}</td>
                    <td className={td}>{p.unidad}</td>
                    <td className={tdr}>{fmtNumAR(p.mermaPct, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Compras / alias */}
        <Section title="Descripciones de compra (alias)">
          {aliasList.length === 0 ? (
            <p className="text-[12px] text-slate-500">Sin alias de compra.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead><tr><th className={th}>Patrón en factura</th><th className={thr}>Factor → {u}</th><th className={th}>Unidad origen</th></tr></thead>
              <tbody>
                {aliasList.map((a) => (
                  <tr key={a.id}><td className={td}>{a.patron}</td><td className={tdr}>×{fmtNumAR(a.factorBase, 2)}</td><td className={td}>{a.unidadOrigen ?? ''}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Serie semanal */}
        <Section title="Evolución semanal">
          {d.serie.length === 0 ? (
            <p className="text-[12px] text-slate-500">Sin movimientos en el período.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead><tr><th className={th}>Semana (desde)</th><th className={thr}>Consumo ({u})</th><th className={thr}>Comprado ({u})</th><th className={thr}>Costo unit.</th></tr></thead>
              <tbody>
                {d.serie.map((w) => (
                  <tr key={w.semana}>
                    <td className={td}>{fmtFecha(w.semana)}</td>
                    <td className={tdr}>{fmtNumAR(w.consumo, 2)}</td>
                    <td className={tdr}>{fmtNumAR(w.comprado, 2)}</td>
                    <td className={tdr}>{w.costoUnitario != null ? fmtAR(w.costoUnitario) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  )
}
