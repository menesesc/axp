'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useUser } from '@/hooks/use-user'
import { useTabsPermitidas } from '@/components/layout/tabs-permitidas'
import { MODULO } from '@/lib/permisos'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClosuresTab } from '@/components/sales/closures-tab'
import { RankingDashboard } from '@/components/sales/ranking-dashboard'
import { WaitersTab } from '@/components/sales/waiters-tab'
import { PaymentsTab } from '@/components/sales/payments-tab'
import { BillingTab } from '@/components/sales/billing-tab'
import { ByShiftTab } from '@/components/sales/by-shift-tab'
import { AuditTab } from '@/components/sales/audit-tab'
import { CsvTab } from '@/components/sales/csv-tab'
import { SalesRangeProvider } from '@/components/sales/range-context'
import { defaultRange, yesterdayRange } from '@/components/sales/shared'

export default function VentasPage() {
  const { clienteId, isLoading } = useUser()
  const tabs = useTabsPermitidas(MODULO.VENTAS)
  if (isLoading) return null

  // El middleware ya impide llegar acá sin ninguna pestaña, pero si pasara
  // (permisos cambiados en otra pestaña del navegador) no dejamos la página en
  // blanco sin explicación.
  if (tabs.vacio) {
    return (
      <DashboardLayout>
        <p className="text-sm text-slate-500">
          No tenés acceso a ninguna sección de Ventas.
        </p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Ventas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cierres de caja Maxirest, ranking de productos, mozos, formas de pago y comparativas por turno
          </p>
        </div>

        {/* Un solo rango para todas las pestañas. Si la primera es el ranking
            (operador restringido), arranca en ayer como el panel. */}
        <SalesRangeProvider initial={tabs.primera === 'ranking' ? yesterdayRange : defaultRange}>
        <Tabs defaultValue={tabs.primera}>
          <TabsList>
            {tabs.puede('cierres') && <TabsTrigger value="cierres">Cierres</TabsTrigger>}
            {tabs.puede('ranking') && <TabsTrigger value="ranking">Ranking</TabsTrigger>}
            {tabs.puede('mozos') && <TabsTrigger value="mozos">Mozos</TabsTrigger>}
            {tabs.puede('pagos') && <TabsTrigger value="pagos">Formas de pago</TabsTrigger>}
            {tabs.puede('facturacion') && <TabsTrigger value="facturacion">Facturación</TabsTrigger>}
            {tabs.puede('turnos') && <TabsTrigger value="turnos">Por turno</TabsTrigger>}
            {tabs.puede('auditoria') && <TabsTrigger value="auditoria">Auditoría</TabsTrigger>}
            {tabs.puede('csv') && <TabsTrigger value="csv">Ventas (CSV)</TabsTrigger>}
          </TabsList>

          {tabs.puede('cierres') && (
            <TabsContent value="cierres" className="mt-6">
              <ClosuresTab />
            </TabsContent>
          )}
          {tabs.puede('ranking') && (
            <TabsContent value="ranking" className="mt-6">
              <RankingDashboard hideMontos={!tabs.veImportes('ranking')} />
            </TabsContent>
          )}
          {tabs.puede('mozos') && (
            <TabsContent value="mozos" className="mt-6">
              <WaitersTab />
            </TabsContent>
          )}
          {tabs.puede('pagos') && (
            <TabsContent value="pagos" className="mt-6">
              <PaymentsTab />
            </TabsContent>
          )}
          {tabs.puede('facturacion') && (
            <TabsContent value="facturacion" className="mt-6">
              <BillingTab />
            </TabsContent>
          )}
          {tabs.puede('turnos') && (
            <TabsContent value="turnos" className="mt-6">
              <ByShiftTab />
            </TabsContent>
          )}
          {tabs.puede('auditoria') && (
            <TabsContent value="auditoria" className="mt-6">
              <AuditTab />
            </TabsContent>
          )}
          {tabs.puede('csv') && (
            <TabsContent value="csv" className="mt-6">
              <CsvTab clienteId={clienteId} />
            </TabsContent>
          )}
        </Tabs>
        </SalesRangeProvider>
      </div>
    </DashboardLayout>
  )
}
