'use client'

import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useUser } from '@/hooks/use-user'
import { useSubscription } from '@/hooks/use-subscription'
import { formatCurrency } from '@/lib/utils'

export default function EstadisticasPage() {
  const { clienteId } = useUser()
  const { subscription, isLoading: subLoading } = useSubscription()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['detailed-stats', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/stats')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const isLoading = subLoading || statsLoading

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-gray-500">No tienes acceso</div>
      </DashboardLayout>
    )
  }

  const docsUsados = subscription?.docs_usados_mes || 0
  const docsLimite = subscription?.documentos_mes_limite
  const porcentajeUso = docsLimite ? Math.round((docsUsados / docsLimite) * 100) : 0
  const storageUsado = subscription?.storage_usado_mb || 0
  const storageLimite = subscription?.storage_mb_limite || 5000
  const porcentajeStorage = Math.round((storageUsado / storageLimite) * 100)

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <h1 className="text-lg font-medium text-gray-900">Estadísticas</h1>

        {isLoading ? (
          <div className="text-sm text-gray-500">Cargando...</div>
        ) : (
          <>
            {/* Plan */}
            {subscription && (
              <div className="border border-gray-200 rounded-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm text-gray-500">Plan actual</span>
                  <span className="text-sm font-medium text-gray-900">{subscription.plan_nombre}</span>
                </div>

                <div className="grid grid-cols-3 gap-8">
                  {/* Documentos */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Documentos este mes</span>
                      <span className="text-sm text-gray-900">{docsUsados} / {docsLimite || '∞'}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full"
                        style={{ width: `${Math.min(porcentajeUso, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Storage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Almacenamiento</span>
                      <span className="text-sm text-gray-900">{storageUsado.toFixed(1)} MB / {storageLimite} MB</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full"
                        style={{ width: `${Math.min(porcentajeStorage, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Precio */}
                  <div className="text-right">
                    <span className="text-2xl font-medium text-gray-900">${subscription.precio_mensual}</span>
                    <span className="text-sm text-gray-500">/mes</span>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-6">
              <div className="border border-gray-200 rounded-md p-4">
                <p className="text-sm text-gray-500">Total Documentos</p>
                <p className="text-2xl font-medium text-gray-900 mt-1">{stats?.totalDocumentos || 0}</p>
              </div>
              <div className="border border-gray-200 rounded-md p-4">
                <p className="text-sm text-gray-500">Tasa de Éxito OCR</p>
                <p className="text-2xl font-medium text-gray-900 mt-1">{stats?.tasaExito || 0}%</p>
              </div>
              <div className="border border-gray-200 rounded-md p-4">
                <p className="text-sm text-gray-500">Pendientes</p>
                <p className="text-2xl font-medium text-gray-900 mt-1">{stats?.totalPendientes || 0}</p>
              </div>
              <div className="border border-gray-200 rounded-md p-4">
                <p className="text-sm text-gray-500">Confirmados</p>
                <p className="text-2xl font-medium text-gray-900 mt-1">{stats?.totalConfirmados || 0}</p>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-6">
              <div className="border border-gray-200 rounded-md p-6">
                <p className="text-sm text-gray-500 mb-4">Resumen Financiero</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total este mes</p>
                    <p className="text-2xl font-medium text-gray-900">{formatCurrency(stats?.totalMes || 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Documentos hoy</p>
                    <p className="text-2xl font-medium text-gray-900">{stats?.documentosHoy || 0}</p>
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-md p-6">
                <p className="text-sm text-gray-500 mb-4">Sistema</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Proveedores activos</p>
                    <p className="text-2xl font-medium text-gray-900">{stats?.totalProveedores || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Estado</p>
                    <p className="text-sm font-medium text-gray-900">Operativo</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription details */}
            {subscription && (
              <div className="border border-gray-200 rounded-md p-6">
                <p className="text-sm text-gray-500 mb-4">Detalles de la Suscripción</p>
                <div className="grid grid-cols-4 gap-6 text-sm">
                  <div>
                    <p className="text-gray-500">Estado</p>
                    <p className="text-gray-900 mt-1">{subscription.estado}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Ciclo</p>
                    <p className="text-gray-900 mt-1">{subscription.ciclo || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Inicio</p>
                    <p className="text-gray-900 mt-1">{subscription.fecha_inicio}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Límite usuarios</p>
                    <p className="text-gray-900 mt-1">{subscription.usuarios_limite || 'Ilimitado'}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
