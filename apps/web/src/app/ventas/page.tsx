'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useUser } from '@/hooks/use-user';
import { useTabsPermitidas } from '@/components/layout/tabs-permitidas';
import { MODULO } from '@/lib/permisos';
import { Tabs, TabsContent, TabsListLinea, TabsTriggerLinea } from '@/components/ui/tabs';
import { Header } from '@/components/layout/header';
import { ClosuresTab } from '@/components/sales/closures-tab';
import { RankingDashboard } from '@/components/sales/ranking-dashboard';
import { WaitersTab } from '@/components/sales/waiters-tab';
import { PaymentsTab } from '@/components/sales/payments-tab';
import { BillingTab } from '@/components/sales/billing-tab';
import { ByShiftTab } from '@/components/sales/by-shift-tab';
import { AuditTab } from '@/components/sales/audit-tab';
import { CsvTab } from '@/components/sales/csv-tab';
import { SalesRangeProvider, useSalesRange } from '@/components/sales/range-context';
import { DateRange } from '@/components/sales/date-range';
import { defaultRange, yesterdayRange } from '@/components/sales/shared';

export default function VentasPage() {
  const { clienteId, isLoading } = useUser();
  const tabs = useTabsPermitidas(MODULO.VENTAS);
  if (isLoading) return null;

  // El middleware ya impide llegar acá sin ninguna pestaña, pero si pasara
  // (permisos cambiados en otra pestaña del navegador) no dejamos la página en
  // blanco sin explicación.
  if (tabs.vacio) {
    return (
      <DashboardLayout>
        <p className="text-sm text-slate-500">No tenés acceso a ninguna sección de Ventas.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header
          title="Ventas"
          description="Los cierres de caja de Maxirest entran solos. Mirá cómo te fue por día, turno, mozo y producto."
        />

        {/* Un solo rango para todas las pestañas. Si la primera es el ranking
            (operador restringido), arranca en ayer como el panel. */}
        <SalesRangeProvider
          fijo
          initial={tabs.primera === 'ranking' ? yesterdayRange : defaultRange}
        >
          <Tabs defaultValue={tabs.primera}>
            {/* Barra fija: submenú y período. El período queda puesto al
              cambiar de pestaña. */}
            <div className="ax-barra-fija sticky top-16 z-20 -mx-4 mb-6 flex flex-wrap items-end gap-x-3 border-b border-slate-900/[0.08] px-4 pt-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <TabsListLinea className="min-w-0 flex-1 border-b-0">
                {tabs.puede('cierres') && (
                  <TabsTriggerLinea value="cierres">Cierres</TabsTriggerLinea>
                )}
                {tabs.puede('ranking') && (
                  <TabsTriggerLinea value="ranking">Ranking</TabsTriggerLinea>
                )}
                {tabs.puede('mozos') && <TabsTriggerLinea value="mozos">Mozos</TabsTriggerLinea>}
                {tabs.puede('pagos') && (
                  <TabsTriggerLinea value="pagos">Formas de pago</TabsTriggerLinea>
                )}
                {tabs.puede('facturacion') && (
                  <TabsTriggerLinea value="facturacion">Facturación</TabsTriggerLinea>
                )}
                {tabs.puede('turnos') && (
                  <TabsTriggerLinea value="turnos">Por turno</TabsTriggerLinea>
                )}
                {tabs.puede('auditoria') && (
                  <TabsTriggerLinea value="auditoria">Auditoría</TabsTriggerLinea>
                )}
                {tabs.puede('csv') && <TabsTriggerLinea value="csv">Ventas (CSV)</TabsTriggerLinea>}
              </TabsListLinea>
              <div className="pb-2">
                <FiltroVentas />
              </div>
            </div>

            {tabs.puede('cierres') && (
              <TabsContent value="cierres" className="mt-0">
                <ClosuresTab />
              </TabsContent>
            )}
            {tabs.puede('ranking') && (
              <TabsContent value="ranking" className="mt-0">
                <RankingDashboard hideMontos={!tabs.veImportes('ranking')} />
              </TabsContent>
            )}
            {tabs.puede('mozos') && (
              <TabsContent value="mozos" className="mt-0">
                <WaitersTab />
              </TabsContent>
            )}
            {tabs.puede('pagos') && (
              <TabsContent value="pagos" className="mt-0">
                <PaymentsTab />
              </TabsContent>
            )}
            {tabs.puede('facturacion') && (
              <TabsContent value="facturacion" className="mt-0">
                <BillingTab />
              </TabsContent>
            )}
            {tabs.puede('turnos') && (
              <TabsContent value="turnos" className="mt-0">
                <ByShiftTab />
              </TabsContent>
            )}
            {tabs.puede('auditoria') && (
              <TabsContent value="auditoria" className="mt-0">
                <AuditTab />
              </TabsContent>
            )}
            {tabs.puede('csv') && (
              <TabsContent value="csv" className="mt-0">
                <CsvTab clienteId={clienteId} />
              </TabsContent>
            )}
          </Tabs>
        </SalesRangeProvider>
      </div>
    </DashboardLayout>
  );
}

/** Período compartido por todas las pestañas de ventas. */
function FiltroVentas() {
  const [{ from, to }, setRange] = useSalesRange(defaultRange);
  return <DateRange principal from={from} to={to} onChange={setRange} />;
}
