'use client'

import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@/lib/utils'
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">{value}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function StatSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-3 bg-gray-100 rounded w-16" />
          <div className="h-5 bg-gray-200 rounded w-12" />
        </div>
        <div className="w-8 h-8 bg-gray-100 rounded-lg" />
      </div>
    </div>
  )
}

export function StatsCards({ clienteId }: { clienteId: string }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    staleTime: 1000 * 60,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      <StatCard
        title="Hoy"
        value={stats?.documentosHoy || 0}
        icon={<Zap className="w-4 h-4 text-white" />}
        color="bg-violet-500"
      />
      <StatCard
        title="Pendientes"
        value={stats?.totalPendientes || 0}
        icon={<AlertCircle className="w-4 h-4 text-white" />}
        color="bg-amber-500"
      />
      <StatCard
        title="Confirmados"
        value={stats?.totalConfirmados || 0}
        icon={<CheckCircle2 className="w-4 h-4 text-white" />}
        color="bg-emerald-500"
      />
      <StatCard
        title="Total Mes"
        value={formatCurrency(stats?.totalMes || 0)}
        icon={<DollarSign className="w-4 h-4 text-white" />}
        color="bg-blue-500"
      />
      <StatCard
        title="Documentos"
        value={stats?.totalDocumentos || 0}
        icon={<TrendingUp className="w-4 h-4 text-white" />}
        color="bg-indigo-500"
      />
      <StatCard
        title="Proveedores"
        value={stats?.totalProveedores || 0}
        icon={<Users className="w-4 h-4 text-white" />}
        color="bg-pink-500"
      />
    </div>
  )
}
