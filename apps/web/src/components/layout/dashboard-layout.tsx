'use client'

import { Sidebar } from './sidebar'
import { useUser } from '@/hooks/use-user'
import { useQuery } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isLoading, user, clienteId } = useUser()

  const { data: stats } = useQuery({
    queryKey: ['stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 60000,
  })

  const { data: logStats } = useQuery({
    queryKey: ['logStats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/logs/stats')
      if (!res.ok) throw new Error('Failed to fetch log stats')
      return res.json()
    },
    enabled: !!clienteId,
    staleTime: 30000,
    refetchInterval: 60000, // Refetch cada minuto
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <div className="hidden lg:block w-56 bg-slate-950" />
        <main className="flex-1 p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50 flex">
        <Sidebar
          pendingCount={stats?.totalPendientes || 0}
          unreadLogsCount={logStats?.totalUnread || 0}
        />
        <main className="flex-1 overflow-auto">
          <div className="p-6 lg:p-8">
            <div className="max-w-6xl mx-auto">{children}</div>
          </div>
        </main>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
