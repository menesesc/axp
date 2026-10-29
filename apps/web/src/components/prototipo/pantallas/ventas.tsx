'use client'

import { useState } from 'react'
import { CalendarDays, Moon, Receipt, Sun, Users, UtensilsCrossed } from 'lucide-react'
import { Titulo } from '../shell'
import { Area, Dona } from '../graficos'
import { Card, Kpi, Tabs, pesos } from '../ui'

const dias = ['1/10', '2/10', '3/10', '4/10', '5/10', '6/10', '7/10']
const mediodia = [1.62, 1.48, 1.9, 2.4, 2.81, 1.2, 1.55].map((v) => v * 1_000_000)
const noche = [2.1, 2.36, 3.05, 4.4, 4.92, 1.9, 2.28].map((v) => v * 1_000_000)

const RANKING = [
  { plato: 'Bife de chorizo', rubro: 'Carne parrilla', u: 186, imp: 7_068_000 },
  { plato: 'Ñoquis rellenos', rubro: 'Pastas caseras', u: 154, imp: 3_696_000 },
  { plato: 'Trucha a la manteca', rubro: 'Pescados', u: 121, imp: 4_235_000 },
  { plato: 'Malbec Reserva', rubro: 'Vinos', u: 98, imp: 3_136_000 },
  { plato: 'Flan casero', rubro: 'Postres', u: 92, imp: 828_000 },
  { plato: 'Lomo al champignon', rubro: 'Carne parrilla', u: 88, imp: 3_784_000 },
]

function Cierres() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Vendido ayer" valor={pesos(3_830_000)} variacion={12} serie={[2.8, 3.1, 3.4, 3.2, 3.6, 3.83]} icono={Receipt} />
        <Kpi etiqueta="Ticket promedio" valor={pesos(38_900)} variacion={5} serie={[34, 35, 36, 37, 38, 38.9]} icono={UtensilsCrossed} />
        <Kpi etiqueta="Cubiertos ayer" valor="214" variacion={-3} serie={[190, 220, 230, 205, 221, 214]} icono={Users} />
        <Kpi etiqueta="Promedio por día" valor={pesos(4_210_000)} nota="Últimos 30 días" icono={CalendarDays} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card
          titulo="Ventas por turno"
          accion={
            <span className="flex items-center gap-4 text-xs text-[var(--sec)]">
              <span className="flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full bg-[#f5a524]" /> Mediodía
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full bg-[#3b9bff]" /> Noche
              </span>
            </span>
          }
        >
          <Area
            etiquetas={dias}
            formato={(n) => pesos(n)}
            series={[
              { nombre: 'Noche', valores: noche, color: '#3b9bff' },
              { nombre: 'Mediodía', valores: mediodia, color: '#f5a524' },
            ]}
          />
        </Card>
        <Card titulo="Cómo te pagaron">
          <Dona
            centro="$ 29,5 M"
            bajada="en octubre"
            partes={[
              { nombre: 'Tarjeta de débito', valor: 38, color: '#3b9bff' },
              { nombre: 'Tarjeta de crédito', valor: 27, color: '#a78bfa' },
              { nombre: 'Mercado Pago', valor: 21, color: '#22d3ee' },
              { nombre: 'Efectivo', valor: 14, color: '#34d399' },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { turno: 'Mediodía', icono: Sun, nro: 4821, total: 1_550_000, mesas: 31, ticket: 31_600, mozo: 'Valentina' },
          { turno: 'Noche', icono: Moon, nro: 4822, total: 2_280_000, mesas: 48, ticket: 44_700, mozo: 'Julián' },
        ].map((c) => {
          const Icono = c.icono
          return (
            <Card key={c.turno} tono={c.turno === 'Mediodía' ? 'ambar' : undefined}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="pt-icono" style={{ '--c1': c.turno === 'Mediodía' ? '#f5a524' : '#3b9bff' } as React.CSSProperties}>
                    <Icono className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="pt-card-titulo">Cierre {c.turno.toLowerCase()}</p>
                    <p className="text-xs text-[var(--ter)] pt-num">N.º {c.nro}, martes 7/10</p>
                  </div>
                </div>
                <p className="pt-display pt-num text-2xl font-semibold">{pesos(c.total)}</p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl bg-slate-900/[0.035] px-3 py-2.5">
                  <p className="text-xs text-[var(--ter)]">Mesas</p>
                  <p className="pt-num font-medium">{c.mesas}</p>
                </div>
                <div className="rounded-xl bg-slate-900/[0.035] px-3 py-2.5">
                  <p className="text-xs text-[var(--ter)]">Ticket promedio</p>
                  <p className="pt-num font-medium">{pesos(c.ticket)}</p>
                </div>
                <div className="rounded-xl bg-slate-900/[0.035] px-3 py-2.5">
                  <p className="text-xs text-[var(--ter)]">Mejor mozo</p>
                  <p className="font-medium truncate">{c.mozo}</p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function Ranking() {
  const max = RANKING[0]!.u
  return (
    <Card titulo="Lo más vendido en octubre" sinPadding>
      <ul className="divide-y divide-slate-900/[0.07]">
        {RANKING.map((r, i) => (
          <li key={r.plato} className="flex items-center gap-4 px-5 py-3.5">
            <span className={`pt-display w-7 text-lg font-semibold pt-num ${i < 3 ? 'text-[var(--azul-2)]' : 'text-[var(--ter)]'}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <p className="truncate font-medium">{r.plato}</p>
                <p className="pt-num text-sm">
                  {r.u} <span className="text-[var(--ter)]">unidades</span>
                </p>
              </div>
              <div className="pt-barra">
                <i style={{ width: `${(r.u / max) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-[var(--ter)]">
                {r.rubro}, {pesos(r.imp)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function PantallaVentas() {
  const [tab, setTab] = useState('cierres')
  return (
    <>
      <Titulo
        escena="ventas"
        titulo="Ventas"
        bajada="Los cierres de caja entran solos todas las noches."
        acciones={
          <button type="button" className="pt-boton pt-boton-sec">
            <CalendarDays className="h-4 w-4" /> 1 al 7 de octubre
          </button>
        }
      />
      <div className="mb-5">
        <Tabs
          activa={tab}
          onCambiar={setTab}
          opciones={[
            { v: 'cierres', t: 'Cierres' },
            { v: 'ranking', t: 'Ranking' },
            { v: 'mozos', t: 'Mozos' },
            { v: 'pagos', t: 'Formas de pago' },
            { v: 'facturacion', t: 'Facturación' },
            { v: 'turnos', t: 'Por turno' },
            { v: 'auditoria', t: 'Auditoría' },
            { v: 'csv', t: 'Ventas (CSV)' },
          ]}
        />
      </div>
      <div key={tab}>
        {tab === 'cierres' ? (
          <Cierres />
        ) : tab === 'ranking' ? (
          <Ranking />
        ) : (
          <Card>
            <p className="text-sm text-[var(--sec)]">
              Esta pestaña usaría el mismo estilo que Cierres y Ranking. En el prototipo están diseñadas esas dos.
            </p>
          </Card>
        )}
      </div>
    </>
  )
}
