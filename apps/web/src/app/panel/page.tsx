'use client'

import { useUser } from '@/hooks/use-user'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RankingDashboard } from '@/components/sales/ranking-dashboard'
import { ComprasPreciosDashboard } from '@/components/compras/precios-dashboard'
import { PERMISO } from '@/lib/permisos'
import { LogOut } from 'lucide-react'

/**
 * Panel para usuarios con acceso restringido. Sin sidebar ni menú: las tabs
 * Ventas / Compras arriba hacen de navegación y de título. Pensado para móvil.
 */
export default function PanelPage() {
  const { isLoading, user, can, clienteNombre, signOut } = useUser()
  if (isLoading) return null
  if (!user) return null

  const hasVentas = can(PERMISO.VENTAS_RANKING)
  const hasCompras = can(PERMISO.COMPRAS)
  const defaultTab = hasVentas ? 'ventas' : 'compras'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
        <Tabs defaultValue={defaultTab} className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <TabsList className="h-auto bg-slate-100 p-1">
              {hasVentas && (
                <TabsTrigger value="ventas" className="text-sm sm:text-base font-medium px-4 py-2">
                  Ventas
                </TabsTrigger>
              )}
              {hasCompras && (
                <TabsTrigger value="compras" className="text-sm sm:text-base font-medium px-4 py-2">
                  Compras
                </TabsTrigger>
              )}
            </TabsList>
            <div className="flex items-center gap-3">
              {clienteNombre && (
                <span className="hidden sm:block text-xs text-slate-400 truncate max-w-[12rem]">{clienteNombre}</span>
              )}
              <button
                onClick={() => signOut()}
                title="Cerrar sesión"
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </div>
          </div>

          {hasVentas && (
            <TabsContent value="ventas" className="mt-0">
              <RankingDashboard />
            </TabsContent>
          )}
          {hasCompras && (
            <TabsContent value="compras" className="mt-0">
              <ComprasPreciosDashboard />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
