'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { LogoProveedorEditable } from '@/components/proveedores/logo-proveedor'
import { formatCurrency, formatDate, formatTipoDocumento } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, Building2, CreditCard, FileText, Package, Phone, Receipt, Truck,
} from 'lucide-react'

interface Resumen {
  verImportes: boolean
  proveedor: {
    id: string; razonSocial: string; cuit: string | null; email: string | null; telefono: string | null
    pedidos1Nombre: string | null; pedidos1Telefono: string | null
    pedidos2Nombre: string | null; pedidos2Telefono: string | null
    adminNombre: string | null; adminTelefono: string | null
    diasEntrega: number | null; cbu: string | null; activo: boolean; logoKey: string | null
  }
  saldo: { facturado: number | null; pagado: number | null; pendiente: number | null; documentos: number; sinPagar: number }
  documentos: Array<{ id: string; tipo: string; letra: string | null; numeroCompleto: string | null; fecha: string | null; total: number | null; estado: string; pagado: number | null }>
  pagos: Array<{ id: string; numero: number; fecha: string; estado: string; montoTotal: number | null; documentos: number; metodos: string | null }>
  porMes: Array<{ mes: string; total: number; documentos: number }>
  items: Array<{ descripcion: string; veces: number; cantidad: number | null; ultimoPrecio: number | null; total: number | null }>
}

type Tab = 'documentos' | 'pagos' | 'items'

export default function ProveedorPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('documentos')

  const { data, isLoading, error } = useQuery({
    queryKey: ['proveedor', id],
    queryFn: async () => {
      const res = await fetch(`/api/proveedores/${id}/resumen`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo cargar')
      return res.json() as Promise<Resumen>
    },
  })

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
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
  const maxMes = Math.max(1, ...data.porMes.map((m) => Math.abs(m.total)))

  const contactos = [
    { icono: Phone, rol: 'Pedidos', nombre: p.pedidos1Nombre, tel: p.pedidos1Telefono },
    { icono: Phone, rol: 'Pedidos 2', nombre: p.pedidos2Nombre, tel: p.pedidos2Telefono },
    { icono: Receipt, rol: 'Administración', nombre: p.adminNombre, tel: p.adminTelefono },
  ].filter((c) => c.nombre || c.tel)

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <Link href="/proveedores" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Proveedores
        </Link>

        {/* Ficha */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start gap-4">
            <LogoProveedorEditable id={p.id} nombre={p.razonSocial} conLogo={!!p.logoKey} size={72} />
            <div className="min-w-[14rem] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight">{p.razonSocial}</h1>
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
              Sin contactos cargados. Se editan desde el listado de proveedores.
            </p>
          )}
        </div>

        {/* Saldo */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titulo="Comprado" valor={$(saldo.facturado)} detalle={`${saldo.documentos} comprobantes`} />
          <Kpi titulo="Pagado" valor={$(saldo.pagado)} detalle={`${data.pagos.length} órdenes`} />
          <Kpi
            titulo="Saldo pendiente"
            valor={$(saldo.pendiente)}
            detalle={saldo.sinPagar > 0 ? `${saldo.sinPagar} sin pagar` : 'Todo pagado'}
            tono={saldo.pendiente != null && saldo.pendiente > 1 ? 'alerta' : 'ok'}
          />
          <Kpi titulo="Items distintos" valor={String(data.items.length)} detalle="comprados alguna vez" />
        </div>

        {/* Compras por mes */}
        {verImportes && data.porMes.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">Compras por mes</h2>
            <div className="mt-4 flex items-end gap-1.5" style={{ height: 120 }}>
              {data.porMes.map((m) => (
                <div key={m.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    title={`${m.mes}: ${formatCurrency(m.total)} · ${m.documentos} comprobantes`}
                    className="w-full rounded-t bg-slate-800 transition-all hover:bg-slate-700"
                    style={{ height: `${Math.max(2, (Math.abs(m.total) / maxMes) * 100)}%` }}
                  />
                  <span className="truncate text-[10px] text-slate-400">{m.mes.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pestañas */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex gap-1 border-b border-slate-100 p-1.5">
            {([
              ['documentos', 'Comprobantes', FileText, data.documentos.length],
              ['pagos', 'Pagos', CreditCard, data.pagos.length],
              ['items', 'Items', Package, data.items.length],
            ] as Array<[Tab, string, typeof FileText, number]>).map(([v, l, Icono, n]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                  tab === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                )}
              >
                <Icono className="h-4 w-4" />
                {l}
                <span className={cn('text-xs', tab === v ? 'text-white/60' : 'text-slate-400')}>{n}</span>
              </button>
            ))}
          </div>

          <div className="max-h-[32rem] overflow-y-auto">
            {tab === 'documentos' && (
              <Tabla
                cols={['Comprobante', 'Fecha', 'Total', 'Estado']}
                vacio="Sin comprobantes."
                filas={data.documentos.map((d) => ({
                  key: d.id,
                  href: `/documento/${d.id}`,
                  celdas: [
                    <span key="c" className="font-medium">
                      {formatTipoDocumento(d.tipo)} {d.letra} {d.numeroCompleto ?? ''}
                    </span>,
                    formatDate(d.fecha),
                    <span key="t" className="tabular-nums">{$(d.total)}</span>,
                    <Estado key="e" valor={d.estado} />,
                  ],
                }))}
              />
            )}
            {tab === 'pagos' && (
              <Tabla
                cols={['Orden', 'Fecha', 'Monto', 'Estado']}
                vacio="Sin pagos registrados."
                filas={data.pagos.map((p2) => ({
                  key: p2.id,
                  href: `/pagos/${p2.id}`,
                  celdas: [
                    <span key="o" className="font-medium">
                      OP {String(p2.numero).padStart(6, '0')}
                      <span className="ml-2 text-xs text-slate-400">
                        {p2.documentos} doc{p2.documentos === 1 ? '' : 's'}
                        {p2.metodos ? ` · ${p2.metodos.toLowerCase()}` : ''}
                      </span>
                    </span>,
                    formatDate(p2.fecha),
                    <span key="m" className="tabular-nums">{$(p2.montoTotal)}</span>,
                    <Estado key="e" valor={p2.estado} />,
                  ],
                }))}
              />
            )}
            {tab === 'items' && (
              <Tabla
                cols={['Descripción', 'Veces', 'Último precio', 'Total']}
                vacio="Sin items."
                filas={data.items.map((it, k) => ({
                  key: `${it.descripcion}-${k}`,
                  celdas: [
                    <span key="d" className="font-medium">{it.descripcion}</span>,
                    <span key="v" className="tabular-nums text-slate-500">{it.veces}</span>,
                    <span key="p" className="tabular-nums">{$(it.ultimoPrecio)}</span>,
                    <span key="t" className="tabular-nums">{$(it.total)}</span>,
                  ],
                }))}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function Kpi({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle: string; tono?: 'ok' | 'alerta' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', tono === 'alerta' && 'text-amber-700')}>{valor}</p>
      <p className="mt-0.5 text-xs text-slate-400">{detalle}</p>
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
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium text-slate-500">
        <tr>
          {cols.map((c, i) => (
            <th key={c} className={cn('px-4 py-2', i > 0 && 'text-right', i === cols.length - 1 && 'text-right')}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filas.map((f) => (
          <tr key={f.key} className={cn('hover:bg-slate-50', f.href && 'cursor-pointer')}>
            {f.celdas.map((c, i) => (
              <td key={i} className={cn('px-4 py-2.5', i > 0 && 'text-right whitespace-nowrap')}>
                {i === 0 && f.href ? (
                  <Link href={f.href} className="block hover:underline">{c}</Link>
                ) : (
                  c
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
