'use client'

import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/use-user'
import { useSubscription } from '@/hooks/use-subscription'
import { formatCurrency } from '@/lib/utils'
import {
  Sparkles,
  Check,
  FileText,
  Users,
  HardDrive,
  Zap,
  Headphones,
  Crown,
  Loader2,
} from 'lucide-react'

interface Plan {
  id: string
  nombre: string
  descripcion: string
  precio_mensual: number
  precio_anual: number | null
  documentos_mes_limite: number | null
  usuarios_limite: number | null
  storage_mb_limite: number
  ocr_incluido: boolean
  soporte_prioritario: boolean
  orden: number
}

interface UsageData {
  documentos_mes: number
  documentos_limite: number | null
  usuarios_activos: number
  usuarios_limite: number | null
  storage_usado_mb: number
  storage_limite_mb: number
}

export default function PlanPage() {
  const { clienteId } = useUser()
  const { subscription, isLoading: subLoading } = useSubscription()

  const { data: planesData, isLoading: planesLoading } = useQuery<{ planes: Plan[] }>({
    queryKey: ['planes'],
    queryFn: async () => {
      const res = await fetch('/api/planes')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const { data: usageData, isLoading: usageLoading } = useQuery<{ usage: UsageData }>({
    queryKey: ['usage', clienteId],
    queryFn: async () => {
      const res = await fetch('/api/configuracion/usage')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!clienteId,
  })

  const isLoading = subLoading || planesLoading || usageLoading
  const planes = planesData?.planes || []
  const usage = usageData?.usage
  // If no subscription, default to the smallest plan (first by orden)
  const smallestPlan = planes.length > 0 ? planes.reduce((a, b) => (a.orden < b.orden ? a : b)) : null
  const currentPlan = planes.find((p) => p.nombre === subscription?.plan_nombre) || smallestPlan

  const getUsagePercent = (used: number, limit: number | null) => {
    if (!limit) return 0
    return Math.min(100, Math.round((used / limit) * 100))
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header
          title="Mi Plan"
          description="Gestiona tu suscripción y consumo"
        />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Current Plan */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Plan actual</p>
                  <h2 className="text-2xl font-bold mt-1 flex items-center gap-2">
                    {subscription?.plan_nombre || currentPlan?.nombre || 'Starter'}
                    {currentPlan?.soporte_prioritario && (
                      <Crown className="h-5 w-5 text-amber-400" />
                    )}
                  </h2>
                  <p className="text-slate-400 mt-1">
                    {subscription?.estado === 'ACTIVA'
                      ? 'Suscripción activa'
                      : subscription?.estado === 'TRIAL'
                      ? 'Período de prueba'
                      : 'Suscripción activa'}
                  </p>
                </div>
                {currentPlan && (
                  <div className="text-right">
                    <p className="text-3xl font-bold">
                      {formatCurrency(currentPlan.precio_mensual)}
                    </p>
                    <p className="text-slate-400 text-sm">/mes</p>
                  </div>
                )}
              </div>

              {/* Usage Stats */}
              {usage && (
                <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-700">
                  <div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <FileText className="h-4 w-4" />
                      Documentos
                    </div>
                    <p className="text-lg font-semibold mt-1">
                      {usage.documentos_mes}
                      {usage.documentos_limite && (
                        <span className="text-slate-400 font-normal"> / {usage.documentos_limite}</span>
                      )}
                    </p>
                    {usage.documentos_limite && (
                      <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${getUsagePercent(usage.documentos_mes, usage.documentos_limite)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Users className="h-4 w-4" />
                      Usuarios
                    </div>
                    <p className="text-lg font-semibold mt-1">
                      {usage.usuarios_activos}
                      {usage.usuarios_limite && (
                        <span className="text-slate-400 font-normal"> / {usage.usuarios_limite}</span>
                      )}
                    </p>
                    {usage.usuarios_limite && (
                      <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${getUsagePercent(usage.usuarios_activos, usage.usuarios_limite)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <HardDrive className="h-4 w-4" />
                      Almacenamiento
                    </div>
                    <p className="text-lg font-semibold mt-1">
                      {Math.round(usage.storage_usado_mb)} MB
                      <span className="text-slate-400 font-normal"> / {Math.round(usage.storage_limite_mb / 1024)} GB</span>
                    </p>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${getUsagePercent(usage.storage_usado_mb, usage.storage_limite_mb)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Available Plans */}
            <div>
              <h3 className="font-semibold text-lg mb-4">Planes disponibles</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {planes.map((plan) => {
                  const isCurrent = plan.id === currentPlan?.id
                  const isUpgrade = currentPlan && plan.orden > currentPlan.orden

                  return (
                    <div
                      key={plan.id}
                      className={`bg-white border rounded-xl p-5 ${
                        isCurrent ? 'border-blue-500 ring-1 ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold">{plan.nombre}</h4>
                        {isCurrent && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                            Actual
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mb-4">{plan.descripcion}</p>
                      <p className="text-2xl font-bold mb-4">
                        {formatCurrency(plan.precio_mensual)}
                        <span className="text-sm font-normal text-slate-500">/mes</span>
                      </p>

                      <ul className="space-y-2 mb-4">
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          {plan.documentos_mes_limite
                            ? `${plan.documentos_mes_limite} docs/mes`
                            : 'Documentos ilimitados'}
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          {plan.usuarios_limite
                            ? `${plan.usuarios_limite} usuarios`
                            : 'Usuarios ilimitados'}
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          {Math.round(plan.storage_mb_limite / 1024)} GB almacenamiento
                        </li>
                        {plan.ocr_incluido && (
                          <li className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4 text-amber-500" />
                            OCR automático
                          </li>
                        )}
                        {plan.soporte_prioritario && (
                          <li className="flex items-center gap-2 text-sm">
                            <Headphones className="h-4 w-4 text-purple-500" />
                            Soporte prioritario
                          </li>
                        )}
                      </ul>

                      {!isCurrent && (
                        <Button
                          className="w-full"
                          variant={isUpgrade ? 'default' : 'outline'}
                        >
                          {isUpgrade ? (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Mejorar plan
                            </>
                          ) : (
                            'Cambiar plan'
                          )}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add-ons */}
            <div>
              <h3 className="font-semibold text-lg mb-4">Adicionales</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white border rounded-lg p-5 flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">Pack de documentos extra</h4>
                    <p className="text-sm text-slate-500 mt-1">
                      +100 documentos adicionales para este mes
                    </p>
                    <p className="text-lg font-semibold mt-2">$2.990</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Agregar
                  </Button>
                </div>
                <div className="bg-white border rounded-lg p-5 flex items-start justify-between">
                  <div>
                    <h4 className="font-medium">Almacenamiento extra</h4>
                    <p className="text-sm text-slate-500 mt-1">
                      +5 GB de almacenamiento permanente
                    </p>
                    <p className="text-lg font-semibold mt-2">$1.990/mes</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Agregar
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
