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
import { ArrowDownRight, ArrowUpRight, Scale, Users, Wallet } from 'lucide-react'
import { Kpi, millones, pesos } from '@/components/dashboard/inicio'

/**
 * Lo que entra y lo que sale en el período.
 *
 * Finanzas mostraba sólo pagos, que es la mitad de la película: "pagué doce
 * millones" no dice si el mes estuvo bien o mal. Al lado de los egresos van
 * las ventas del salón, y encima el saldo acumulado, que es la línea que
 * contesta la única pregunta que importa: ¿terminamos el mes con plata?
 *
 * Los sueldos van separados de los pagos a proveedores: son el gasto más
 * grande después de la mercadería y salen en días propios —los adelantos a
 * mitad de mes, los saldos a principio del siguiente—. Mezclados en una sola
 * barra roja no se ve cuándo se va la plata del personal.
 *
 * Las cifras van en millones y sin centavos: con cinco tarjetas en fila, un
 * "$ 314.181.072,40" no entra y nadie lee los centavos de un mes.
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
  adelantos: number
}

interface Resumen {
  pos: number
  sueldosBanco: number
  sueldosEfectivo: number
  sueldosOtros: number
  sueldosEspecie: number
}

const COLOR = {
  entra: '#10b981',
  proveedores: '#f43f5e',
  sueldos: '#fb923c',
  saldo: '#0f172a',
}

/** Eje: "130 M", "450 k". */
const eje = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${Math.round(n / 1_000_000)} M`
    : Math.abs(n) >= 1000
      ? `${Math.round(n / 1000)} k`
      : String(Math.round(n))

const NOMBRE: Record<string, string> = {
  ingresos: 'Entró',
  proveedores: 'Pagos',
  sueldos: 'Sueldos',
  saldo: 'Saldo acumulado',
}

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

  const dias = (data?.dias ?? []).filter((d) => !prefijoMes || d.fecha.startsWith(prefijoMes))
  const r = data?.resumen

  const t = dias.reduce(
    (a, d) => ({
      ingresos: a.ingresos + d.ventas + d.pos,
      proveedores: a.proveedores + d.pagado,
      sueldos: a.sueldos + d.sueldos,
      adelantos: a.adelantos + d.adelantos,
      comprometido: a.comprometido + d.comprometido,
      efectivo: a.efectivo + d.efectivo,
      tarjetas: a.tarjetas + d.tarjetas,
      ctaCte: a.ctaCte + d.ctaCte,
    }),
    { ingresos: 0, proveedores: 0, sueldos: 0, adelantos: 0, comprometido: 0, efectivo: 0, tarjetas: 0, ctaCte: 0 }
  )
  const salio = t.proveedores + t.sueldos
  const resultado = t.ingresos - salio
  const conVenta = dias.filter((d) => d.ventas + d.pos > 0).length

  // Cómo salieron los sueldos: es lo que se cruza con el extracto del banco.
  const comoSalio = [
    r?.sueldosBanco ? `${millones(r.sueldosBanco)} banco` : null,
    r?.sueldosEfectivo ? `${millones(r.sueldosEfectivo)} efectivo` : null,
    r?.sueldosOtros ? `${millones(r.sueldosOtros)} préstamos` : null,
  ].filter(Boolean)

  const variosMeses = new Set(dias.map((d) => d.fecha.slice(0, 7))).size > 1
  let acumulado = 0
  const serie = dias.map((d) => {
    acumulado += d.ventas + d.pos - d.pagado - d.sueldos
    return {
      // Si el período cruza meses, el número de día solo no alcanza.
      dia: variosMeses ? `${d.fecha.slice(8)}/${d.fecha.slice(5, 7)}` : String(Number(d.fecha.slice(8))),
      ingresos: Math.round(d.ventas + d.pos),
      proveedores: Math.round(d.pagado),
      sueldos: Math.round(d.sueldos),
      saldo: Math.round(acumulado),
    }
  })

  return (
    <section className="mb-5">
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          etiqueta={etiqueta ? `Entró · ${etiqueta}` : 'Entró'}
          valor={millones(t.ingresos)}
          nota={conVenta ? `${conVenta} días con servicio · ${millones(t.ingresos / conVenta)} por día` : 'sin ventas cargadas'}
          tono="verde"
          icono={ArrowUpRight}
          cargando={isLoading}
        />
        <Kpi
          etiqueta={etiqueta ? `Salió · ${etiqueta}` : 'Salió'}
          valor={millones(salio)}
          nota={
            t.sueldos > 0
              ? `${millones(t.proveedores)} pagos · ${millones(t.sueldos)} sueldos`
              : 'pagos hechos y cheques debitados'
          }
          tono="rojo"
          icono={ArrowDownRight}
          cargando={isLoading}
        />
        <Kpi
          etiqueta="Resultado de caja"
          valor={millones(resultado)}
          nota={resultado >= 0 ? 'entró más de lo que salió' : 'salió más de lo que entró'}
          tono={resultado >= 0 ? 'verde' : 'rojo'}
          icono={Scale}
          cargando={isLoading}
        />
        {/* Los sueldos tienen tarjeta propia: es el gasto más grande después
            de la mercadería y adentro de "Salió" no se veía. */}
        <Kpi
          etiqueta="Sueldos"
          valor={millones(t.sueldos)}
          nota={
            t.sueldos > 0
              ? [
                  t.adelantos > 0 ? `${millones(t.adelantos)} en adelantos` : null,
                  comoSalio.length ? comoSalio.join(' · ') : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'lo que cobró el personal'
              : 'sin pagos de sueldos en el período'
          }
          tono="ambar"
          icono={Users}
          href="/configuracion/integraciones"
          cargando={isLoading}
        />
        <Kpi
          etiqueta="Falta pagar"
          valor={millones(t.comprometido)}
          nota="órdenes emitidas y borradores"
          tono="ambar"
          icono={Wallet}
          cargando={isLoading}
        />
      </div>

      <div className="rounded-2xl border border-slate-900/[0.08] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="font-semibold">Entra y sale, día por día{etiqueta ? ` · ${etiqueta}` : ''}</p>
          <Leyenda hayPos={(r?.pos ?? 0) > 0} />
        </div>

        {isLoading ? (
          <div className="h-72 animate-pulse rounded-xl bg-slate-900/[0.04]" />
        ) : serie.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No hay movimientos en este período.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickFormatter={eje} tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={((v: number, k: string) => [pesos(v), NOMBRE[k] ?? k]) as never}
                  labelFormatter={(d) => `Día ${d}`}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                />
                <Bar dataKey="ingresos" fill={COLOR.entra} radius={[4, 4, 0, 0]} maxBarSize={16} />
                {/* Pagos y sueldos apilados: la altura es todo lo que salió ese
                    día, y el color dice de qué. */}
                <Bar dataKey="proveedores" stackId="sale" fill={COLOR.proveedores} maxBarSize={16} />
                <Bar dataKey="sueldos" stackId="sale" fill={COLOR.sueldos} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Line type="monotone" dataKey="saldo" stroke={COLOR.saldo} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Cómo entró la plata, en una línea al pie y sin centavos. */}
        {t.ingresos > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Cobrado: {millones(t.efectivo)} efectivo · {millones(t.tarjetas)} tarjeta
            {t.ctaCte > 0 && ` · ${millones(t.ctaCte)} cuenta corriente`}
            {(r?.pos ?? 0) > 0 && ` · ${millones(r!.pos)} POS`}
            {(r?.sueldosEspecie ?? 0) > 0 &&
              ` · ${millones(r!.sueldosEspecie)} de sueldos se pagaron en mercadería y no cuentan como plata`}
          </p>
        )}
      </div>
    </section>
  )
}

function Leyenda({ hayPos }: { hayPos: boolean }) {
  const items = [
    { color: COLOR.entra, texto: hayPos ? 'Entró (salón + POS)' : 'Entró' },
    { color: COLOR.proveedores, texto: 'Pagos' },
    { color: COLOR.sueldos, texto: 'Sueldos' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {items.map((i) => (
        <span key={i.texto} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          {i.texto}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded" style={{ backgroundColor: COLOR.saldo }} />
        Saldo acumulado
      </span>
    </div>
  )
}
