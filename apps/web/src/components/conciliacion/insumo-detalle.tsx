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
import { TrendingUp, TrendingDown } from 'lucide-react'

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
    difAcum: number
  }>
  productos: Array<{ productMasterId: string; nombre: string; unidades: number; consumo: number }>
  stock: {
    conteos: Array<{ id: string; fecha: string; cantidad: number; nota: string | null }>
    ultimoConteoFecha: string | null
    stockTeoricoActual: number | null
    consumoDiario: number
    diasCobertura: number | null
    dias: number
    mermaRecetaConfigurada: boolean
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
  const [, m, d] = s.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${meses[Number(m) - 1] ?? ''}`
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
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Consumo teórico vs comprado ({u}/semana)</p>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={serie} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
              <XAxis dataKey="semana" tickFormatter={fmtSemana} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                labelFormatter={(l) => `Semana del ${fmtSemana(String(l))}`}
                formatter={((v: number, n: string) => [`${fmtNumAR(v, 2)} ${u}`, n === 'consumo' ? 'Consumo teórico' : 'Comprado']) as never}
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
                <Line type="monotone" dataKey="costoUnitario" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Diferencia acumulada */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
            Diferencia acumulada ({u})
            {difPos ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
          </p>
          <div className="h-48">
            <ResponsiveContainer>
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
            </ResponsiveContainer>
          </div>
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
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-800">{insumo.nombre}</h3>
        <p className="text-xs text-slate-500">Unidad base: {insumo.unidadBase}</p>
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
