'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useUser } from '@/hooks/use-user'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClosuresTab } from '@/components/sales/closures-tab'
import { RankingTab } from '@/components/sales/ranking-tab'
import { RankingDashboard } from '@/components/sales/ranking-dashboard'
import { WaitersTab } from '@/components/sales/waiters-tab'
import { PaymentsTab } from '@/components/sales/payments-tab'
import { BillingTab } from '@/components/sales/billing-tab'
import { ByShiftTab } from '@/components/sales/by-shift-tab'
import { AuditTab } from '@/components/sales/audit-tab'
import { CsvTab } from '@/components/sales/csv-tab'

export default function VentasPage() {
  const { clienteId, isLoading, isRestricted } = useUser()
  if (isLoading) return null

  // Usuario restringido (permiso ventas.ranking): panel de ventas SIN montos.
  if (isRestricted) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Ventas</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Unidades por rubro y producto.
            </p>
          </div>
          <RankingDashboard />
        </div>
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

        <Tabs defaultValue="cierres">
          <TabsList>
            <TabsTrigger value="cierres">Cierres</TabsTrigger>
            <TabsTrigger value="ranking">Ranking</TabsTrigger>
            <TabsTrigger value="mozos">Mozos</TabsTrigger>
            <TabsTrigger value="pagos">Formas de pago</TabsTrigger>
            <TabsTrigger value="facturacion">Facturación</TabsTrigger>
            <TabsTrigger value="turnos">Por turno</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
            <TabsTrigger value="csv">Ventas (CSV)</TabsTrigger>
          </TabsList>

          <TabsContent value="cierres" className="mt-6">
            <ClosuresTab />
          </TabsContent>
          <TabsContent value="ranking" className="mt-6">
            <RankingTab />
          </TabsContent>
          <TabsContent value="mozos" className="mt-6">
            <WaitersTab />
          </TabsContent>
          <TabsContent value="pagos" className="mt-6">
            <PaymentsTab />
          </TabsContent>
          <TabsContent value="facturacion" className="mt-6">
            <BillingTab />
          </TabsContent>
          <TabsContent value="turnos" className="mt-6">
            <ByShiftTab />
          </TabsContent>
          <TabsContent value="auditoria" className="mt-6">
            <AuditTab />
          </TabsContent>
          <TabsContent value="csv" className="mt-6">
            <CsvTab clienteId={clienteId} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  )
}
