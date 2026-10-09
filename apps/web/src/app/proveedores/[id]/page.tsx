'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { LogoProveedorEditable } from '@/components/proveedores/logo-proveedor'
import { EditarProveedorDialog } from '@/components/proveedores/editar-proveedor-dialog'
import { SelectorPeriodo, periodoDe, ATAJOS_PROVEEDOR, type Periodo } from '@/components/ui/periodo'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { formatCurrency, formatDate, formatTipoDocumento, cn } from '@/lib/utils'
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Building2, CreditCard, ExternalLink, FileText,
  LineChart as LineChartIcon, Package, Pencil, Phone, Receipt, TrendingUp, Truck, Wallet,
} from 'lucide-react'

interface Resumen {
  verImportes: boolean
  rango: { desde: string; hasta: string; primeraCompra: string | null }
  proveedor: {
    id: string; razonSocial: string; cuit: string | null; email: string | null; telefono: string | null
    pedidos1Nombre: string | null; pedidos1Telefono: string | null
    pedidos2Nombre: string | null; pedidos2Telefono: string | null
    adminNombre: string | null; adminTelefono: string | null
    diasEntrega: number | null; cbu: string | null; activo: boolean; logoKey: string | null
    alias: string[]; letra: string | null; rubro: string
  }
  saldo: {
    comprado: number | null; pagado: number | null; documentos: number
    ticket: number | null; pendiente: number | null; sinPagar: number
  }
  porMes: Array<{ mes: string; comprado: number; pagado: number; documentos: number }>
  documentos: Array<{
    id: string; tipo: string; letra: string | null; numeroCompleto: string | null
    fecha: string | null; total: number | null; estado: string; pagado: number | null
    pendiente: number | null; items: number
  }>
  pagos: Array<{
    id: string; numero: number; fecha: string; estado: string
    montoTotal: number | null; documentos: number; metodos: string | null
  }>
  items: Array<{
    descripcion: string; veces: number; cantidad: number | null; unidad: string | null
    primerPrecio: number | null; ultimoPrecio: number | null; minimo: number | null; maximo: number | null
    variacionPct: number | null; total: number | null; ultimaFecha: string | null; atipicos: number
  }>
  indice: Array<{ mes: string; indice: number | null; items: number }>
}

type Tab = 'resumen' | 'documentos' | 'pagos' | 'items' | 'precios'

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesLabel = (m: string) => `${MES_CORTO[Number(m.slice(5, 7)) - 1] ?? m} ${m.slice(2, 4)}`

/** Importes del eje: en millones, que es la escala de una compra mensual. */
function compacto(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (abs >= 1_000) return `${Math.round(n / 1_000)} k`
  return String(Math.round(n))
}

export default function ProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { canEdit, isAdmin } = useUser()
  const puedeEditar = canEdit(SECCION.DOC_PROVEEDORES)

  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('ultimos12m'))
  const [tab, setTab] = useState<Tab>('resumen')
  const [editando, setEditando] = useState(false)
  const [soloDeuda, setSoloDeuda] = useState(false)
  const [aPagar, setAPagar] = useState<Set<string>>(new Set())

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (periodo.clave === 'todo') p.set('todo', '1')
    else {
      p.set('desde', periodo.desde)
      p.set('hasta', periodo.hasta)
    }
    return p.toString()
  }, [periodo])

  const { data, isLoading, error } = useQuery({
    queryKey: ['proveedor', id, qs],
    queryFn: async () => {
      const res = await fetch(`/api/proveedores/${id}/resumen?${qs}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo cargar')
      return res.json() as Promise<Resumen>
    },
    // Al cambiar el período se mantiene lo anterior en pantalla: la ficha no
    // parpadea en blanco mientras vuelve la consulta.
    placeholderData: (previa) => previa,
  })

  if (isLoading && !data) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </DashboardLayout>
    )
  }
  if (!data) {
    // El motivo a la vista: un 404 y un error del servidor se veían igual y
    // mandaban a buscar el problema donde no estaba.
    return (
      <DashboardLayout>
        <p className="py-16 text-center text-sm text-slate-500">
          {error instanceof Error ? error.message : 'No encontramos este proveedor.'}{' '}
          <Link href="/proveedores" className="font-semibold text-slate-900 underline">Volver</Link>
        </p>
      </DashboardLayout>
    )
  }

  const { proveedor: p, saldo, verImportes } = data
  const $ = (n: number | null | undefined) => (n == null ? '—' : formatCurrency(n))

  const contactos = [
    { icono: Phone, rol: 'Pedidos', nombre: p.pedidos1Nombre, tel: p.pedidos1Telefono },
    { icono: Phone, rol: 'Pedidos 2', nombre: p.pedidos2Nombre, tel: p.pedidos2Telefono },
    { icono: Receipt, rol: 'Administración', nombre: p.adminNombre, tel: p.adminTelefono },
  ].filter((c) => c.nombre || c.tel)

  // Aumento del período: el último punto del índice contra la base 100.
  const ultimoIndice = [...data.indice].reverse().find((r) => r.indice != null)
  const aumento = ultimoIndice?.indice != null ? ultimoIndice.indice - 100 : null
  const indiceFlojo = (ultimoIndice?.items ?? 0) > 0 && (ultimoIndice?.items ?? 0) < 5

  const debiendo = data.documentos.filter((d) => (d.pendiente ?? 0) > 0)
  const totalElegido = data.documentos
    .filter((d) => aPagar.has(d.id))
    .reduce((s, d) => s + (d.pendiente ?? 0), 0)

  /**
   * Abre el wizard de pago. Con comprobantes marcados los lleva ya
   * seleccionados, que es el camino que antes obligaba a pasar por Pagos y
   * volver a buscar el proveedor.
   */
  const irAPagar = (documentos?: string[]) => {
    sessionStorage.setItem('pendingPaymentProveedor', p.id)
    if (documentos?.length) sessionStorage.setItem('pendingPaymentDocs', JSON.stringify(documentos))
    router.push('/pagos/nueva')
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/proveedores" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Proveedores
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <SelectorPeriodo valor={periodo} onCambiar={setPeriodo} atajos={ATAJOS_PROVEEDOR} />
            {puedeEditar && (
              <Button variant="outline" size="sm" className="h-10" onClick={() => setEditando(true)}>
                <Pencil className="mr-1.5 h-4 w-4" />
                Editar
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" className="h-10" onClick={() => irAPagar()}>
                <Wallet className="mr-1.5 h-4 w-4" />
                Pagar
              </Button>
            )}
          </div>
        </div>

        {/* Ficha */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start gap-4">
            <LogoProveedorEditable id={p.id} nombre={p.razonSocial} conLogo={!!p.logoKey} size={72} />
            <div className="min-w-[14rem] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight">{p.razonSocial}</h1>
                {p.letra && (
                  <span className="rounded border border-slate-200 px-1.5 text-xs font-bold text-slate-500">{p.letra}</span>
                )}
                {p.rubro && p.rubro !== 'MERCADERIA' && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                    {p.rubro === 'SERVICIO' ? 'Servicio' : p.rubro === 'IMPUESTO' ? 'Impuesto' : 'Otro'}
                  </span>
                )}
                {!p.activo && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Inactivo</span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                {p.cuit && <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />CUIT {p.cuit}</span>}
                {p.email && <span className="truncate">{p.email}</span>}
                {p.diasEntrega != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    Entrega en {p.diasEntrega === 0 ? 'el día' : `${p.diasEntrega} día${p.diasEntrega === 1 ? '' : 's'}`}
                  </span>
                )}
                {p.cbu && <span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" />CBU {p.cbu}</span>}
              </div>
              {p.alias?.length > 0 && (
                <p className="mt-1 text-xs text-slate-400">También aparece como: {p.alias.join(' · ')}</p>
              )}
            </div>
          </div>

          {contactos.length > 0 ? (
            <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
              {contactos.map((c) => (
                <div key={c.rol} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    <c.icono className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{c.rol}</p>
                    {c.nombre && <p className="truncate text-sm font-medium">{c.nombre}</p>}
                    {c.tel && (
                      <a
                        href={`https://wa.me/${c.tel.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-slate-500 hover:text-emerald-700 hover:underline"
                      >
                        {c.tel}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-400">
              Sin contactos cargados.{' '}
              {puedeEditar && (
                <button onClick={() => setEditando(true)} className="font-medium text-slate-600 underline">
                  Cargarlos
                </button>
              )}
            </p>
          )}
        </div>

        {/* Indicadores del período */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            titulo="Comprado"
            valor={$(saldo.comprado)}
            detalle={`${saldo.documentos} comprobantes · ${periodo.etiqueta.toLowerCase()}`}
          />
          <Kpi titulo="Pagado" valor={$(saldo.pagado)} detalle={`${data.pagos.length} órdenes en el período`} />
          <Kpi
            titulo="Saldo pendiente"
            valor={$(saldo.pendiente)}
            detalle={saldo.sinPagar > 0 ? `${saldo.sinPagar} sin pagar · histórico` : 'Todo pagado'}
            tono={saldo.pendiente != null && saldo.pendiente > 1 ? 'alerta' : 'ok'}
            onClick={
              debiendo.length > 0
                ? () => {
                    setSoloDeuda(true)
                    setTab('documentos')
                  }
                : undefined
            }
          />
          <Kpi titulo="Factura promedio" valor={$(saldo.ticket)} detalle="en el período" />
          <Kpi
            titulo="Aumento de precios"
            valor={aumento == null ? '—' : `${aumento > 0 ? '+' : ''}${aumento.toFixed(1)}%`}
            detalle={aumento == null ? 'sin items repetidos' : `${data.items.length} items del período`}
            tono={aumento != null && aumento > 0 ? 'alerta' : 'ok'}
          />
        </div>

        {/* Submenú */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 p-1.5">
            {([
              ['resumen', 'Resumen', TrendingUp, null],
              ['documentos', 'Comprobantes', FileText, data.documentos.length],
              ['pagos', 'Pagos', CreditCard, data.pagos.length],
              ['items', 'Items', Package, data.items.length],
              ['precios', 'Precios', LineChartIcon, null],
            ] as Array<[Tab, string, typeof FileText, number | null]>).map(([v, l, Icono, n]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                  tab === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                )}
              >
                <Icono className="h-4 w-4" />
                {l}
                {n != null && <span className={cn('text-xs', tab === v ? 'text-white/60' : 'text-slate-400')}>{n}</span>}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === 'resumen' && (
              <VistaResumen
                data={data}
                verImportes={verImportes}
                onVerTodo={setTab}
                soloDeuda={soloDeuda}
                onSoloDeuda={setSoloDeuda}
                debiendo={debiendo}
              />
            )}

            {tab === 'documentos' && (
              <VistaComprobantes
                data={data}
                proveedorId={p.id}
                soloDeuda={soloDeuda}
                onSoloDeuda={setSoloDeuda}
                elegidos={aPagar}
                onElegir={setAPagar}
                debiendo={debiendo}
                totalElegido={totalElegido}
                puedePagar={isAdmin}
                onPagar={irAPagar}
              />
            )}

            {tab === 'pagos' && (
              <>
                <Encabezado titulo="Órdenes de pago del período" href="/pagos" accion="Ver todas" />
                <Tabla
                  cols={['Orden', 'Fecha', 'Documentos', 'Monto', 'Estado']}
                  vacio="Sin pagos en el período."
                  filas={data.pagos.map((pg) => ({
                    key: pg.id,
                    href: `/pagos/${pg.id}`,
                    celdas: [
                      <span key="o" className="font-medium">
                        OP {String(pg.numero).padStart(6, '0')}
                        {pg.metodos && <span className="ml-2 text-xs text-slate-400">{pg.metodos.toLowerCase()}</span>}
                      </span>,
                      formatDate(pg.fecha),
                      <span key="d" className="tabular-nums text-slate-500">{pg.documentos}</span>,
                      <span key="m" className="tabular-nums">{$(pg.montoTotal)}</span>,
                      <Estado key="e" valor={pg.estado} />,
                    ],
                  }))}
                />
              </>
            )}

            {tab === 'items' && <VistaItems data={data} proveedorId={p.id} />}

            {tab === 'precios' && <VistaPrecios data={data} aumento={aumento} indiceFlojo={indiceFlojo} />}
          </div>
        </div>
      </div>

      {puedeEditar && (
        <EditarProveedorDialog
          proveedor={{
            id: p.id,
            razonSocial: p.razonSocial,
            cuit: p.cuit,
            letra: p.letra,
            alias: p.alias ?? [],
            email: p.email,
            pedidos1Nombre: p.pedidos1Nombre,
            pedidos1Telefono: p.pedidos1Telefono,
            pedidos2Nombre: p.pedidos2Nombre,
            pedidos2Telefono: p.pedidos2Telefono,
            adminNombre: p.adminNombre,
            adminTelefono: p.adminTelefono,
            diasEntrega: p.diasEntrega,
            cbu: p.cbu,
            activo: p.activo,
            rubro: p.rubro,
          }}
          abierto={editando}
          onCerrar={() => setEditando(false)}
        />
      )}
    </DashboardLayout>
  )
}

/* ------------------------------------------------------------------ */

function VistaResumen({
  data,
  verImportes,
  onVerTodo,
  soloDeuda,
  onSoloDeuda,
  debiendo,
}: {
  data: Resumen
  verImportes: boolean
  onVerTodo: (t: Tab) => void
  soloDeuda: boolean
  onSoloDeuda: (v: boolean) => void
  debiendo: Resumen['documentos']
}) {
  const ultimos = soloDeuda ? debiendo : data.documentos
  const serie = data.porMes.map((m) => ({ ...m, label: mesLabel(m.mes) }))
  const hayMovimiento = serie.some((m) => m.comprado !== 0 || m.pagado !== 0)
  const topItems = data.items.slice(0, 6)
  const maxItem = Math.max(1, ...topItems.map((i) => Math.abs(i.total ?? 0)))

  return (
    <div className="space-y-6">
      {verImportes && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Compras y pagos por mes</h2>
          {!hayMovimiento ? (
            <p className="py-12 text-center text-sm text-slate-400">Sin movimientos en el período.</p>
          ) : (
            <div className="mt-3 h-64">
              <ResponsiveContainer>
                <ComposedChart data={serie} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={compacto} tick={{ fontSize: 11 }} width={52} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={((v: number, n: string) => [formatCurrency(v), n === 'comprado' ? 'Comprado' : 'Pagado']) as never}
                  />
                  <Legend
                    formatter={(v) => <span className="text-xs text-slate-500">{v === 'comprado' ? 'Comprado' : 'Pagado'}</span>}
                  />
                  <Bar dataKey="comprado" fill="#1e293b" radius={[4, 4, 0, 0]} maxBarSize={38} />
                  <Line type="monotone" dataKey="pagado" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Encabezado titulo="Lo que más se le compra" accion="Ver todos" onClick={() => onVerTodo('items')} />
          {topItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sin items en el período.</p>
          ) : (
            <ul className="space-y-2.5">
              {topItems.map((it) => (
                <li key={it.descripcion}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-slate-700" title={it.descripcion}>{it.descripcion}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {it.total == null ? `${it.veces}×` : formatCurrency(it.total)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-800"
                      style={{ width: `${Math.max(2, (Math.abs(it.total ?? 0) / maxItem) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Últimos comprobantes</h2>
            <div className="flex items-center gap-1 text-xs">
              {/* Ver qué se le debe sin pasar por Pagos, que era el rodeo. */}
              {([[false, 'Todos'], [true, 'Se deben']] as Array<[boolean, string]>).map(([v, l]) => (
                <button
                  key={l}
                  onClick={() => onSoloDeuda(v)}
                  disabled={v && debiendo.length === 0}
                  className={cn(
                    'rounded-md px-2 py-1 font-medium transition disabled:opacity-40',
                    soloDeuda === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                  )}
                >
                  {l}
                  {v && debiendo.length > 0 && <span className="ml-1 opacity-60">{debiendo.length}</span>}
                </button>
              ))}
              <button onClick={() => onVerTodo('documentos')} className="ml-1 text-slate-500 hover:text-slate-900 hover:underline">
                Ver todos
              </button>
            </div>
          </div>
          {ultimos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              {soloDeuda ? 'No hay comprobantes sin pagar en el período.' : 'Sin comprobantes en el período.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ultimos.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <Link href={`/documento/${d.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {formatTipoDocumento(d.tipo)} {d.letra} {d.numeroCompleto ?? ''}
                      </span>
                      <span className="text-xs text-slate-400">{formatDate(d.fecha)} · {d.items} items</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm tabular-nums">{d.total == null ? '—' : formatCurrency(d.total)}</span>
                      {(d.pendiente ?? 0) > 0 && (
                        <span className="text-[11px] text-amber-700">debe {formatCurrency(d.pendiente ?? 0)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function VistaComprobantes({
  data,
  proveedorId,
  soloDeuda,
  onSoloDeuda,
  elegidos,
  onElegir,
  debiendo,
  totalElegido,
  puedePagar,
  onPagar,
}: {
  data: Resumen
  proveedorId: string
  soloDeuda: boolean
  onSoloDeuda: (v: boolean) => void
  elegidos: Set<string>
  onElegir: (s: Set<string>) => void
  debiendo: Resumen['documentos']
  totalElegido: number
  puedePagar: boolean
  onPagar: (documentos?: string[]) => void
}) {
  const lista = soloDeuda ? debiendo : data.documentos
  // Al wizard sólo pueden ir comprobantes confirmados: es lo que valida el
  // listado de compras, y si no, el pago se arma y falla después.
  const pagables = debiendo.filter((d) => d.estado === 'CONFIRMADO')

  const alternar = (id: string) => {
    const n = new Set(elegidos)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    onElegir(n)
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs">
          {([[false, 'Todos'], [true, 'Se deben']] as Array<[boolean, string]>).map(([v, l]) => (
            <button
              key={l}
              onClick={() => onSoloDeuda(v)}
              disabled={v && debiendo.length === 0}
              className={cn(
                'rounded-md px-2.5 py-1.5 font-medium transition disabled:opacity-40',
                soloDeuda === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
              )}
            >
              {l}
              <span className="ml-1 opacity-60">{v ? debiendo.length : data.documentos.length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {soloDeuda && pagables.length > 0 && puedePagar && (
            <>
              <button
                onClick={() => onElegir(new Set(elegidos.size === pagables.length ? [] : pagables.map((d) => d.id)))}
                className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
              >
                {elegidos.size === pagables.length ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
              <Button size="sm" disabled={elegidos.size === 0} onClick={() => onPagar([...elegidos])}>
                <Wallet className="mr-1.5 h-4 w-4" />
                Pagar {elegidos.size > 0 ? `${elegidos.size} · ${formatCurrency(totalElegido)}` : ''}
              </Button>
            </>
          )}
          <Link
            href={`/documentos?proveedorId=${proveedorId}`}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 hover:underline"
          >
            Ver en Compras
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <Tabla
        cols={soloDeuda ? ['Comprobante', 'Fecha', 'Total', 'Pagado', 'Debe'] : ['Comprobante', 'Fecha', 'Items', 'Total', 'Estado']}
        vacio={soloDeuda ? 'No hay comprobantes sin pagar en el período.' : 'Sin comprobantes en el período.'}
        filas={lista.map((d) => {
          const seleccionable = soloDeuda && puedePagar && d.estado === 'CONFIRMADO'
          const comprobante = (
            <span key="c" className="inline-flex items-center gap-2">
              {soloDeuda && puedePagar && (
                <input
                  type="checkbox"
                  checked={elegidos.has(d.id)}
                  disabled={!seleccionable}
                  title={seleccionable ? '' : 'Hay que confirmar el comprobante antes de pagarlo'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => alternar(d.id)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 disabled:opacity-40"
                />
              )}
              <Link href={`/documento/${d.id}`} className="truncate font-medium hover:underline">
                {formatTipoDocumento(d.tipo)} {d.letra} {d.numeroCompleto ?? ''}
              </Link>
            </span>
          )
          return {
            key: d.id,
            celdas: soloDeuda
              ? [
                  comprobante,
                  formatDate(d.fecha),
                  <span key="t" className="tabular-nums text-slate-500">{d.total == null ? '—' : formatCurrency(d.total)}</span>,
                  <span key="p" className="tabular-nums text-slate-500">{d.pagado ? formatCurrency(d.pagado) : '—'}</span>,
                  <span key="d" className="font-medium tabular-nums text-amber-700">
                    {d.pendiente == null ? '—' : formatCurrency(d.pendiente)}
                  </span>,
                ]
              : [
                  comprobante,
                  formatDate(d.fecha),
                  <span key="i" className="tabular-nums text-slate-500">{d.items}</span>,
                  <span key="t" className="tabular-nums">{d.total == null ? '—' : formatCurrency(d.total)}</span>,
                  <Estado key="e" valor={d.estado} />,
                ],
          }
        })}
      />
    </>
  )
}

function VistaPrecios({
  data,
  aumento,
  indiceFlojo,
}: {
  data: Resumen
  aumento: number | null
  indiceFlojo: boolean
}) {
  const serie = data.indice.map((r) => ({ ...r, label: mesLabel(r.mes) }))
  const conVariacion = data.items
    .filter((i) => i.variacionPct != null)
    .sort((a, b) => Math.abs(b.variacionPct ?? 0) - Math.abs(a.variacionPct ?? 0))
  const atipicos = data.items.reduce((n, i) => n + i.atipicos, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Índice de precios</h2>
        <p className="mt-0.5 max-w-3xl text-xs text-slate-400">
          Base 100 en el primer mes. Compara cada item contra su propia compra anterior y promedia ponderando por lo
          que pesa en la factura, así el índice mide precios y no cambios en lo que se compró.
        </p>
        {serie.length < 2 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            Hace falta más de un mes con items repetidos para medir la evolución.
          </p>
        ) : (
          <div className="mt-3 h-56">
            <ResponsiveContainer>
              <LineChart data={serie} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} width={44} domain={['auto', 'auto']} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={((v: number, _n: string, o: { payload?: { items?: number } }) => [
                    `${v.toFixed(1)} (${o?.payload?.items ?? 0} items comparados)`,
                    'Índice',
                  ]) as never}
                />
                <Line type="monotone" dataKey="indice" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-2 space-y-1 text-xs text-slate-500">
          {aumento != null && (
            <p>
              Acumulado del período:{' '}
              <strong className={aumento > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                {aumento > 0 ? '+' : ''}{aumento.toFixed(1)}%
              </strong>
            </p>
          )}
          {indiceFlojo && (
            <p className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              El último mes se apoya en menos de 5 items: tomalo como provisorio.
            </p>
          )}
          {atipicos > 0 && (
            <p>
              {atipicos} línea{atipicos === 1 ? '' : 's'} quedaron afuera del cálculo por tener un precio muy lejos de la
              mediana de su item: casi siempre es el extractor leyendo mal un número del PDF.
            </p>
          )}
        </div>
      </div>

      <div>
        <Encabezado titulo="Items que más se movieron" />
        <Tabla
          cols={['Item', 'Compras', 'Primero', 'Último', 'Variación']}
          vacio="Ningún item se compró dos veces en el período."
          filas={conVariacion.slice(0, 50).map((it) => ({
            key: it.descripcion,
            celdas: [
              <span key="d" className="font-medium">
                {it.descripcion}
                {it.atipicos > 0 && (
                  <span
                    className="ml-1.5 text-[10px] text-amber-600"
                    title={`${it.atipicos} línea(s) con precio atípico, excluidas del cálculo`}
                  >
                    ⚠ {it.atipicos}
                  </span>
                )}
              </span>,
              <span key="v" className="tabular-nums text-slate-500">{it.veces}</span>,
              <span key="p" className="tabular-nums text-slate-500">
                {it.primerPrecio == null ? '—' : formatCurrency(it.primerPrecio)}
              </span>,
              <span key="u" className="tabular-nums">{it.ultimoPrecio == null ? '—' : formatCurrency(it.ultimoPrecio)}</span>,
              <Variacion key="x" pct={it.variacionPct} />,
            ],
          }))}
        />
      </div>
    </div>
  )
}

function VistaItems({ data, proveedorId }: { data: Resumen; proveedorId: string }) {
  type Orden = 'total' | 'variacion' | 'veces' | 'nombre'
  const [orden, setOrden] = useState<Orden>('total')

  const items = useMemo(() => {
    const xs = [...data.items]
    if (orden === 'variacion') xs.sort((a, b) => (b.variacionPct ?? -Infinity) - (a.variacionPct ?? -Infinity))
    if (orden === 'veces') xs.sort((a, b) => b.veces - a.veces)
    if (orden === 'nombre') xs.sort((a, b) => a.descripcion.localeCompare(b.descripcion))
    return xs
  }, [data.items, orden])

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Items comprados en el período</h2>
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/items?proveedorId=${proveedorId}`}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 hover:underline"
          >
            Ver en Items
            <ExternalLink className="h-3 w-3" />
          </Link>
          <span className="text-slate-400">Ordenar por</span>
          {([['total', 'monto'], ['variacion', 'aumento'], ['veces', 'compras'], ['nombre', 'nombre']] as Array<
            [Orden, string]
          >).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setOrden(v)}
              className={cn(
                'rounded-md px-2 py-1 font-medium transition',
                orden === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <Tabla
        cols={['Item', 'Compras', 'Cantidad', 'Último precio', 'Variación', 'Total']}
        vacio="Sin items en el período."
        filas={items.map((it) => ({
          key: it.descripcion,
          celdas: [
            <span key="d" className="font-medium">{it.descripcion}</span>,
            <span key="v" className="tabular-nums text-slate-500">{it.veces}</span>,
            <span key="c" className="tabular-nums text-slate-500">
              {it.cantidad == null ? '—' : it.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              {it.unidad ? ` ${it.unidad.toLowerCase()}` : ''}
            </span>,
            <span key="p" className="tabular-nums">
              {it.ultimoPrecio == null ? '—' : formatCurrency(it.ultimoPrecio)}
              {it.ultimaFecha && <span className="ml-1.5 text-xs text-slate-400">{formatDate(it.ultimaFecha)}</span>}
            </span>,
            <Variacion key="x" pct={it.variacionPct} />,
            <span key="t" className="tabular-nums">{it.total == null ? '—' : formatCurrency(it.total)}</span>,
          ],
        }))}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */

function Kpi({
  titulo,
  valor,
  detalle,
  tono,
  onClick,
}: {
  titulo: string
  valor: string
  detalle: string
  tono?: 'ok' | 'alerta'
  onClick?: (() => void) | undefined
}) {
  const Caja = onClick ? 'button' : 'div'
  return (
    <Caja
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4 text-left',
        onClick && 'transition hover:border-slate-300 hover:bg-slate-50'
      )}
    >
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', tono === 'alerta' && 'text-amber-700')}>{valor}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detalle}</p>
    </Caja>
  )
}

function Variacion({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-slate-300">—</span>
  const sube = pct > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        sube ? 'bg-amber-50 text-amber-700' : pct < 0 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'
      )}
    >
      {sube && <ArrowUpRight className="h-3 w-3" />}
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

function Encabezado({
  titulo,
  href,
  accion,
  onClick,
}: {
  titulo: string
  href?: string
  accion?: string
  onClick?: () => void
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-slate-700">{titulo}</h2>
      {accion && href && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 hover:underline">
          {accion}
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
      {accion && !href && onClick && (
        <button onClick={onClick} className="text-xs text-slate-500 hover:text-slate-900 hover:underline">
          {accion}
        </button>
      )}
    </div>
  )
}

function Estado({ valor }: { valor: string }) {
  const color =
    valor === 'PAGADO' || valor === 'PAGADA'
      ? 'bg-emerald-50 text-emerald-700'
      : valor === 'CONFIRMADO' || valor === 'EMITIDA'
        ? 'bg-sky-50 text-sky-700'
        : valor === 'ERROR'
          ? 'bg-red-50 text-red-700'
          : 'bg-slate-100 text-slate-600'
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', color)}>{valor.toLowerCase()}</span>
}

function Tabla({
  cols,
  filas,
  vacio,
}: {
  cols: string[]
  filas: Array<{ key: string; href?: string; celdas: React.ReactNode[] }>
  vacio: string
}) {
  if (filas.length === 0) return <p className="p-10 text-center text-sm text-slate-400">{vacio}</p>
  return (
    <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-100">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            {cols.map((c, i) => (
              <th key={c} className={cn('px-4 py-2', i > 0 ? 'text-right' : 'w-full')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((f) => (
            <tr key={f.key} className="hover:bg-slate-50">
              {f.celdas.map((celda, i) => (
                <td
                  key={i}
                  className={cn('px-4 py-2.5', i > 0 ? 'whitespace-nowrap text-right' : 'w-full max-w-0 truncate')}
                >
                  {f.href && i === 0 ? (
                    <Link href={f.href} className="block truncate hover:underline">
                      {celda}
                    </Link>
                  ) : (
                    celda
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
