'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import {
  FileText,
  AlertCircle,
  DollarSign,
  CheckCircle,
  TrendingUp,
  Users,
} from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
}

function StatsCard({ title, value, description, icon, trend }: StatsCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600">
          {title}
        </CardTitle>
        <div className="text-blue-500">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="flex items-center justify-between mt-1">
          {description && (
            <p className="text-xs text-gray-500">{description}</p>
          )}
          {trend && (
            <span
              className={`text-xs font-medium ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardStats({ clienteId }: { clienteId: string }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/stats')
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      <StatsCard
        title="Procesados Hoy"
        value={stats?.documentosHoy || 0}
        description="Documentos nuevos"
        icon={<FileText className="h-5 w-5" />}
      />
      <StatsCard
        title="Pendientes"
        value={stats?.totalPendientes || 0}
        description="Requieren revisión"
        icon={<AlertCircle className="h-5 w-5 text-amber-500" />}
      />
      <StatsCard
        title="Confirmados"
        value={stats?.totalConfirmados || 0}
        description="Procesados correctamente"
        icon={<CheckCircle className="h-5 w-5 text-green-500" />}
      />
      <StatsCard
        title="Total Este Mes"
        value={formatCurrency(stats?.totalMes || 0)}
        description="Suma de facturas"
        icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
      />
      <StatsCard
        title="Documentos"
        value={stats?.totalDocumentos || 0}
        description={
          stats?.documentosMesLimite
            ? `${stats.documentosEsteMes || 0} este mes (quedan ${stats.documentosRestantes})`
            : `${stats?.documentosEsteMes || 0} este mes`
        }
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <StatsCard
        title="Proveedores"
        value={stats?.totalProveedores || 0}
        description="Activos"
        icon={<Users className="h-5 w-5" />}
      />
    </div>
  )
}
