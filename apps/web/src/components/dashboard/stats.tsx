'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { FileText, AlertCircle, DollarSign, TrendingUp } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: React.ReactNode
}

function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-gray-400">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function DashboardStats({ clienteId }: { clienteId: string }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', clienteId],
    queryFn: async () => {
      const res = await fetch(`/api/stats?clienteId=${clienteId}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Procesados Hoy"
        value={stats?.documentosHoy || 0}
        description="Documentos OCR completados"
        icon={<FileText className="h-4 w-4" />}
      />
      <StatsCard
        title="Pendientes"
        value={stats?.totalPendientes || 0}
        description="Requieren revisión manual"
        icon={<AlertCircle className="h-4 w-4" />}
      />
      <StatsCard
        title="Total Este Mes"
        value={formatCurrency(stats?.totalMes || 0)}
        description="Suma de todas las facturas"
        icon={<DollarSign className="h-4 w-4" />}
      />
      <StatsCard
        title="Total Documentos"
        value={stats?.totalDocumentos || 0}
        description="En toda la base de datos"
        icon={<TrendingUp className="h-4 w-4" />}
      />
    </div>
  )
}
