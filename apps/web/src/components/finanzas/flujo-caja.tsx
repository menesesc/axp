'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Scale, Wallet } from 'lucide-react'
import { Kpi } from '@/components/dashboard/inicio'
import { formatCurrency } from '@/lib/utils'

/**
 * Lo que entra y lo que sale en el mes.
 *
 * Finanzas mostraba sólo pagos, que es la mitad de la película: "pagué doce
 * millones" no dice si el mes estuvo bien o mal. Al lado de los egresos van
 * las ventas del salón, y abajo el saldo acumulado, que es la línea que
 * contesta la única pregunta que importa: ¿terminamos el mes con plata?
 *
 * Los días sin servicio no se promedian: dividir por 30 cuando se abre 22
 * hace ver peor de lo que fue.
 */

interface DiaFlujo {
  fecha: string
  ventas: number
  pos: number
  efectivo: number
  tarjetas: number
  ctaCte: number
  pagado: number
  comprometido: number
  sueldos: number
}

interface Resumen {
  ingresos: number
  ventas: number
  pos: number
  efectivo: number
  tarjetas: number
  ctaCte: number
  pagado: number
  comprometido: number
  sueldos: number
  diasConVenta: number
  promedioDia: number
}

const corto = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1000
      ? `${Math.round(n / 1000)}k`
      : String(Math.round(n))

export function FlujoCaja({
  desde,
  hasta,
  prefijoMes,
  etiqueta,
}: {
  desde: string
  hasta: string
  /** Para el calendario, que pide una semana de más de cada lado. */
  prefijoMes?: string
  etiqueta?: string
}) {
  const { data, isLoading } = useQuery<{ dias: DiaFlujo[]; resumen: Resumen }>({
    queryKey: ['finanzas-flujo', desde, hasta],
    queryFn: async () => {
      const r = await fetch(`/api/finanzas/flujo?desde=${desde}&hasta=${hasta}`)
      if (!r.ok) throw new Error('No se pudo cargar el flujo')
      return r.json()
    },
  })

  // Cuando viene de un calendario, se muestra el mes que se está mirando y
  // no la grilla entera, que se estira a la semana anterior y la siguiente.
  const dias = (data?.dias ?? []).filter((d) => !prefijoMes || d.fecha.startsWith(prefijoMes))
  const r = data?.resumen

  const delMes = dias.reduce(
    (a, d) => ({
      ingresos: a.ingresos + d.ventas + d.pos,
      pagado: a.pagado + d.pagado + d.sueldos,
      sueldos: a.sueldos + d.sueldos,
      comprometido: a.comprometido + d.comprometido,
      efectivo: a.efectivo + d.efectivo,
      tarjetas: a.tarjetas + d.tarjetas,
      ctaCte: a.ctaCte + d.ctaCte,
    }),
    { ingresos: 0, pagado: 0, sueldos: 0, comprometido: 0, efectivo: 0, tarjetas: 0, ctaCte: 0 }
  )
  const resultado = delMes.ingresos - delMes.pagado
  const conVenta = dias.filter((d) => d.ventas + d.pos > 0).length

  const variosMeses = new Set(dias.map((d) => d.fecha.slice(0, 7))).size > 1
  let acumulado = 0
  const serie = dias.map((d) => {
    acumulado += d.ventas + d.pos - d.pagado
    return {
      // Si el período cruza meses, el número de día solo no alcanza.
      dia: variosMeses ? `${d.fecha.slice(8)}/${d.fecha.slice(5, 7)}` : String(Number(d.fecha.slice(8))),
      ingresos: Math.round(d.ventas + d.pos),
      egresos: Math.round(d.pagado),
      saldo: Math.round(acumulado),
    }
  })

  return (
    <section className="mb-5">
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          etiqueta={etiqueta ? `Entró · ${etiqueta}` : 'Entró en el mes'}
          valor={formatCurrency(delMes.ingresos)}
          nota={
            conVenta
              ? `${conVenta} días con servicio · ${formatCurrency(delMes.ingresos / conVenta)} por día`
              : 'sin ventas cargadas'
          }
          tono="verde"
          icono={ArrowUpRight}
          cargando={isLoading}
        />
        <Kpi
          etiqueta={etiqueta ? `Salió · ${etiqueta}` : 'Salió en el mes'}
          valor={formatCurrency(delMes.pagado)}
          nota={
            delMes.sueldos > 0
              ? `incluye ${formatCurrency(delMes.sueldos)} de sueldos`
              : 'pagos hechos y cheques debitados'
          }
          tono="rojo"
          icono={ArrowDownRight}
          cargando={isLoading}
        />
        <Kpi
          etiqueta="Resultado de caja"
          valor={formatCurrency(resultado)}
          nota={resultado >= 0 ? 'entró más de lo que salió' : 'salió más de lo que entró'}
          tono={resultado >= 0 ? 'verde' : 'rojo'}
          icono={Scale}
          cargando={isLoading}
        />
        <Kpi
          etiqueta="Falta pagar"
          valor={formatCurrency(delMes.comprometido)}
          nota="órdenes emitidas y borradores"
          tono="ambar"
          icono={Wallet}
          cargando={isLoading}
        />
      </div>

      <div className="rounded-2xl border border-slate-900/[0.08] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">Entra y sale, día por día{etiqueta ? ` · ${etiqueta}` : ''}</p>
          <p className="text-xs text-slate-500">
            Cobrado: {formatCurrency(delMes.efectivo)} en efectivo · {formatCurrency(delMes.tarjetas)} con tarjeta
            {delMes.ctaCte > 0 && ` · ${formatCurrency(delMes.ctaCte)} en cuenta corriente`}
            {(r?.pos ?? 0) > 0 && ` · ${formatCurrency(r!.pos)} por el POS`}
          </p>
        </div>

        {isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-900/[0.04]" />
        ) : serie.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No hay movimientos en este mes.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickFormatter={corto} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={((v: number, k: string) => [
                    formatCurrency(v),
                    k === 'ingresos' ? 'Entró' : k === 'egresos' ? 'Salió' : k === 'sueldos' ? 'Sueldos' : 'Saldo acumulado',
                  ]) as never}
                  labelFormatter={(d) => `Día ${d}`}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="ingresos" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                {/* Los sueldos apilados sobre el resto de los egresos: el
                    día 5 el salto tiene que verse y entenderse. */}
                <Bar dataKey="egresos" stackId="sale" fill="#f43f5e" radius={[0, 0, 0, 0]} maxBarSize={18} />
                <Bar dataKey="sueldos" stackId="sale" fill="#fb923c" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Line type="monotone" dataKey="saldo" stroke="#0f172a" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  )
}
