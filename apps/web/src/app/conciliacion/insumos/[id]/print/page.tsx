'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
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
  consumoPorDia: Array<{ fecha: string; consumo: number }>
  compradoPorDia: Array<{ fecha: string; comprado: number }>
  stock: {
    conteos: Array<{ id: string; fecha: string; cantidad: number; nota: string | null }>
    stockTeoricoActual: number | null
    consumoDiario: number
    diasCobertura: number | null
    mermaRecetaConfigurada: boolean
    stockSerie: Array<{ fecha: string; teorico: number | null; conteo: number | null; conteoOk: boolean | null; desvio: number | null }>
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
interface Compra {
  fecha: string | null; numero: string | null; proveedor: string | null; descripcion: string
  cantidad: number | null; unidad: string | null; precioUnitario: number | null
  subtotal: number | null; cantidadBase: number | null; precioBase: number | null
}

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
  const compras = useQuery({
    queryKey: ['print-compras', id, from, to],
    queryFn: async () => {
      const r = await fetch(`/api/conciliacion/insumos/${id}/compras?${q}`)
      if (!r.ok) throw new Error('Error')
      return r.json() as Promise<{ compras: Compra[]; totales: { cantidadBase: number; costo: number } }>
    },
  })

  const listo = detalle.isSuccess && margen.isSuccess && alias.isSuccess && recetas.isSuccess && compras.isSuccess
  const printedRef = useRef(false)
  useEffect(() => {
    if (listo && !printedRef.current) {
      printedRef.current = true
      // Esperar a que los gráficos terminen de pintar antes de abrir el diálogo.
      const t = setTimeout(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
      }, 900)
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
  const comprasList = compras.data?.compras ?? []
  const comprasTot = compras.data?.totales ?? { cantidadBase: 0, costo: 0 }

  // Margen promedio ponderado por ventas (neto, sin IVA).
  const conPrecio = productos.filter((p) => p.precioVenta != null)
  const ventasNetas = conPrecio.reduce((acc, p) => acc + (p.precioVenta! * p.unidadesVendidas), 0)
  const costoTot = conPrecio.reduce((acc, p) => acc + (p.costoReceta * p.unidadesVendidas), 0)
  const margenTotPeriodo = conPrecio.reduce((acc, p) => acc + (p.margenTotal ?? 0), 0)
  const foodCostProm = ventasNetas > 0 ? (costoTot / ventasNetas) * 100 : null
  const margenPromPct = ventasNetas > 0 ? (margenTotPeriodo / ventasNetas) * 100 : null

  const truncProv = (name: string | null) => {
    const t = name ?? '—'
    return t.length > 20 ? t.slice(0, 20) + '…' : t
  }
  // Serie diaria combinada (consumo + comprado) sobre todos los días del rango.
  const consumoByDay = new Map(d.consumoPorDia.map((x) => [x.fecha, x.consumo]))
  const compradoByDay = new Map(d.compradoPorDia.map((x) => [x.fecha, x.comprado]))
  const daily = s.stockSerie.map((p) => ({
    fecha: p.fecha,
    consumo: consumoByDay.get(p.fecha) ?? 0,
    comprado: compradoByDay.get(p.fecha) ?? 0,
  }))
  // Granularidad del gráfico de evolución: semanal si el rango > 2 semanas, si no diario.
  const totalDias = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
  const weekly = totalDias > 14
  const evolData = weekly
    ? d.serie.map((w) => ({ label: w.semana, consumo: w.consumo, comprado: w.comprado }))
    : daily.map((x) => ({ label: x.fecha, consumo: x.consumo, comprado: x.comprado }))
  const hayStockSerie = s.stockSerie.some((p) => p.teorico != null)
  // Punto de conteo real: verde si coincide con el teórico (±5%), rojo si hay desvío.
  const renderConteoDot = (props: { cx?: number; cy?: number; index?: number; payload?: { conteo: number | null; conteoOk: boolean | null } }) => {
    const { cx, cy, index, payload } = props
    if (payload?.conteo == null || cx == null || cy == null) return <g key={`e${index}`} />
    const ok = payload.conteoOk !== false
    return <circle key={`d${index}`} cx={cx} cy={cy} r={4} fill={ok ? '#10b981' : '#ef4444'} stroke="#ffffff" strokeWidth={1} />
  }

  const kpis: Array<[string, string]> = [
    ['Consumo teórico', `${fmtNumAR(r.consumoTeorico, 2)} ${u}`],
    ['Comprado', `${fmtNumAR(r.compradoBase, 2)} ${u}`],
    ['Costo comprado', fmtAR(r.costoComprado)],
    ['Costo unitario', r.costoUnitario != null ? `${fmtAR(r.costoUnitario)}/${u}` : '—'],
    ['Variación de stock', `${r.diferencia >= 0 ? '+' : ''}${fmtNumAR(r.diferencia, 2)} ${u}${r.diferenciaPct != null ? ` (${r.diferenciaPct >= 0 ? '+' : ''}${fmtNumAR(r.diferenciaPct, 1)}%)` : ''}`],
    ['Días de stock', cobertura != null ? `${fmtNumAR(cobertura, 0)} días` : '—'],
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
        <div className="mb-4 pb-3 border-b-2 border-slate-800 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Informe de conciliación</p>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{d.insumo.nombre}</h1>
            <p className="text-[12px] text-slate-500">Unidad base {u}</p>
          </div>
          <div className="text-right text-[11px] text-slate-500 shrink-0">
            <span className="inline-block bg-slate-100 rounded px-2 py-0.5 text-slate-700 font-medium">{fmtFecha(from)} – {fmtFecha(to)}</span>
            <p className="mt-1">Generado {new Date().toLocaleDateString('es-AR')}</p>
          </div>
        </div>

        {/* Gráfico principal (página 1): consumo y compras por día/semana */}
        <Section title={`Consumo y compras por ${weekly ? 'semana' : 'día'}`}>
          {evolData.length === 0 ? (
            <p className="text-[12px] text-slate-500">Sin movimientos en el período.</p>
          ) : (
            <ComposedChart width={640} height={200} data={evolData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={fmtFecha} tick={{ fontSize: 9 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} width={42} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="comprado" name={`Comprado (${u})`} fill="#6366f1" barSize={weekly ? 18 : 10} isAnimationActive={false} />
              <Line type="monotone" dataKey="consumo" name={`Consumo (${u})`} stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          )}
        </Section>

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
          {hayStockSerie && (
            <div className="my-2">
              <p className="text-[11px] text-slate-500 mb-1">
                Stock teórico (línea) vs conteos reales (puntos). Punto <span className="text-emerald-600 font-medium">verde</span> = stock OK;
                <span className="text-red-600 font-medium"> rojo</span> = desvío a esa fecha.
              </p>
              <ComposedChart width={640} height={170} data={s.stockSerie} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="fecha" tickFormatter={fmtFecha} tick={{ fontSize: 9 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} width={42} />
                <Bar dataKey="desvio" name={`Desvío (${u})`} fill="#ef4444" barSize={12} isAnimationActive={false} />
                <Line type="monotone" dataKey="teorico" name={`Stock teórico (${u})`} stroke="#6366f1" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="conteo" name="Conteo real" stroke="transparent" isAnimationActive={false} dot={renderConteoDot as never} legendType="circle" />
              </ComposedChart>
            </div>
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
          {conPrecio.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="border border-slate-200 rounded px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Margen promedio</p>
                <p className="text-[13px] font-semibold text-emerald-700">{margenPromPct != null ? `${fmtNumAR(margenPromPct, 1)}%` : '—'}</p>
              </div>
              <div className="border border-slate-200 rounded px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Costo % promedio</p>
                <p className="text-[13px] font-semibold text-slate-800">{foodCostProm != null ? `${fmtNumAR(foodCostProm, 1)}%` : '—'}</p>
              </div>
              <div className="border border-slate-200 rounded px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Margen total período</p>
                <p className="text-[13px] font-semibold text-slate-800">{fmtAR(margenTotPeriodo)}</p>
              </div>
            </div>
          )}
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
                  <th className={thr}>Costo %</th>
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
            Margen y costo % netos (sin IVA): el precio se neteó con el IVA de venta de los cierres; el costo de factura ya es neto.
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

        {/* Compras del período */}
        <Section title="Compras del período">
          {comprasList.length === 0 ? (
            <p className="text-[12px] text-slate-500">Sin compras del insumo en el período.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr>
                  <th className={th}>Fecha</th>
                  <th className={th}>Proveedor</th>
                  <th className={th}>Descripción</th>
                  <th className={thr}>Cantidad</th>
                  <th className={thr}>Subtotal</th>
                  <th className={thr}>$/{u}</th>
                </tr>
              </thead>
              <tbody>
                {comprasList.map((c, i) => (
                  <tr key={i}>
                    <td className={td}>{c.fecha ? fmtFecha(c.fecha) : '—'}</td>
                    <td className={td} title={c.proveedor ?? ''}>{truncProv(c.proveedor)}</td>
                    <td className={td}>{c.descripcion}</td>
                    <td className={tdr}>{c.cantidad != null ? `${fmtNumAR(c.cantidad, 2)} ${c.unidad ?? ''}` : '—'}</td>
                    <td className={tdr}>{fmtAR(c.subtotal)}</td>
                    <td className={tdr}>{c.precioBase != null ? fmtAR(c.precioBase) : '—'}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={td} colSpan={3}>Total ({fmtNumAR(comprasTot.cantidadBase, 2)} {u})</td>
                  <td className={tdr}></td>
                  <td className={tdr}>{fmtAR(comprasTot.costo)}</td>
                  <td className={tdr}>{comprasTot.cantidadBase > 0 ? fmtAR(comprasTot.costo / comprasTot.cantidadBase) : '—'}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-[10px] text-slate-400 mt-1">Importes netos (sin IVA). $/{u} = costo por unidad base normalizado por el factor del alias.</p>
        </Section>

        {/* Detalle semanal (números) */}
        <Section title="Detalle semanal">
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
