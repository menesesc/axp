'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { useUser } from '@/hooks/use-user'
import { useQuery } from '@tanstack/react-query'
import { OperationsKpis, FinanceKpis, PurchasingKpis } from '@/components/dashboard/kpi-cards'
import { RecentDocumentsCard } from '@/components/dashboard/recent-documents-card'
import { StatusChart } from '@/components/dashboard/status-chart'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { PaymentsSummary } from '@/components/dashboard/payments-summary'
import { DocumentsTrendCard } from '@/components/dashboard/documents-trend-card'
import { ProviderTotalsChart } from '@/components/dashboard/provider-totals-chart'
import { ProviderDebtCard } from '@/components/dashboard/provider-debt-card'
import { PurchasingTabContent } from '@/components/dashboard/purchasing-tab'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { useState } from 'react'
import { useRealtimeDocumentos } from '@/hooks/use-realtime-documentos'
import { UploadDropzone } from '@/components/documents/upload-dropzone'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function Home() {
  const { clienteId, user, clienteNombre } = useUser()
  const [uploadOpen, setUploadOpen] = useState(false)

  // Realtime: actualizar stats cuando el worker procesa documentos nuevos
  useRealtimeDocumentos(clienteId || '')

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ['recent-docs', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/documentos?pageSize=5&sortBy=createdAt&sortOrder=desc')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const { data: paymentStats, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payment-stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/pagos/stats')
      if (!res.ok) {
        return {
          proveedoresConSaldo: 0,
          montoPendiente: 0,
          ordenesRecientes: [],
        }
      }
      return res.json()
    },
    enabled: !!clienteId,
  })

  const { data: deudaData, isLoading: deudaLoading } = useQuery({
    queryKey: ['provider-debt', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/proveedores/deuda')
      if (!res.ok) return { proveedores: [] }
      return res.json()
    },
    enabled: !!clienteId,
  })

  const { data: itemStats, isLoading: itemsLoading } = useQuery({
    queryKey: ['item-stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/items/stats')
      if (!res.ok) return { topItems: [], byProvider: [], priceVariation: [], monthlyTrend: [] }
      return res.json()
    },
    enabled: !!clienteId,
  })

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">Sin empresa asignada</p>
          <p className="text-xs text-slate-400 mt-1">{user?.email}</p>
        </div>
      </DashboardLayout>
    )
  }

  // Stats data
  const pendientes = stats?.totalPendientes || 0
  const confirmados = stats?.totalConfirmados || 0
  const pagados = stats?.totalPagados || 0
  const errores = stats?.totalErrores || 0
  const duplicados = stats?.totalDuplicados || 0
  const confidencePromedio = stats?.confidencePromedio ?? 0
  const confidencePorDia = stats?.confidencePorDia || []
  const documentosPorDia = stats?.documentosPorDia || []
  const totalesPorProveedor = stats?.totalesPorProveedor || []
  const documentosHoy = stats?.documentosHoy || 0
  const documentosEsteMes = stats?.documentosEsteMes || 0
  const documentosMesLimite = stats?.documentosMesLimite ?? null
  const montoPendiente = paymentStats?.montoPendiente || 0

  // Items data
  const monthlyTrend = itemStats?.monthlyTrend || []
  const currentMonth = new Date().toISOString().slice(0, 7)
  const compradoEsteMes = monthlyTrend.find((m: any) => m.mes === currentMonth)?.totalSubtotal || 0
  const itemsActivos = itemStats?.topItems?.length || 0
  const alertasPrecios = itemStats?.priceVariation?.length || 0

  const handleUpload = () => {
    setUploadOpen(true)
  }

  const handleEmail = () => {
    toast.info('Función de email próximamente')
  }

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    toast.info(`Exportar a ${format.toUpperCase()} próximamente`)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <Header
          title={clienteNombre || 'Dashboard'}
          description={`Bienvenido, ${user?.nombre?.split(' ')[0]}`}
          actions={
            <QuickActions
              onUpload={handleUpload}
              onEmail={handleEmail}
              onExport={handleExport}
            />
          }
        />

        {/* Tabs */}
        <Tabs defaultValue="operaciones">
          <TabsList>
            <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
            <TabsTrigger value="finanzas">Finanzas</TabsTrigger>
            <TabsTrigger value="compras">Compras</TabsTrigger>
          </TabsList>

          {/* ─── Tab Operaciones ─── */}
          <TabsContent value="operaciones">
            <div className="space-y-4">
              <OperationsKpis
                documentosHoy={documentosHoy}
                pendientes={pendientes}
                confidencePromedio={confidencePromedio}
                confidencePorDia={confidencePorDia}
                documentosEsteMes={documentosEsteMes}
                documentosMesLimite={documentosMesLimite}
                isLoading={statsLoading}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <RecentDocumentsCard documents={docs?.documentos || []} isLoading={docsLoading} />
                </div>
                <div>
                  <StatusChart
                    pendientes={pendientes}
                    confirmados={confirmados}
                    pagados={pagados}
                    errores={errores}
                    duplicados={duplicados}
                    isLoading={statsLoading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <ProviderTotalsChart data={totalesPorProveedor} isLoading={statsLoading} />
                </div>
                <div>
                  <DocumentsTrendCard data={documentosPorDia} isLoading={statsLoading} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ─── Tab Finanzas ─── */}
          <TabsContent value="finanzas">
            <div className="space-y-4">
              <FinanceKpis
                confirmados={confirmados}
                montoPendiente={montoPendiente}
                proveedoresConSaldo={paymentStats?.proveedoresConSaldo || 0}
                isLoading={statsLoading || paymentsLoading}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <ProviderDebtCard
                    data={deudaData?.proveedores || []}
                    isLoading={deudaLoading}
                  />
                </div>
                <div>
                  <PaymentsSummary
                    proveedoresConSaldo={paymentStats?.proveedoresConSaldo || 0}
                    montoPendiente={paymentStats?.montoPendiente || 0}
                    ordenesRecientes={paymentStats?.ordenesRecientes || []}
                    isLoading={paymentsLoading}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ─── Tab Compras ─── */}
          <TabsContent value="compras">
            <div className="space-y-4">
              <PurchasingKpis
                compradoEsteMes={compradoEsteMes}
                itemsActivos={itemsActivos}
                alertasPrecios={alertasPrecios}
                isLoading={itemsLoading}
              />

              <PurchasingTabContent
                topItems={itemStats?.topItems || []}
                priceVariation={itemStats?.priceVariation || []}
                byProvider={itemStats?.byProvider || []}
                isLoading={itemsLoading}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Subir documentos</DialogTitle>
          </DialogHeader>
          <UploadDropzone
            onUploadComplete={() => setUploadOpen(false)}
            onClose={() => setUploadOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
