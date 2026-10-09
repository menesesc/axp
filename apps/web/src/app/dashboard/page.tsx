'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Receipt,
  ScanLine,
  ShoppingBasket,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import type { NombreEscena } from '@/components/layout/escenas'
import { useUser } from '@/hooks/use-user'
import { useSubscription } from '@/hooks/use-subscription'
import { useRealtimeDocumentos } from '@/hooks/use-realtime-documentos'
import { SECCION } from '@/lib/permisos'
import { RecentDocumentsCard } from '@/components/dashboard/recent-documents-card'
import { StatusChart } from '@/components/dashboard/status-chart'
import { PaymentsSummary } from '@/components/dashboard/payments-summary'
import { ProviderTotalsChart } from '@/components/dashboard/provider-totals-chart'
import { ProviderDebtCard } from '@/components/dashboard/provider-debt-card'
import { MonthlyAmountChart } from '@/components/dashboard/monthly-amount-chart'
import { PurchasingTabContent } from '@/components/dashboard/purchasing-tab'
import { RubrosBreakdownCard } from '@/components/dashboard/rubros-breakdown-card'
import { AvisosHoy, Kpi, UsoPlan, VencimientosSemana, millones, pesos, type Aviso } from '@/components/dashboard/inicio'
import { SelectorPeriodo, periodoDe, type Periodo } from '@/components/ui/periodo'

type Vista = 'hoy' | 'finanzas' | 'compras'

const ESCENA: Record<Vista, NombreEscena> = { hoy: 'inicio', finanzas: 'pagos', compras: 'stock' }
const BAJADA: Record<Vista, string> = {
  hoy: 'Lo que pasó hoy y lo que pide tu atención.',
  finanzas: 'Cuánto debés, qué vence y en qué se va la plata.',
  compras: 'Qué compraste, a quién y qué subió de precio.',
}

const fechaLarga = () => {
  const s = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
  return s[0]!.toUpperCase() + s.slice(1)
}

async function get<T>(url: string, vacio: T): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) return vacio
  return r.json()
}

export default function Inicio() {
  const { clienteId, user, clienteNombre, can, canSeeImportes } = useUser()
  const { subscription } = useSubscription()
  const [vista, setVista] = useState<Vista>('hoy')
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('mes'))

  useRealtimeDocumentos(clienteId || '')

  // Qué puede ver: cada bloque pide el permiso de su propia sección, igual
  // que la API que lo alimenta.
  const ve = {
    stats: can(SECCION.DASHBOARD),
    documentos: can(SECCION.DOC_COMPROBANTES),
    items: can(SECCION.DOC_ITEMS),
    proveedores: can(SECCION.DOC_PROVEEDORES),
    pagos: can(SECCION.FINANZAS_PAGOS),
    calendario: can(SECCION.FINANZAS_CALENDARIO),
    compras: can(SECCION.CONCILIACION_COMPRAS),
    ventas: can(SECCION.VENTAS_RANKING),
  }
  const importes = {
    stats: canSeeImportes(SECCION.DASHBOARD),
    pagos: canSeeImportes(SECCION.FINANZAS_PAGOS),
    calendario: canSeeImportes(SECCION.FINANZAS_CALENDARIO),
    items: canSeeImportes(SECCION.DOC_ITEMS),
  }

  const vistas = [
    { v: 'hoy' as const, t: 'Hoy', ok: true },
    { v: 'finanzas' as const, t: 'Finanzas', ok: ve.pagos || ve.stats || ve.proveedores },
    { v: 'compras' as const, t: 'Compras', ok: ve.items },
  ].filter((x) => x.ok)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', clienteId],
    queryFn: () => get('/api/stats', null as any),
    enabled: !!clienteId && ve.stats,
  })

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ['recent-docs', clienteId],
    queryFn: () => get('/api/documentos?pageSize=5&sortBy=createdAt&sortOrder=desc', { documentos: [] } as any),
    enabled: !!clienteId && ve.documentos,
  })

  const { data: pagosStats, isLoading: pagosLoading } = useQuery({
    queryKey: ['payment-stats', clienteId],
    queryFn: () => get('/api/pagos/stats', null as any),
    enabled: !!clienteId && ve.pagos,
  })

  const { data: alertasCompra } = useQuery({
    queryKey: ['compras-alertas'],
    queryFn: () => get('/api/compras/alertas', { pedir: 0 }),
    enabled: !!clienteId && ve.compras,
    staleTime: 5 * 60_000,
  })

  const { data: deudaData, isLoading: deudaLoading } = useQuery({
    queryKey: ['provider-debt', clienteId],
    queryFn: () => get('/api/proveedores/deuda', { proveedores: [] } as any),
    enabled: !!clienteId && ve.proveedores && vista === 'finanzas',
  })

  const rango = useMemo(() => new URLSearchParams({ fechaDesde: periodo.desde, fechaHasta: periodo.hasta }).toString(), [periodo])

  const { data: itemStats, isLoading: itemsLoading } = useQuery({
    queryKey: ['item-stats', clienteId, rango],
    queryFn: () => get(`/api/items/stats?${rango}`, { topItems: [], byProvider: [], priceVariation: [], byCategoria: [] } as any),
    enabled: !!clienteId && ve.items && vista !== 'hoy',
  })

  const { data: ingresos, isLoading: ingresosLoading } = useQuery({
    queryKey: ['ingresos-rubro', clienteId, periodo.desde, periodo.hasta],
    queryFn: async () => {
      const p = new URLSearchParams({ groupBy: 'rubro', limit: '200', from: periodo.desde, to: periodo.hasta })
      const json = await get<any>(`/api/sales/ranking?${p}`, null)
      if (!json || json.hideMontos) return null
      return json as { ranking: Array<{ rubroNombre: string | null; importe: number }> }
    },
    enabled: !!clienteId && ve.ventas && vista === 'finanzas',
  })

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">Sin empresa asignada</p>
          <p className="mt-1 text-xs text-slate-400">{user?.email}</p>
        </div>
      </DashboardLayout>
    )
  }

  const pendientes = stats?.totalPendientes || 0

  // Avisos del día: solo los que tienen algo que hacer.
  const avisos: Aviso[] = []
  const chequesHoy = pagosStats?.chequesHoy
  if (chequesHoy?.cantidad > 0) {
    avisos.push({
      id: 'cheques',
      texto: importes.pagos
        ? `Hoy se debitan ${chequesHoy.cantidad === 1 ? 'un cheque' : `${chequesHoy.cantidad} cheques`} por ${pesos(chequesHoy.total)}`
        : `Hoy se ${chequesHoy.cantidad === 1 ? 'debita un cheque' : `debitan ${chequesHoy.cantidad} cheques`}`,
      href: '/finanzas',
      tono: 'ambar',
      icono: CalendarClock,
    })
  }
  if (ve.documentos && pendientes > 0) {
    avisos.push({ id: 'revisar', texto: `${pendientes} ${pendientes === 1 ? 'factura para revisar' : 'facturas para revisar'}`, href: '/documentos', tono: 'ambar', icono: AlertTriangle })
  }
  if ((alertasCompra?.pedir ?? 0) > 0) {
    const n = alertasCompra!.pedir
    avisos.push({ id: 'pedir', texto: `${n} ${n === 1 ? 'insumo para pedir' : 'insumos para pedir'}`, href: '/compras', tono: 'rojo', icono: ShoppingBasket })
  }

  const proximos7 = pagosStats?.proximos7
  const variacionMes = (() => {
    const serie: Array<{ total: number }> = stats?.montoPorMes ?? []
    if (serie.length < 2) return undefined
    const [ant, act] = [serie.at(-2)!.total, serie.at(-1)!.total]
    return ant > 0 ? ((act - ant) / ant) * 100 : undefined
  })()

  const acciones = (
    <>
      {vistas.length > 1 && (
        <div className="ax-tabs" role="tablist" aria-label="Vista del inicio">
          {vistas.map((x) => (
            <button key={x.v} type="button" role="tab" aria-selected={vista === x.v} data-activo={vista === x.v ? '1' : '0'} className="ax-tab" onClick={() => setVista(x.v)}>
              {x.t}
            </button>
          ))}
        </div>
      )}
      {vista !== 'hoy' && <SelectorPeriodo valor={periodo} onCambiar={setPeriodo} />}
    </>
  )

  return (
    <DashboardLayout>
      <Header title={`Hola, ${user?.nombre?.split(' ')[0] ?? ''}`} description={`${fechaLarga()}${clienteNombre ? ` · ${clienteNombre}` : ''}. ${BAJADA[vista]}`} escena={ESCENA[vista]} actions={acciones} />

      {vista === 'hoy' && (
        <>
          <AvisosHoy avisos={avisos} />

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ve.stats && (
              <Kpi
                etiqueta="Facturas cargadas hoy"
                valor={String(stats?.documentosHoy ?? 0)}
                nota={`${stats?.documentosEsteMes ?? 0} en el mes`}
                serie={(stats?.documentosPorDia ?? []).slice(-14).map((d: { count: number }) => d.count)}
                icono={ScanLine}
                cargando={statsLoading}
              />
            )}
            {ve.documentos && (
              <Kpi
                etiqueta="Para revisar"
                valor={String(pendientes)}
                nota={pendientes ? 'La IA no está segura de algún dato' : 'Todo revisado'}
                tono={pendientes ? 'ambar' : 'verde'}
                icono={AlertTriangle}
                href="/documentos"
                cargando={statsLoading}
              />
            )}
            {ve.pagos && (
              <Kpi
                etiqueta="Vence en 7 días"
                valor={importes.pagos ? millones(proximos7?.total ?? 0) : String(proximos7?.cantidad ?? 0)}
                nota={`${proximos7?.cantidad ?? 0} ${proximos7?.cantidad === 1 ? 'pago' : 'pagos'} programados`}
                tono="ambar"
                icono={CalendarClock}
                href="/finanzas"
                cargando={pagosLoading}
              />
            )}
            {ve.compras && (
              <Kpi
                etiqueta="Insumos para pedir"
                valor={String(alertasCompra?.pedir ?? 0)}
                nota="En o bajo el stock seguro"
                tono={(alertasCompra?.pedir ?? 0) > 0 ? 'rojo' : 'verde'}
                icono={ShoppingBasket}
                href="/compras"
              />
            )}
          </div>

          {ve.calendario && (
            <div className="mb-5">
              <VencimientosSemana verImportes={importes.calendario} />
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-3">
            {ve.documentos && (
              <div className="lg:col-span-2">
                <RecentDocumentsCard documents={docs?.documentos || []} isLoading={docsLoading} />
              </div>
            )}
            <div className="space-y-5">
              {ve.stats && (
                <StatusChart
                  pendientes={pendientes}
                  confirmados={stats?.totalConfirmados || 0}
                  pagados={stats?.totalPagados || 0}
                  errores={stats?.totalErrores || 0}
                  duplicados={stats?.totalDuplicados || 0}
                  isLoading={statsLoading}
                />
              )}
              {ve.stats && <UsoPlan usados={stats?.documentosEsteMes ?? 0} limite={stats?.documentosMesLimite ?? null} plan={subscription?.plan_nombre} />}
            </div>
          </div>
        </>
      )}

      {vista === 'finanzas' && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ve.pagos && (
              <Kpi
                etiqueta="A pagar"
                valor={importes.pagos ? pesos(pagosStats?.montoPendiente ?? 0) : '—'}
                nota={`${pagosStats?.proveedoresConSaldo ?? 0} proveedores con saldo`}
                icono={Wallet}
                href="/pagos"
                cargando={pagosLoading}
              />
            )}
            {ve.pagos && (
              <Kpi
                etiqueta="Vence en 7 días"
                valor={importes.pagos ? pesos(proximos7?.total ?? 0) : String(proximos7?.cantidad ?? 0)}
                nota={`${proximos7?.cantidad ?? 0} pagos programados`}
                tono="ambar"
                icono={CalendarClock}
                href="/finanzas"
                cargando={pagosLoading}
              />
            )}
            {ve.pagos && (
              <Kpi
                etiqueta="Pagado este mes"
                valor={importes.pagos ? pesos(pagosStats?.pagadoMes?.total ?? 0) : String(pagosStats?.pagadoMes?.count ?? 0)}
                nota={`${pagosStats?.pagadoMes?.count ?? 0} órdenes pagadas`}
                tono="verde"
                icono={Receipt}
                cargando={pagosLoading}
              />
            )}
            {ve.stats && (
              <Kpi
                etiqueta="Facturado este mes"
                valor={importes.stats ? pesos(stats?.totalMes ?? 0) : '—'}
                variacion={importes.stats ? variacionMes : undefined}
                bueno="baja"
                serie={importes.stats ? (stats?.montoPorMes ?? []).slice(-6).map((m: { total: number }) => m.total) : undefined}
                nota="Lo que te facturaron tus proveedores"
                icono={FileText}
                cargando={statsLoading}
              />
            )}
          </div>

          {ve.items && (
            <div className={`mb-5 grid gap-5 ${ingresos ? 'lg:grid-cols-2' : ''}`}>
              <RubrosBreakdownCard
                title={`¿En qué se va la plata? · ${periodo.etiqueta}`}
                hint="Compras por categoría, sin IVA"
                data={(itemStats?.byCategoria || []).map((c: { categoria: string; totalSubtotal: number }) => ({ nombre: c.categoria, total: c.totalSubtotal }))}
                barClass="bg-[#3b9bff]"
                href="/items"
                emptyText="Sin compras con items en el período"
                isLoading={itemsLoading}
              />
              {ingresos && (
                <RubrosBreakdownCard
                  title={`¿De dónde vienen los ingresos? · ${periodo.etiqueta}`}
                  hint="Ventas por rubro, según los cierres de caja"
                  data={ingresos.ranking.map((r) => ({ nombre: r.rubroNombre || 'Sin rubro', total: r.importe }))}
                  barClass="bg-[#10b981]"
                  href="/ventas"
                  emptyText="Sin cierres de caja en el período"
                  isLoading={ingresosLoading}
                />
              )}
            </div>
          )}

          {ve.stats && importes.stats && (
            <div className="mb-5">
              <MonthlyAmountChart data={stats?.montoPorMes || []} isLoading={statsLoading} />
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-3">
            {ve.proveedores && (
              <div className="lg:col-span-2">
                <ProviderDebtCard data={deudaData?.proveedores || []} isLoading={deudaLoading} />
              </div>
            )}
            {ve.pagos && (
              <PaymentsSummary
                proveedoresConSaldo={pagosStats?.proveedoresConSaldo || 0}
                montoPendiente={pagosStats?.montoPendiente || 0}
                ordenesRecientes={pagosStats?.ordenesRecientes || []}
                isLoading={pagosLoading}
              />
            )}
          </div>
        </>
      )}

      {vista === 'compras' && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Kpi
              etiqueta={`Comprado · ${periodo.etiqueta}`}
              valor={importes.items ? pesos(itemStats?.compradoTotal ?? 0) : '—'}
              nota="Total facturado, con IVA"
              icono={ShoppingCart}
              cargando={itemsLoading}
            />
            <Kpi
              etiqueta="Artículos distintos"
              valor={String(itemStats?.topItems?.length ?? 0)}
              nota={`A ${itemStats?.byProvider?.length ?? 0} proveedores`}
              icono={FileText}
              href="/items"
              cargando={itemsLoading}
            />
            <Kpi
              etiqueta="Subieron de precio"
              valor={String(itemStats?.priceVariation?.length ?? 0)}
              nota="Contra la compra anterior"
              tono={(itemStats?.priceVariation?.length ?? 0) > 0 ? 'rojo' : 'verde'}
              icono={TrendingUp}
              href="/informes/precios"
              cargando={itemsLoading}
            />
          </div>
          {ve.stats && importes.stats && (
            <div className="mb-5">
              <ProviderTotalsChart data={stats?.totalesPorProveedor || []} isLoading={statsLoading} />
            </div>
          )}
          <PurchasingTabContent
            topItems={itemStats?.topItems || []}
            priceVariation={itemStats?.priceVariation || []}
            byProvider={itemStats?.byProvider || []}
            isLoading={itemsLoading}
          />
        </>
      )}
    </DashboardLayout>
  )
}
