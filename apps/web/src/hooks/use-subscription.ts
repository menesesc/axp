'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUser } from './use-user'

interface Plan {
  nombre: string
  descripcion: string
  precio_mensual: number
  precio_anual: number
  documentos_mes_limite: number | null
  usuarios_limite: number | null
  storage_mb_limite: number
  soporte_prioritario: boolean
}

interface Subscription {
  id: string
  estado: 'ACTIVA' | 'TRIAL' | 'PAUSADA' | 'CANCELADA' | 'VENCIDA'
  fecha_inicio: string
  fecha_fin: string | null
  ciclo: 'MENSUAL' | 'ANUAL'
  plan_nombre: string
  plan_descripcion: string
  precio_mensual: number
  precio_anual: number
  documentos_mes_limite: number | null
  usuarios_limite: number | null
  storage_mb_limite: number
  soporte_prioritario: boolean
  docs_usados_mes: number
  storage_usado_mb: number
  docs_restantes_mes: number | null
  porcentaje_uso_docs: number
}

interface SubscriptionData {
  subscription: Subscription | null
  plans: Plan[]
  isLoading: boolean
  hasActiveSubscription: boolean
  isNearLimit: boolean
  isAtLimit: boolean
}

export function useSubscription(): SubscriptionData {
  const { clienteId } = useUser()
  const supabase = createClient()

  // Obtener suscripción del cliente
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription', clienteId],
    queryFn: async () => {
      if (!clienteId) return null

      const { data, error } = await supabase
        .from('v_suscripcion_cliente')
        .select('*')
        .eq('clienteId', clienteId)
        .single()

      if (error) {
        console.error('Error fetching subscription:', error)
        return null
      }

      return data as Subscription
    },
    enabled: !!clienteId,
    staleTime: 1000 * 60 * 5,
  })

  // Obtener planes disponibles
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planes')
        .select('*')
        .eq('activo', true)
        .order('orden')

      if (error) {
        console.error('Error fetching plans:', error)
        return []
      }

      return data as Plan[]
    },
    staleTime: 1000 * 60 * 30, // 30 minutos
  })

  const isNearLimit = subscription
    ? subscription.porcentaje_uso_docs >= 80
    : false

  const isAtLimit = subscription
    ? subscription.docs_restantes_mes !== null && subscription.docs_restantes_mes <= 0
    : false

  return {
    subscription: subscription ?? null,
    plans: plans ?? [],
    isLoading: subLoading || plansLoading,
    hasActiveSubscription: subscription?.estado === 'ACTIVA' || subscription?.estado === 'TRIAL',
    isNearLimit,
    isAtLimit,
  }
}
