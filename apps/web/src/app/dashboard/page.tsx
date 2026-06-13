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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useMemo } from 'react'
import { useRealtimeDocumentos } from '@/hooks/use-realtime-documentos'
import { UploadDropzone } from '@/components/documents/upload-dropzone'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ComprasQuickFilter = 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom'

function getComprasDateRange(filter: ComprasQuickFilter): { desde: string; hasta: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]!
  switch (filter) {
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      return { desde: fmt(start), hasta: fmt(today) }
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return { desde: fmt(start), hasta: fmt(end) }
    }
    case 'quarter': {
      const quarterMonth = Math.floor(today.getMonth() / 3) * 3
      const start = new Date(today.getFullYear(), quarterMonth, 1)
      return { desde: fmt(start), hasta: fmt(today) }
    }
    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1)
      return { desde: fmt(start), hasta: fmt(today) }
    }
    default:
      return { desde: '', hasta: '' }
  }
}

export default function Home() {
  const { clienteId, user, clienteNombre } = useUser()
  const [uploadOpen, setUploadOpen] = useState(false)

  // Filtro de fechas del tab Compras (por defecto: mes actual)
  const [comprasFilter, setComprasFilter] = useState<ComprasQuickFilter>('month')
  const initialComprasRange = getComprasDateRange('month')
  const [comprasDesde, setComprasDesde] = useState(initialComprasRange.desde)
  const [comprasHasta, setComprasHasta] = useState(initialComprasRange.hasta)

  const applyComprasFilter = (filter: ComprasQuickFilter) => {
    setComprasFilter(filter)
    if (filter !== 'custom') {
      const { desde, hasta } = getComprasDateRange(filter)
      setComprasDesde(desde)
      setComprasHasta(hasta)
    }
  }

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

  const comprasStatsQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (comprasDesde) params.set('fechaDesde', comprasDesde)
    if (comprasHasta) params.set('fechaHasta', comprasHasta)
    return params.toString()
  }, [comprasDesde, comprasHasta])

  const { data: itemStats, isLoading: itemsLoading } = useQuery({
    queryKey: ['item-stats', clienteId, comprasStatsQuery],
    queryFn: async () => {
      const res = await fetch(`/api/items/stats?${comprasStatsQuery}`)
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

  // Items data — total comprado en el período seleccionado
  // (monthlyTrend no tiene LIMIT, a diferencia de byProvider, así que da el total real)
  const compradoEnPeriodo = (itemStats?.monthlyTrend || []).reduce(
    (sum: number, m: any) => sum + (m.totalSubtotal || 0),
    0
  )
  const itemsActivos = itemStats?.topItems?.length || 0
  const alertasPrecios = itemStats?.priceVariation?.length || 0
  const comprasFilterLabel: Record<ComprasQuickFilter, string> = {
    month: 'Este mes',
    lastMonth: 'Mes anterior',
    quarter: 'Trimestre',
    year: 'Año',
    custom: 'Período',
  }

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
              {/* Filtro de fechas */}
              <div className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm text-slate-500 flex items-center gap-1 mr-2">
                    <Calendar className="h-4 w-4" />
                    Período:
                  </span>
                  {([
                    { value: 'month' as const, label: 'Mes actual' },
                    { value: 'lastMonth' as const, label: 'Mes anterior' },
                    { value: 'quarter' as const, label: 'Trimestre' },
                    { value: 'year' as const, label: 'Año' },
                    { value: 'custom' as const, label: 'Personalizado' },
                  ]).map((opt) => (
                    <Button
                      key={opt.value}
                      variant={comprasFilter === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => applyComprasFilter(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>

                {comprasFilter === 'custom' && (
                  <div className="flex gap-3 items-end">
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Desde</label>
                      <Input
                        type="date"
                        value={comprasDesde}
                        onChange={(e) => setComprasDesde(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Hasta</label>
                      <Input
                        type="date"
                        value={comprasHasta}
                        onChange={(e) => setComprasHasta(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <PurchasingKpis
                compradoEsteMes={compradoEnPeriodo}
                itemsActivos={itemsActivos}
                alertasPrecios={alertasPrecios}
                periodoLabel={comprasFilterLabel[comprasFilter]}
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
