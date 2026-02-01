'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'

interface Usuario {
  id: string
  email: string
  nombre: string
  rol: 'SUPERADMIN' | 'ADMIN' | 'USER'
  tipo_acceso: 'ADMIN' | 'VIEWER'
  clienteId: string | null
  activo: boolean
  clientes: {
    id: string
    razonSocial: string
    cuit: string
  } | null
}

interface UserSession {
  user: Usuario | null
  isLoading: boolean
  isAdmin: boolean
  isViewer: boolean
  isSuperAdmin: boolean
  clienteId: string | null
  clienteNombre: string | null
  signOut: () => Promise<void>
  refetch: () => void
}

export function useUser(): UserSession {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: userData, isLoading, refetch } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      // Primero verificamos si hay sesión activa
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        return null
      }

      // Obtener datos del usuario desde nuestra tabla
      const { data: usuario, error } = await supabase
        .from('usuarios')
        .select(`
          *,
          clientes (
            id,
            razonSocial,
            cuit
          )
        `)
        .eq('id', authUser.id)
        .single()

      if (error) {
        console.error('Error fetching user:', error)
        // Si el usuario no existe en nuestra tabla, retornamos info básica
        return {
          id: authUser.id,
          email: authUser.email || '',
          nombre: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || '',
          rol: 'USER' as const,
          tipo_acceso: 'VIEWER' as const,
          clienteId: null,
          activo: true,
          clientes: null,
        }
      }

      return usuario as Usuario
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
    retry: false,
  })

  // Escuchar cambios de autenticación
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          queryClient.invalidateQueries({ queryKey: ['current-user'] })
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, queryClient])

  const signOut = async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    window.location.href = '/login'
  }

  return {
    user: userData ?? null,
    isLoading,
    isAdmin: userData?.tipo_acceso === 'ADMIN',
    isViewer: userData?.tipo_acceso === 'VIEWER',
    isSuperAdmin: userData?.rol === 'SUPERADMIN',
    clienteId: userData?.clienteId ?? null,
    clienteNombre: userData?.clientes?.razonSocial ?? null,
    signOut,
    refetch,
  }
}
