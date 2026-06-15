'use client'

import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fmtAR, fmtNumAR } from '@/components/sales/shared'
import { InsumoAliasPanel } from './insumo-alias-panel'
import { InsumoRecetasPanel } from './insumo-recetas-panel'
import { InsumoStockPanel } from './insumo-stock-panel'
import { MargenTable, type MargenProducto } from './margen-table'
import { TrendingUp, TrendingDown, Printer } from 'lucide-react'

interface Insumo {
  id: string
  nombre: string
  unidadBase: string
}

interface DetalleResponse {
  insumo: Insumo
  resumen: {
    consumoTeorico: number
    compradoBase: number
    costoComprado: number
    costoUnitario: number | null
    diferencia: number
    diferenciaPct: number | null
  }
  serie: Array<{
    semana: string
    consumo: number
    comprado: number
    costo: number
    costoUnitario: number | null
    costoUnitarioFill: number | null
    difAcum: number
  }>
  consumoPorDia: Array<{ fecha: string; consumo: number }>
  compradoPorDia: Array<{ fecha: string; comprado: number }>
  productos: Array<{ productMasterId: string; nombre: string; unidades: number; consumo: number }>
  stock: {
    conteos: Array<{ id: string; fecha: string; cantidad: number; nota: string | null }>
    ultimoConteoFecha: string | null
    stockTeoricoActual: number | null
    consumoDiario: number
    diasCobertura: number | null
    dias: number
    mermaRecetaConfigurada: boolean
    stockSerie: Array<{ fecha: string; teorico: number | null; conteo: number | null }>
    mermaIntervalo: {
      desde: string
      hasta: string
      stockInicial: number
      comprado: number
      consumoTeorico: number
      stockFinal: number
      merma: number
      mermaPct: number | null
    } | null
  }
}

function fmtSemana(s: string): string {
  // s = 'YYYY-MM-DD' (lunes de la semana)
  const parts = String(s).slice(0, 10).split('-')
  if (parts.length !== 3) return String(s)
  const [, m, d] = parts
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const mes = meses[Number(m) - 1]
  if (!mes || !Number.isFinite(Number(d))) return String(s)
  return `${Number(d)} ${mes}`
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' | 'warn' }) {
  const color = tone === 'neg' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'pos' ? 'text-emerald-600' : 'text-slate-800'
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}

function ConciliacionTabContent({ insumo, from, to }: { insumo: Insumo; from: string; to: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['insumo-detalle', insumo.id, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/insumos/${insumo.id}/detalle?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Error cargando detalle')
      return res.json() as Promise<DetalleResponse>
    },
    staleTime: 30_000,
  })

  const { data: margenData } = useQuery({
    queryKey: ['insumo-margen', insumo.id, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/conciliacion/margen?from=${from}&to=${to}&insumoId=${insumo.id}`)
      if (!res.ok) throw new Error('Error cargando margen')
      return res.json() as Promise<{ productos: MargenProducto[] }>
    },
    staleTime: 30_000,
  })

  if (isLoading) return <div className="py-12 text-center text-slate-400 text-sm">Cargando conciliación...</div>
  if (!data) return null

  const { resumen, serie, productos, stock } = data
  const u = insumo.unidadBase
  const hayDatos = serie.length > 0
  const cobertura = stock.diasCobertura ?? (stock.consumoDiario > 0 ? resumen.compradoBase / stock.consumoDiario : null)
  const m = stock.mermaIntervalo
  // Stock probable = lo que debería haber (inicial + comprado − consumo). Recién
  // se vuelve merma al contrastarlo con el conteo físico de cierre.
  const stockProbable = m ? m.stockInicial + m.comprado - m.consumoTeorico : null
  const mermaConfigurada = stock.mermaRecetaConfigurada
  const hayStockSerie = stock.stockSerie.some((p) => p.teorico != null)
  const renderConteoDot = (props: { cx?: number; cy?: number; index?: number; payload?: { conteo: number | null; teorico: number | null } }) => {
    const { cx, cy, index, payload } = props
    if (payload?.conteo == null || cx == null || cy == null) return <g key={`e${index}`} />
    const teo = payload.teorico
    const ok = teo != null && Math.abs(payload.conteo - teo) <= Math.max(0.5, Math.abs(teo) * 0.05)
    return <circle key={`d${index}`} cx={cx} cy={cy} r={4} fill={ok ? '#10b981' : '#ef4444'} stroke="#ffffff" strokeWidth={1} />
  }
  // Granularidad: semanal si el rango > 2 semanas, si no diario (evita gráficos inútiles).
  const weekly = stock.dias > 14
  const consumoByDay = new Map(data.consumoPorDia.map((x) => [x.fecha, x.consumo]))
  const compradoByDay = new Map(data.compradoPorDia.map((x) => [x.fecha, x.comprado]))
  const evolData = weekly
    ? serie.map((w) => ({ label: w.semana, consumo: w.consumo, comprado: w.comprado }))
    : stock.stockSerie.map((p) => ({ label: p.fecha, consumo: consumoByDay.get(p.fecha) ?? 0, comprado: compradoByDay.get(p.fecha) ?? 0 }))

  if (!hayDatos) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        Sin ventas ni compras de este insumo en el período. Verificá que tenga alias de compra y recetas en venta cargados.
      </div>
    )
  }

  const difPos = resumen.diferencia >= 0
  const top = productos.slice(0, 8).map((p) => ({ ...p, nombre: p.nombre.length > 22 ? p.nombre.slice(0, 22) + '…' : p.nombre }))

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Kpi label="Consumo teórico" value={`${fmtNumAR(resumen.consumoTeorico, 2)} ${u}`} sub="ventas × receta" />
        <Kpi label="Comprado" value={`${fmtNumAR(resumen.compradoBase, 2)} ${u}`} sub={fmtAR(resumen.costoComprado)} />
        <Kpi
          label="Diferencia"
          value={`${difPos ? '+' : ''}${fmtNumAR(resumen.diferencia, 2)} ${u}`}
          sub={resumen.diferenciaPct != null ? `${difPos ? '+' : ''}${fmtNumAR(resumen.diferenciaPct, 1)}%` : '—'}
          tone={resumen.diferenciaPct != null && Math.abs(resumen.diferenciaPct) > 15 ? 'warn' : undefined}
        />
        <Kpi label="Costo unitario" value={resumen.costoUnitario != null ? `${fmtAR(resumen.costoUnitario)}/${u}` : '—'} sub="promedio comprado" />
      </div>

      {/* Stock e inventario */}
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Stock e inventario</p>
          {stock.ultimoConteoFecha && <span className="text-[11px] text-slate-400">último conteo {stock.ultimoConteoFecha}</span>}
        </div>

        {m && stockProbable != null ? (
          <div className={`rounded-md px-3 py-2 mb-2 ${m.merma > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
            <p className="text-sm text-slate-700">
              Desvío {m.desde} → {m.hasta}:{' '}
              <span className={`font-semibold ${m.merma > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {m.merma > 0 ? '+' : ''}{fmtNumAR(m.merma, 2)} {u}{m.mermaPct != null ? ` (${m.merma > 0 ? '+' : ''}${fmtNumAR(m.mermaPct, 1)}%)` : ''}
              </span>
            </p>
            <p className="text-[11px] text-slate-500">
              Stock probable <span className="font-medium text-slate-600">{fmtNumAR(stockProbable, 2)} {u}</span>
              {' '}(inicial {fmtNumAR(m.stockInicial, 2)} + comprado {fmtNumAR(m.comprado, 2)} − consumo {fmtNumAR(m.consumoTeorico, 2)})
              {' '}· contaste <span className="font-medium text-slate-600">{fmtNumAR(m.stockFinal, 2)} {u}</span> → la diferencia es el desvío.
            </p>
            {!mermaConfigurada && (
              <p className="text-[11px] text-amber-700 mt-1">
                La receta no tiene merma configurada, así que el consumo no descuenta recortes/cocción y el desvío sale inflado. Cargá la merma en la receta.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-slate-500 mb-2">
            Con un solo conteo se proyecta el <span className="font-medium">stock probable</span>; cargá un segundo conteo físico (pestaña <span className="font-medium">Stock</span>) para medir la merma real (stock probable − contado).
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {stock.stockTeoricoActual != null && (
            <Kpi label="Stock probable hoy" value={`${fmtNumAR(stock.stockTeoricoActual, 2)} ${u}`} sub="proyectado desde el último conteo" tone={stock.stockTeoricoActual < 0 ? 'neg' : undefined} />
          )}
          <Kpi
            label="Cobertura"
            value={cobertura != null ? `${fmtNumAR(cobertura, 0)} días` : '—'}
            sub={`consumo ${fmtNumAR(stock.consumoDiario, 2)} ${u}/día`}
          />
        </div>
      </div>

      {/* Consumo vs comprado */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Consumo teórico vs comprado ({u}/{weekly ? 'semana' : 'día'})</p>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={evolData} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickFormatter={fmtSemana} tick={{ fontSize: 11 }} minTickGap={20} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                labelFormatter={(l) => (weekly ? `Semana del ${fmtSemana(String(l))}` : fmtSemana(String(l)))}
                formatter={((v: number, n: string) => [`${fmtNumAR(v, 2)} ${u}`, n]) as never}
              />
              <Bar dataKey="consumo" name="Consumo teórico" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              <Bar dataKey="comprado" name="Comprado" fill="#6366f1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Evolución costo unitario */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Costo unitario ($/{u})</p>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={serie} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                <XAxis dataKey="semana" tickFormatter={fmtSemana} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => fmtAR(v)} />
                <Tooltip
                  labelFormatter={(l) => `Semana del ${fmtSemana(String(l))}`}
                  formatter={((v: number) => [v != null ? `${fmtAR(v)}/${u}` : '—', 'Costo unitario']) as never}
                />
                <Line type="monotone" dataKey="costoUnitarioFill" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock teórico vs conteos (o diferencia acumulada si no hay conteos) */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
            {hayStockSerie ? 'Stock teórico vs conteos' : 'Diferencia acumulada'} ({u})
            {!hayStockSerie && (difPos ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />)}
          </p>
          <div className="h-48">
            <ResponsiveContainer>
              {hayStockSerie ? (
                <LineChart data={stock.stockSerie} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" tickFormatter={fmtSemana} tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} width={44} />
                  <Tooltip
                    labelFormatter={(l) => fmtSemana(String(l))}
                    formatter={((v: number, n: string) => [`${fmtNumAR(v, 2)} ${u}`, n]) as never}
                  />
                  <Line type="monotone" dataKey="teorico" name="Stock teórico" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
                  <Line dataKey="conteo" name="Conteo real" stroke="transparent" isAnimationActive={false} dot={renderConteoDot as never} />
                </LineChart>
              ) : (
                <AreaChart data={serie} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="difAcum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis dataKey="semana" tickFormatter={fmtSemana} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} />
                  <Tooltip
                    labelFormatter={(l) => `Semana del ${fmtSemana(String(l))}`}
                    formatter={((v: number) => [`${v >= 0 ? '+' : ''}${fmtNumAR(v, 2)} ${u}`, 'Comprado − consumo (acum.)']) as never}
                  />
                  <Area type="monotone" dataKey="difAcum" stroke="#6366f1" strokeWidth={2} fill="url(#difAcum)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          {hayStockSerie && (
            <p className="text-[11px] text-slate-400 mt-1">
              Punto <span className="text-emerald-600">verde</span> = stock OK; <span className="text-red-600">rojo</span> = desvío a esa fecha.
            </p>
          )}
        </div>
      </div>

      {/* Productos que más lo consumen */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Productos que más lo consumen ({u})</p>
        {top.length === 0 ? (
          <p className="text-sm text-slate-400">Sin productos con receta vendidos en el período.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={((v: number, _n: string, p: { payload?: { unidades?: number } }) => [`${fmtNumAR(v, 2)} ${u} · ${fmtNumAR(p?.payload?.unidades ?? 0, 0)} u vend.`, 'Consumo']) as never} />
                <Bar dataKey="consumo" fill="#6366f1" radius={[0, 2, 2, 0]}>
                  {top.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#4f46e5' : '#818cf8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Margen de los productos que lo usan */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Margen de los productos que usan este insumo</p>
        <MargenTable productos={margenData?.productos ?? []} />
      </div>
    </div>
  )
}

export function InsumoDetalle({
  insumo,
  canEdit,
  from,
  to,
}: {
  insumo: Insumo & { categoria?: string | null; activo?: boolean; notas?: string | null }
  canEdit: boolean
  from: string
  to: string
}) {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-800">{insumo.nombre}</h3>
          <p className="text-xs text-slate-500">Unidad base: {insumo.unidadBase}</p>
        </div>
        <a
          href={`/conciliacion/insumos/${insumo.id}/print?from=${from}&to=${to}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" /> Imprimir informe
        </a>
      </div>

      <Tabs defaultValue="conciliacion">
        <TabsList>
          <TabsTrigger value="conciliacion">Conciliación</TabsTrigger>
          <TabsTrigger value="compras">Compras (alias)</TabsTrigger>
          <TabsTrigger value="recetas">Recetas en venta</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="conciliacion" className="mt-5">
          <ConciliacionTabContent insumo={insumo} from={from} to={to} />
        </TabsContent>

        <TabsContent value="compras" className="mt-5">
          <InsumoAliasPanel insumo={insumo} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="recetas" className="mt-5">
          <InsumoRecetasPanel insumo={insumo} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="stock" className="mt-5">
          <InsumoStockPanel insumo={insumo} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
