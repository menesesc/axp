'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { ArrowRight, Layers, ShoppingCart, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { Barras, Dona, Inicial, PALETA } from './graficos'
import { Kpi, Sparkline, millones, pesos } from './inicio'

interface ItemStats {
  compradoTotal?: number
  byProvider?: Array<{ proveedorId: string | null; proveedor: string; totalItems: number; totalSubtotal: number }>
  byCategoria?: Array<{ categoria: string; totalSubtotal: number }>
  topItems?: Array<{ descripcion: string; totalCantidad: number; totalSubtotal: number; proveedores: number; priceHistory?: Array<{ fecha: string; precio: number }> }>
  priceVariation?: Array<{
    descripcion: string
    precioInicial: number
    precioFinal: number
    variacionPct: number
    compras: number
    documentoInicialId?: string | null
    documentoFinalId?: string | null
  }>
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

function Tarjeta({ titulo, accion, children, className = '' }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`ax-card ax-entra p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="ax-card-titulo">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  )
}

/** Importe que, si sabemos de qué comprobante salió, abre ese comprobante. */
const Comprobante = ({
  id,
  titulo,
  fuerte,
  children,
}: {
  id?: string | null | undefined
  titulo: string
  fuerte?: boolean
  children: React.ReactNode
}) =>
  id ? (
    <Link
      href={`/documento/${id}` as Route}
      title={titulo}
      className={`underline decoration-dotted underline-offset-2 hover:text-[var(--azul-2)] ${fuerte ? 'font-medium text-[var(--texto)]' : ''}`}
    >
      {children}
    </Link>
  ) : (
    <span className={fuerte ? 'font-medium text-[var(--texto)]' : ''}>{children}</span>
  )

const VerTodo = ({ href, texto = 'Ver todo' }: { href: string; texto?: string }) => (
  <Link href={href as Route} className="inline-flex items-center gap-1 text-sm text-[var(--azul-2)] underline-offset-4 hover:underline">
    {texto} <ArrowRight className="h-3.5 w-3.5" />
  </Link>
)

/**
 * Vista "Compras" del inicio: cuánto, en qué, a quién y qué cambió de precio,
 * cada dato con la forma que mejor lo cuenta.
 */
export function VistaCompras({
  datos,
  cargando,
  etiquetaPeriodo,
  montoPorMes,
  verImportes,
}: {
  datos: ItemStats | undefined
  cargando: boolean
  etiquetaPeriodo: string
  montoPorMes: Array<{ mes: string; total: number }> | null
  verImportes: boolean
}) {
  const comprado = datos?.compradoTotal ?? 0
  const proveedores = datos?.byProvider ?? []
  const categorias = (datos?.byCategoria ?? []).filter((c) => c.totalSubtotal > 0)
  const items = datos?.topItems ?? []
  const variaciones = datos?.priceVariation ?? []
  const subas = variaciones.filter((v) => v.variacionPct > 0)
  const bajas = variaciones.filter((v) => v.variacionPct < 0)
  const totalCat = categorias.reduce((s, c) => s + c.totalSubtotal, 0)
  const totalProv = proveedores.reduce((s, p) => s + p.totalSubtotal, 0)

  // Dona: las 5 categorías principales y el resto agrupado.
  const partes = categorias.slice(0, 5).map((c, i) => ({ nombre: c.categoria, valor: c.totalSubtotal, color: PALETA[i]! }))
  const resto = categorias.slice(5).reduce((s, c) => s + c.totalSubtotal, 0)
  if (resto > 0) partes.push({ nombre: 'Otras', valor: resto, color: '#cbd5e1' })
  const principal = categorias[0]

  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta={`Comprado · ${etiquetaPeriodo}`} valor={verImportes ? millones(comprado) : '—'} nota="Total facturado, con IVA" icono={ShoppingCart} cargando={cargando} />
        <Kpi
          etiqueta="Proveedores"
          valor={String(proveedores.length)}
          nota={proveedores[0] ? `El principal: ${capital(proveedores[0].proveedor).slice(0, 24)}` : 'Sin compras en el período'}
          icono={Users}
          href="/proveedores"
          cargando={cargando}
        />
        <Kpi
          etiqueta="Categoría principal"
          valor={principal ? (totalCat ? `${Math.round((principal.totalSubtotal / totalCat) * 100)} %` : '—') : '—'}
          nota={principal ? principal.categoria : 'Sin categorías'}
          tono="verde"
          icono={Layers}
          cargando={cargando}
        />
        <Kpi
          etiqueta="Subieron de precio"
          valor={String(subas.length)}
          nota={subas[0] ? `El mayor: +${Math.round(subas[0].variacionPct)} %` : 'Sin subas fuertes'}
          tono={subas.length ? 'rojo' : 'verde'}
          icono={TrendingUp}
          href="/informes/precios"
          cargando={cargando}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Tarjeta titulo="En qué se fue la plata" accion={<VerTodo href="/items" texto="Por categoría" />}>
          {cargando ? (
            <div className="h-36 animate-pulse rounded-xl bg-slate-900/[0.04]" />
          ) : partes.length ? (
            <Dona
              partes={partes}
              centro={verImportes ? millones(totalCat) : `${categorias.length}`}
              bajada={verImportes ? 'sin IVA' : 'categorías'}
            />
          ) : (
            <p className="py-10 text-center text-sm text-[var(--sec)]">Sin compras con items en el período.</p>
          )}
        </Tarjeta>
        {montoPorMes && montoPorMes.length > 0 && verImportes && (
          <Tarjeta titulo="Cómo vienen tus compras" accion={<span className="text-xs text-[var(--ter)]">Últimos 12 meses</span>}>
            <Barras etiquetas={montoPorMes.map((m) => MESES[Number(m.mes.slice(5, 7)) - 1] ?? m.mes)} valores={montoPorMes.map((m) => m.total)} formato={millones} />
          </Tarjeta>
        )}
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Lo que más compraste" accion={<VerTodo href="/items" />} className="!p-0 [&>div:first-child]:px-5 [&>div:first-child]:pt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--ter)]">
                  <th className="w-10 px-5 pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Artículo</th>
                  <th className="pb-2 font-medium">Precio</th>
                  <th className="px-5 pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {(cargando ? [] : items.slice(0, 7)).map((it, i) => {
                  const historia = (it.priceHistory ?? []).map((h) => h.precio).filter((p) => p > 0)
                  const sube = historia.length > 1 && historia.at(-1)! > historia[0]!
                  return (
                    <tr key={it.descripcion} className="border-t border-slate-900/[0.06] transition-colors hover:bg-[rgba(59,155,255,0.04)]">
                      <td className="px-5 py-3">
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${i < 3 ? 'bg-[rgba(59,155,255,0.12)] text-[var(--azul-2)]' : 'text-[var(--ter)]'}`}>{i + 1}</span>
                      </td>
                      <td className="max-w-[16rem] py-3">
                        <p className="truncate font-medium">{capital(it.descripcion)}</p>
                        <p className="text-xs text-[var(--ter)]">
                          {it.totalCantidad.toLocaleString('es-AR', { maximumFractionDigits: 1 })} unidades
                          {it.proveedores > 1 ? ` · ${it.proveedores} proveedores` : ''}
                        </p>
                      </td>
                      <td className="py-3">{historia.length > 1 ? <Sparkline valores={historia} color={sube ? '#ef4444' : '#10b981'} /> : <span className="text-xs text-[var(--ter)]">—</span>}</td>
                      <td className="ax-num px-5 py-3 text-right font-medium">{verImportes ? pesos(it.totalSubtotal) : '—'}</td>
                    </tr>
                  )
                })}
                {!cargando && items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-[var(--sec)]">
                      Sin compras en el período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {cargando && <div className="mx-5 mb-5 h-48 animate-pulse rounded-xl bg-slate-900/[0.04]" />}
        </Tarjeta>

        <Tarjeta titulo="A quién le compraste" accion={<VerTodo href="/proveedores" />}>
          <ul className="space-y-3.5">
            {proveedores.slice(0, 6).map((p) => {
              const pct = totalProv ? (p.totalSubtotal / totalProv) * 100 : 0
              return (
                <li key={p.proveedor} className="flex items-center gap-3">
                  <Inicial nombre={p.proveedor} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">{capital(p.proveedor)}</p>
                      <span className="ax-num shrink-0 text-xs text-[var(--ter)]">{Math.round(pct)} %</span>
                    </div>
                    <div className="ax-barra mt-1.5">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </li>
              )
            })}
            {!cargando && proveedores.length === 0 && <li className="py-8 text-center text-sm text-[var(--sec)]">Sin compras en el período.</li>}
          </ul>
        </Tarjeta>
      </div>

      {(subas.length > 0 || bajas.length > 0) && (
        <Tarjeta titulo="Precios que cambiaron" accion={<VerTodo href="/informes/precios" texto="Análisis de precios" />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...subas.slice(0, 6), ...bajas.slice(0, 3)].map((v) => {
              const sube = v.variacionPct > 0
              return (
                <div
                  key={v.descripcion}
                  className={`rounded-xl border p-3.5 ${sube ? 'border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.03)]' : 'border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.04)]'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium">{capital(v.descripcion)}</p>
                    <span className={`ax-chip ax-num shrink-0 ${sube ? 'ax-chip-rojo' : 'ax-chip-verde'}`}>
                      {sube ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {sube ? '+' : ''}
                      {Math.round(v.variacionPct)} %
                    </span>
                  </div>
                  {verImportes && (
                    <p className="ax-num mt-2 text-xs text-[var(--sec)]">
                      {/* Cada punta lleva a su comprobante: cuando una variación
                          no cierra, lo primero que se quiere es ver el PDF. */}
                      <Comprobante id={v.documentoInicialId} titulo="Ver el comprobante del precio anterior">
                        {pesos(v.precioInicial)}
                      </Comprobante>{' '}
                      <ArrowRight className="inline h-3 w-3" />{' '}
                      <Comprobante id={v.documentoFinalId} titulo="Ver el comprobante del precio actual" fuerte>
                        {pesos(v.precioFinal)}
                      </Comprobante>
                      <span className="text-[var(--ter)]"> · {v.compras} compras</span>
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </Tarjeta>
      )}
    </>
  )
}
