'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useUser } from '@/hooks/use-user';
import { useTabsPermitidas } from '@/components/layout/tabs-permitidas';
import { MODULO, SECCION } from '@/lib/permisos';
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
import { SalesRangeProvider, useSalesRange, useSalesTurno, type Turno } from '@/components/sales/range-context';
import { SubirPdfMaxirest } from '@/components/sales/subir-pdf-maxirest';
import { BarraFiltros } from '@/components/ui/barra-filtros';
import { ATAJOS_VENTAS, periodoDesdeRango } from '@/components/ui/periodo';
import { useState } from 'react';
import { defaultRange, yesterdayRange } from '@/components/sales/shared';

export default function VentasPage() {
  const { clienteId, isLoading, canEdit } = useUser();
  const tabs = useTabsPermitidas(MODULO.VENTAS);
  const [elegida, setElegida] = useState<string | null>(null);
  const tab = elegida ?? tabs.primera;
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
          actions={tabs.puede('cierres') && canEdit(SECCION.VENTAS_CIERRES) ? <SubirPdfMaxirest /> : undefined}
        />

        {/* Un solo rango y un solo turno para todas las pestañas. Si la primera es el ranking
            (operador restringido), arranca en ayer como el panel. */}
        <SalesRangeProvider
          fijo
          initial={tabs.primera === 'ranking' ? yesterdayRange : defaultRange}
        >
          <Tabs value={tab} onValueChange={setElegida}>
            {/* Barra fija: submenú y período. El período queda puesto al
              cambiar de pestaña. */}
            <div className="ax-barra-fija sticky top-16 z-20 -mx-4 mb-5 border-b border-slate-900/[0.06] px-4 pt-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <TabsListLinea>
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
              <FiltrosVentas conTurno={tab === 'cierres' || tab === 'ranking'} />
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

/**
 * Filtros de ventas con la barra común de la app: período (todas las
 * pestañas) y turno (cierres y ranking). Quedan puestos al cambiar de pestaña.
 */
function FiltrosVentas({ conTurno }: { conTurno: boolean }) {
  const [{ from, to }, setRange] = useSalesRange(defaultRange);
  const [turno, setTurno] = useSalesTurno();
  return (
    <BarraFiltros
      className="mb-0 py-3"
      periodo={{
        valor: periodoDesdeRango(from, to, ATAJOS_VENTAS),
        onCambiar: (p) => setRange({ from: p.desde, to: p.hasta }),
        atajos: ATAJOS_VENTAS,
      }}
      estados={
        conTurno
          ? {
              valor: turno || 'todos',
              onCambiar: (v) => setTurno(v === 'todos' ? '' : (v as Turno)),
              opciones: [
                { valor: 'todos', texto: 'Todos los turnos' },
                { valor: 'ALMUERZO', texto: 'Mediodía' },
                { valor: 'CENA', texto: 'Noche' },
              ],
            }
          : undefined
      }
    />
  );
}
