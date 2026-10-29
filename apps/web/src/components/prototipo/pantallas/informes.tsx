'use client'

import { useState } from 'react'
import { AlertOctagon, ArrowRight, CalendarDays, FileText, Printer, Receipt, Search, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Titulo } from '../shell'
import { Area, Barras, Dona } from '../graficos'
import { Card, Inicial, Kpi, Tabs, pesos } from '../ui'

const PERIODOS = [
  { v: 'mes', t: 'Mes actual' },
  { v: 'anterior', t: 'Mes anterior' },
  { v: 'trimestre', t: 'Trimestre' },
  { v: 'anio', t: 'Año' },
  { v: 'personalizado', t: 'Personalizado' },
]

function Periodo() {
  const [p, setP] = useState('mes')
  return (
    <>
      <Tabs activa={p} onCambiar={setP} opciones={PERIODOS} />
      {p === 'personalizado' && (
        <div className="pt-entra flex items-center gap-2 text-sm">
          <label className="pt-buscador !h-10">
            <CalendarDays className="h-4 w-4" />
            <input type="date" defaultValue="2026-09-01" className="bg-transparent text-[var(--texto)] outline-none" aria-label="Desde" />
          </label>
          <span className="text-[var(--ter)]">a</span>
          <label className="pt-buscador !h-10">
            <CalendarDays className="h-4 w-4" />
            <input type="date" defaultValue="2026-10-08" className="bg-transparent text-[var(--texto)] outline-none" aria-label="Hasta" />
          </label>
        </div>
      )}
    </>
  )
}

const millones = (n: number) => `$ ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`

/* ------------------------------------------------------ resumen ejecutivo */

const MESES = ['Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct']
const FACTURADO = [31.2, 38.9, 35.1, 29.4, 33.8, 34.6, 36.2, 39.8, 42.1, 40.3, 44.9, 46.2].map((n) => n * 1_000_000)

const TOP = [
  { prov: 'Frigorífico Patagonia', total: 12_840_000, docs: 18, var: 12 },
  { prov: 'Mayorista del Valle', total: 8_120_400, docs: 31, var: 4 },
  { prov: 'Bodega Los Andes', total: 6_402_000, docs: 7, var: -9 },
  { prov: 'Lácteos del Sur', total: 4_210_900, docs: 22, var: 18 },
  { prov: 'Pescadería Austral', total: 3_975_300, docs: 9, var: -3 },
]

const VENCIDOS = [
  { prov: 'Distribuidora Andina', doc: 'Factura A 4352-00017547', total: 1_068_520, dias: 12 },
  { prov: 'Limpieza Total', doc: 'Factura B 0001-00006791', total: 12_800, dias: 5 },
]
const AUMENTOS = [
  { item: 'Palta Hass', prov: 'Verdulería El Huerto', ant: 3_200, act: 7_100, tipo: 'critico' as const },
  { item: 'Manteca 5 kg', prov: 'Lácteos del Sur', ant: 21_900, act: 34_100, tipo: 'alto' as const },
  { item: 'Langostinos 1 kg', prov: 'Pescadería Austral', ant: 18_400, act: 28_300, tipo: 'alto' as const },
]

export function PantallaInformes() {
  const totalTop = TOP.reduce((s, t) => s + t.total, 0)
  return (
    <>
      <Titulo
        escena="informes"
        titulo="Resumen ejecutivo"
        bajada="Cómo vienen tus compras, pagos y proveedores, de un vistazo."
        acciones={
          <>
            <Periodo />
            <button type="button" className="pt-boton pt-boton-sec">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Total facturado" valor={pesos(46_218_400)} variacion={3} serie={FACTURADO.slice(-6)} icono={Receipt} />
        <Kpi etiqueta="Total pagado" valor={pesos(33_738_100)} variacion={8} serie={[24, 27, 26, 30, 31, 34]} tono="verde" icono={Wallet} />
        <Kpi etiqueta="Saldo pendiente" valor={pesos(12_480_300)} tono="ambar" nota="91 facturas sin pagar" icono={FileText} />
        <Kpi etiqueta="Documentos" valor="214" variacion={-4} serie={[198, 220, 231, 210, 224, 214]} icono={FileText} />
      </div>

      <Card titulo="Alertas" className="mb-5" tono="rojo">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertOctagon className="h-4 w-4 text-[var(--rojo)]" /> Documentos vencidos sin pagar
            </p>
            <ul className="divide-y divide-slate-900/[0.06]">
              {VENCIDOS.map((v) => (
                <li key={v.doc} className="flex items-center gap-3 py-2.5">
                  <Inicial nombre={v.prov} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.prov}</p>
                    <p className="text-xs text-[var(--ter)]">{v.doc}</p>
                  </div>
                  <div className="text-right">
                    <p className="pt-num text-sm font-medium">{pesos(v.total)}</p>
                    <span className="pt-chip pt-chip-rojo !py-0 !text-[11px]">{v.dias} días vencido</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-[var(--ambar)]" /> Aumentos de precio fuertes
            </p>
            <ul className="divide-y divide-slate-900/[0.06]">
              {AUMENTOS.map((a) => {
                const pct = Math.round(((a.act - a.ant) / a.ant) * 100)
                return (
                  <li key={a.item} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.item}</p>
                      <p className="text-xs text-[var(--ter)]">{a.prov}</p>
                    </div>
                    <p className="pt-num hidden text-xs text-[var(--sec)] sm:block">
                      {pesos(a.ant)} <ArrowRight className="inline h-3 w-3" /> <span className="font-medium text-[var(--texto)]">{pesos(a.act)}</span>
                    </p>
                    <span className={`pt-chip pt-num ${a.tipo === 'critico' ? 'pt-chip-rojo' : 'pt-chip-ambar'}`}>+{pct} %</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card titulo="Facturación mensual" accion={<span className="text-xs text-[var(--ter)]">Últimos 12 meses</span>}>
          <Barras etiquetas={MESES} valores={FACTURADO} formato={millones} />
        </Card>
        <Card titulo="Por proveedor">
          <Dona
            centro={millones(totalTop + 10_670_500)}
            bajada="en octubre"
            partes={[
              { nombre: 'Frigorífico Patagonia', valor: 12_840_000, color: '#3b9bff' },
              { nombre: 'Mayorista del Valle', valor: 8_120_400, color: '#f5a524' },
              { nombre: 'Bodega Los Andes', valor: 6_402_000, color: '#a78bfa' },
              { nombre: 'Lácteos del Sur', valor: 4_210_900, color: '#22d3ee' },
              { nombre: 'Pescadería Austral', valor: 3_975_300, color: '#10b981' },
              { nombre: 'Otros', valor: 10_670_500, color: '#cbd5e1' },
            ]}
          />
        </Card>
      </div>

      <Card titulo="Proveedores con más gasto" sinPadding>
        <div className="overflow-x-auto">
          <table className="pt-tabla min-w-[40rem]">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Total</th>
                <th className="w-[28%]">Parte del gasto</th>
                <th className="text-right">Facturas</th>
                <th className="text-right">Contra el mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {TOP.map((t) => {
                const pct = (t.total / (totalTop + 10_670_500)) * 100
                return (
                  <tr key={t.prov}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Inicial nombre={t.prov} />
                        <span className="font-medium">{t.prov}</span>
                      </div>
                    </td>
                    <td className="pt-num text-right font-medium">{pesos(t.total)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="pt-barra flex-1">
                          <i style={{ width: `${(pct / 30) * 100}%` }} />
                        </div>
                        <span className="pt-num w-10 text-right text-xs text-[var(--sec)]">{pct.toFixed(0)} %</span>
                      </div>
                    </td>
                    <td className="pt-num text-right">{t.docs}</td>
                    <td className="text-right">
                      <span className={`pt-chip pt-num ${t.var > 0 ? 'pt-chip-ambar' : 'pt-chip-verde'}`}>
                        {t.var > 0 ? '+' : ''}
                        {t.var} %
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/* ------------------------------------------------------ análisis de precios */

type Nivel = 'critica' | 'alta' | 'moderada' | 'baja'
const VARIACIONES: Array<{ item: string; prov: string; ant: number; act: number }> = [
  { item: 'Palta Hass', prov: 'Verdulería El Huerto', ant: 3_200, act: 7_100 },
  { item: 'Limón', prov: 'Verdulería El Huerto', ant: 900, act: 1_950 },
  { item: 'Manteca 5 kg', prov: 'Lácteos del Sur', ant: 21_900, act: 34_100 },
  { item: 'Langostinos 1 kg', prov: 'Pescadería Austral', ant: 18_400, act: 28_300 },
  { item: 'Crema de leche 5 L', prov: 'Lácteos del Sur', ant: 31_200, act: 42_525 },
  { item: 'Aceite de oliva 5 L', prov: 'Mayorista del Valle', ant: 48_000, act: 63_400 },
  { item: 'Lomo', prov: 'Frigorífico Patagonia', ant: 25_800, act: 32_760 },
  { item: 'Tomate perita', prov: 'Verdulería El Huerto', ant: 2_400, act: 1_350 },
  { item: 'Papa blanca 20 kg', prov: 'Verdulería El Huerto', ant: 14_000, act: 8_900 },
]

const EVOLUCION: Record<string, number[]> = {
  'Palta Hass': [2_900, 3_000, 3_100, 3_200, 4_800, 7_100],
  'Manteca 5 kg': [19_800, 20_400, 21_100, 21_900, 28_000, 34_100],
  Lomo: [22_100, 23_400, 24_200, 25_800, 30_100, 32_760],
  'Tomate perita': [2_100, 2_600, 2_900, 2_400, 1_700, 1_350],
}

const COMPARATIVO = [
  { item: 'Harina 0000 × 25 kg', filas: [{ prov: 'Mayorista del Valle', prom: 25_900, ult: 26_225, n: 12 }, { prov: 'Distribuidora Andina', prom: 24_300, ult: 24_800, n: 3 }] },
  { item: 'Crema de leche 5 L', filas: [{ prov: 'Lácteos del Sur', prom: 38_400, ult: 42_525, n: 9 }, { prov: 'Mayorista del Valle', prom: 40_100, ult: 41_000, n: 2 }] },
]

export function PantallaPrecios() {
  const [umbral, setUmbral] = useState({ critica: 100, alta: 50, moderada: 30 })
  const [nivel, setNivel] = useState<Nivel>('critica')
  const [item, setItem] = useState('Palta Hass')
  const [q, setQ] = useState('')

  const clasificar = (pct: number): Nivel | null =>
    pct >= umbral.critica ? 'critica' : pct >= umbral.alta ? 'alta' : pct >= umbral.moderada ? 'moderada' : pct <= -30 ? 'baja' : null
  const filas = VARIACIONES.map((v) => ({ ...v, pct: ((v.act - v.ant) / v.ant) * 100 })).map((v) => ({ ...v, nivel: clasificar(v.pct) }))
  const cuenta = (n: Nivel) => filas.filter((f) => f.nivel === n).length
  const visibles = filas.filter((f) => f.nivel === nivel && f.item.toLowerCase().includes(q.toLowerCase()))

  const NIVELES: Array<{ v: Nivel; t: string; c: string; color: string }> = [
    { v: 'critica', t: 'Críticas', c: 'pt-chip-rojo', color: '#ef4444' },
    { v: 'alta', t: 'Altas', c: 'pt-chip-ambar', color: '#f5a524' },
    { v: 'moderada', t: 'Moderadas', c: 'pt-chip-azul', color: '#3b9bff' },
    { v: 'baja', t: 'Bajas', c: 'pt-chip-verde', color: '#10b981' },
  ]

  return (
    <>
      <Titulo
        escena="informes"
        titulo="Análisis de precios"
        bajada="Qué artículos subieron o bajaron de precio y a qué proveedor te conviene comprarlos."
        acciones={
          <>
            <Periodo />
            <button type="button" className="pt-boton pt-boton-sec">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </>
        }
      />

      <div className="mb-5 space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {NIVELES.map((n) => (
            <button
              key={n.v}
              type="button"
              onClick={() => setNivel(n.v)}
              className="pt-card pt-entra p-4 text-left transition-transform active:scale-[0.98]"
              data-tono={n.v === 'critica' ? 'rojo' : n.v === 'alta' ? 'ambar' : n.v === 'baja' ? 'verde' : undefined}
              style={nivel === n.v ? { boxShadow: `0 0 0 2px ${n.color}, var(--sombra)` } : undefined}
              aria-pressed={nivel === n.v}
            >
              <p className="text-sm text-[var(--sec)]">{n.t}</p>
              <p className="pt-display pt-num mt-1 text-3xl font-semibold" style={{ color: n.color }}>
                {cuenta(n.v)}
              </p>
              <p className="mt-1 text-xs text-[var(--ter)]">
                {n.v === 'baja' ? 'Bajaron más de 30 %' : `Subieron ${umbral[n.v]} % o más`}
              </p>
            </button>
          ))}
        </div>
        <Card titulo="Cuándo avisarte" accion={<span className="text-xs text-[var(--ter)]">Mové los umbrales y mirá cómo cambian las alertas</span>}>
          <div className="grid gap-5 sm:grid-cols-3">
            {(['critica', 'alta', 'moderada'] as const).map((k) => {
              const n = NIVELES.find((x) => x.v === k)!
              return (
                <label
                  key={k}
                  className="block"
                  style={{ '--c1': n.color, '--p': `${((umbral[k] - (k === 'critica' ? 60 : k === 'alta' ? 30 : 10)) / (k === 'critica' ? 140 : k === 'alta' ? 69 : 39)) * 100}%` } as React.CSSProperties}
                >
                  <span className="mb-2 flex justify-between text-xs">
                    <span className="text-[var(--sec)]">{n.t.slice(0, -1)}</span>
                    <span className="pt-num font-medium">desde {umbral[k]} %</span>
                  </span>
                  <input
                    type="range"
                    min={k === 'critica' ? 60 : k === 'alta' ? 30 : 10}
                    max={k === 'critica' ? 200 : k === 'alta' ? 99 : 49}
                    value={umbral[k]}
                    onChange={(e) => setUmbral((u) => ({ ...u, [k]: Number(e.target.value) }))}
                  />
                </label>
              )
            })}
          </div>
        </Card>
      </div>

      <Card
        sinPadding
        className="mb-5"
        titulo={{ critica: 'Aumentos críticos', alta: 'Aumentos altos', moderada: 'Aumentos moderados', baja: 'Bajas de precio' }[nivel]}
        accion={
          <label className="pt-buscador w-56 !h-9">
            <Search className="h-4 w-4 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar artículo" className="w-full bg-transparent text-[var(--texto)] outline-none placeholder:text-[var(--ter)]" />
          </label>
        }
      >
        <div className="overflow-x-auto">
          <table className="pt-tabla min-w-[40rem]">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Proveedor</th>
                <th className="text-right">Antes</th>
                <th className="text-right">Ahora</th>
                <th className="text-right">Variación</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.item} className="cursor-pointer" onClick={() => EVOLUCION[f.item] && setItem(f.item)}>
                  <td className="font-medium">{f.item}</td>
                  <td className="text-[var(--sec)]">{f.prov}</td>
                  <td className="pt-num text-right text-[var(--sec)]">{pesos(f.ant)}</td>
                  <td className="pt-num text-right font-medium">{pesos(f.act)}</td>
                  <td className="text-right">
                    <span className={`pt-chip pt-num ${NIVELES.find((n) => n.v === f.nivel)!.c}`}>
                      {f.pct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {f.pct > 0 ? '+' : ''}
                      {Math.round(f.pct)} %
                    </span>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--sec)]">
                    Sin variaciones en este nivel. Probá bajar el umbral.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card titulo="Cómo cambió el precio">
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.keys(EVOLUCION).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setItem(k)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  item === k ? 'border-transparent bg-[var(--azul)] text-white' : 'border-[var(--borde-fuerte)] text-[var(--sec)] hover:text-[var(--texto)]'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <Area
            key={item}
            alto={200}
            etiquetas={['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct']}
            formato={(n) => pesos(n)}
            series={[{ nombre: item, valores: EVOLUCION[item]!, color: EVOLUCION[item]!.at(-1)! < EVOLUCION[item]![0]! ? '#10b981' : '#3b9bff' }]}
          />
        </Card>

        <Card titulo="Mismo artículo, distintos proveedores">
          <div className="space-y-5">
            {COMPARATIVO.map((c) => {
              const mejor = Math.min(...c.filas.map((f) => f.ult))
              return (
                <div key={c.item}>
                  <p className="mb-2 text-sm font-medium">{c.item}</p>
                  <ul className="space-y-2">
                    {c.filas.map((f) => (
                      <li
                        key={f.prov}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                          f.ult === mejor ? 'border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.06)]' : 'border-[var(--borde)]'
                        }`}
                      >
                        <Inicial nombre={f.prov} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{f.prov}</p>
                          <p className="text-xs text-[var(--ter)]">
                            Promedio {pesos(f.prom)} · {f.n} compras
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="pt-num text-sm font-medium">{pesos(f.ult)}</p>
                          {f.ult === mejor && <span className="text-[11px] font-medium text-[var(--verde)]">Más barato</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </>
  )
}
