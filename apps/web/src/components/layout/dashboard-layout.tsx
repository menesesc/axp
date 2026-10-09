'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

interface DashboardLayoutProps {
  children: React.ReactNode
}

const CLAVE_MINI = 'axp-menu-mini'

/** Marco de la app: menú lateral, barra superior y contenido centrado. */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const { isLoading, user, clienteId, can } = useUser()
  const [abierto, setAbierto] = useState(false)
  const [mini, setMini] = useState(false)

  useEffect(() => setAbierto(false), [pathname])
  useEffect(() => {
    try {
      setMini(localStorage.getItem(CLAVE_MINI) === '1')
    } catch {}
  }, [])

  const alternarMini = () =>
    setMini((v) => {
      try {
        localStorage.setItem(CLAVE_MINI, v ? '0' : '1')
      } catch {}
      return !v
    })

  const { data: stats } = useQuery({
    queryKey: ['stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: !!clienteId && can(SECCION.DASHBOARD),
    staleTime: 60000,
  })

  const { data: logStats } = useQuery({
    queryKey: ['logStats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/logs/stats')
      if (!res.ok) throw new Error('Failed to fetch log stats')
      return res.json()
    },
    enabled: !!clienteId && can(SECCION.SISTEMA_PROCESAMIENTO),
    staleTime: 30000,
    refetchInterval: 60000,
  })

  // Insumos en o bajo el stock seguro del central. El cálculo es pesado: se
  // cachea unos minutos y solo si puede ver la sección.
  const { data: alertasCompra } = useQuery({
    queryKey: ['compras-alertas'],
    queryFn: async () => {
      const res = await fetch('/api/compras/alertas')
      if (!res.ok) return { pedir: 0 }
      return res.json() as Promise<{ pedir: number }>
    },
    enabled: !!clienteId && can(SECCION.CONCILIACION_COMPRAS),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })

  const contadores = {
    pendientes: stats?.totalPendientes || 0,
    logs: logStats?.totalUnread || 0,
    compras: alertasCompra?.pedir ?? 0,
  }

  if (isLoading) {
    return (
      <div className="ax">
        <div className="ax-lateral fixed inset-y-0 left-0 hidden w-60 lg:block" />
        <main className="mx-auto max-w-[90rem] space-y-6 px-4 py-8 sm:px-6 lg:pl-[17rem] lg:pr-8">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
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
      <div className="ax" data-mini={mini ? '1' : '0'}>
        <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Saltar al contenido
        </a>

        <aside className="ax-lateral ax-lateral-fijo fixed inset-y-0 left-0 z-40 hidden lg:block">
          <Sidebar mini={mini} contadores={contadores} onMini={alternarMini} />
        </aside>

        {abierto && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
            <aside className="ax-lateral ax-entra absolute inset-y-0 left-0 w-[16rem]">
              <button type="button" className="absolute right-3 top-6 text-[var(--sec)]" aria-label="Cerrar menú" onClick={() => setAbierto(false)}>
                <X className="h-5 w-5" />
              </button>
              <Sidebar contadores={contadores} onNavegar={() => setAbierto(false)} />
            </aside>
          </div>
        )}

        <div className="ax-contenido">
          <Topbar contadores={contadores} onAbrirMenu={() => setAbierto(true)} />
          <main id="contenido" className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
