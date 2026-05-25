'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DateRange } from './date-range'
import { fmtAR, fmtNumAR, fmtFecha, fmtFechaShort, fmtCompactAR, defaultRange } from './shared'
import { FileText } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface BillingResp {
  total: number
  series: Array<{
    fecha: string
    facturaAElectronica: number
    facturaBElectronica: number
    facturaB: number
    total: number
  }>
  breakdown: Array<{
    tipo: string
    key: 'facturaAElectronica' | 'facturaBElectronica' | 'facturaB'
    importe: number
    cantidad: number
    porcentaje: number
  }>
}

type BillingKey = 'facturaAElectronica' | 'facturaBElectronica' | 'facturaB'

const COLORS: Record<BillingKey, string> = {
  facturaAElectronica: '#0ea5e9',
  facturaBElectronica: '#6366f1',
  facturaB: '#f59e0b',
}

const LABELS: Record<BillingKey, string> = {
  facturaAElectronica: 'Factura A elec.',
  facturaBElectronica: 'Factura B elec.',
  facturaB: 'Factura B',
}

export function BillingTab() {
  const [{ from, to }, setRange] = useState(defaultRange())

  const params = useMemo(() => new URLSearchParams({ from, to }).toString(), [from, to])

  const { data, isLoading } = useQuery({
    queryKey: ['sales-billing', params],
    queryFn: async () => {
      const res = await fetch(`/api/sales/billing?${params}`)
      if (!res.ok) throw new Error('Error cargando facturación')
      return res.json() as Promise<BillingResp>
    },
    staleTime: 60_000,
  })

  const breakdown = data?.breakdown ?? []
  const series = data?.series ?? []
  const total = data?.total ?? 0
  const totalCant = breakdown.reduce((s, b) => s + b.cantidad, 0)

  const hasData = total > 0

  // Datos para el pie: filtramos los que tienen importe > 0 para no mostrar slices vacíos
  const pieData = breakdown.filter((b) => b.importe > 0)

  return (
    <div className="space-y-4">
      <DateRange from={from} to={to} onChange={setRange} />

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Cargando...</div>
      ) : !hasData ? (
        <div className="p-12 text-center bg-white rounded-lg border border-slate-200">
          <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Sin facturación en este rango</p>
          <p className="text-slate-400 text-sm mt-1">
            Si subiste cierres viejos, ejecutá "Re-parsear todos los cierres" en Auditoría
            para que se extraigan los tipos de factura.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs por tipo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Total facturado" value={fmtAR(total)} subtitle={`${fmtNumAR(totalCant)} comprobantes`} highlight />
            {breakdown.map((b) => (
              <KPI
                key={b.key}
                label={b.tipo}
                value={fmtAR(b.importe)}
                subtitle={`${fmtNumAR(b.cantidad)} comp. · ${Math.round(b.porcentaje)}%`}
                color={COLORS[b.key]}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Gráfico de líneas (1 línea por tipo) */}
            <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Facturación diaria por tipo</h3>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={series} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" tickFormatter={fmtFechaShort} tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtCompactAR} tick={{ fontSize: 11 }} width={56} />
                    <Tooltip
                      labelFormatter={(l) => fmtFecha(String(l))}
                      formatter={((v: number, name: string) => [fmtAR(v), name]) as never}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="facturaAElectronica"
                      name={LABELS.facturaAElectronica}
                      stroke={COLORS.facturaAElectronica}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="facturaBElectronica"
                      name={LABELS.facturaBElectronica}
                      stroke={COLORS.facturaBElectronica}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="facturaB"
                      name={LABELS.facturaB}
                      stroke={COLORS.facturaB}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie chart */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Distribución</h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="importe"
                      nameKey="tipo"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {pieData.map((p) => (
                        <Cell key={p.key} fill={COLORS[p.key]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={((v: number) => fmtAR(v)) as never} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 space-y-1.5">
                {pieData.map((p) => (
                  <div key={p.key} className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[p.key] }} />
                      <span className="text-slate-600">{p.tipo}</span>
                    </span>
                    <span className="text-slate-700 font-medium">{Math.round(p.porcentaje)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla con importe + porcentaje */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                  <th className="text-right px-4 py-2.5 font-medium">Comprobantes</th>
                  <th className="text-right px-4 py-2.5 font-medium">Importe</th>
                  <th className="text-right px-4 py-2.5 font-medium w-32">Participación</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.key} className="border-b border-slate-100">
                    <td className="px-4 py-2.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: COLORS[b.key] }} />
                      <span className="text-slate-700">{b.tipo}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{fmtNumAR(b.cantidad)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{fmtAR(b.importe)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${b.porcentaje}%`, background: COLORS[b.key] }}
                          />
                        </div>
                        <span className="text-slate-600 w-8 text-right">{Math.round(b.porcentaje)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-medium">
                  <td className="px-4 py-2.5 text-slate-700">Total</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{fmtNumAR(totalCant)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">{fmtAR(total)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function KPI({
  label,
  value,
  subtitle,
  highlight,
  color,
}: {
  label: string
  value: string
  subtitle?: string | undefined
  highlight?: boolean | undefined
  color?: string | undefined
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 relative overflow-hidden">
      {color && (
        <span
          className="absolute top-0 left-0 h-full w-1"
          style={{ background: color }}
        />
      )}
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${highlight ? 'text-emerald-700' : 'text-slate-800'}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}
