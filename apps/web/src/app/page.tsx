'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { useUser } from '@/hooks/use-user'
import { useQuery } from '@tanstack/react-query'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { RecentDocumentsCard } from '@/components/dashboard/recent-documents-card'
import { StatusChart } from '@/components/dashboard/status-chart'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { PaymentsSummary } from '@/components/dashboard/payments-summary'
import { DocumentsTrendCard } from '@/components/dashboard/documents-trend-card'
import { ProviderTotalsChart } from '@/components/dashboard/provider-totals-chart'
import { toast } from 'sonner'

export default function Home() {
  const { clienteId, user, clienteNombre } = useUser()

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

  const recentDocs = docs?.documentos || []
  const totalDocumentos = stats?.totalDocumentos || 0
  const pendientes = stats?.totalPendientes || 0
  const confirmados = stats?.totalConfirmados || 0
  const confidencePromedio = stats?.confidencePromedio ?? 0
  const documentosPorDia = stats?.documentosPorDia || []
  const totalesPorProveedor = stats?.totalesPorProveedor || []
  const documentosEsteMes = stats?.documentosEsteMes || 0
  const documentosMesLimite = stats?.documentosMesLimite ?? null

  const handleUpload = () => {
    toast.info('Función de subida próximamente')
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

        {/* KPI Cards */}
        <KpiCards
          totalDocumentos={totalDocumentos}
          pendientes={pendientes}
          confirmados={confirmados}
          confidencePromedio={confidencePromedio}
          documentosEsteMes={documentosEsteMes}
          documentosMesLimite={documentosMesLimite}
          isLoading={statsLoading}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column - Recent docs + Provider chart */}
          <div className="lg:col-span-2 space-y-4">
            <RecentDocumentsCard documents={recentDocs} isLoading={docsLoading} />
            <ProviderTotalsChart data={totalesPorProveedor} isLoading={statsLoading} />
          </div>

          {/* Right column - Charts */}
          <div className="space-y-4">
            <StatusChart
              pendientes={pendientes}
              confirmados={confirmados}
              confidencePromedio={confidencePromedio}
              isLoading={statsLoading}
            />
            <DocumentsTrendCard data={documentosPorDia} isLoading={statsLoading} />
          </div>
        </div>

        {/* Payments Summary */}
        <div>
          <h2 className="text-sm font-medium text-slate-900 mb-3">Pagos</h2>
          <PaymentsSummary
            proveedoresConSaldo={paymentStats?.proveedoresConSaldo || 0}
            montoPendiente={paymentStats?.montoPendiente || 0}
            ordenesRecientes={paymentStats?.ordenesRecientes || []}
            isLoading={paymentsLoading}
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
