'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useEffect } from 'react'
import {
  matrizDe,
  nivelDe,
  puedeEditar,
  puedeVer,
  puedeVerModulo,
  veImportes,
  veImportesModulo,
  type Matriz,
  type Modulo,
  type Nivel,
} from '@/lib/permisos'

interface Usuario {
  id: string
  email: string
  nombre: string
  rol: 'SUPERADMIN' | 'ADMIN' | 'USER'
  tipo_acceso: 'ADMIN' | 'VIEWER'
  permisos: string[]
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
  permisos: string[]
  /** Matriz efectiva (ya resuelta para admin / fallback legacy). */
  matriz: Matriz
  /** Nivel del usuario en una sección (id de SECCION). */
  nivel: (seccion: string) => Nivel
  /** ¿Puede abrir la sección? */
  can: (seccion: string) => boolean
  /** ¿Puede crear/modificar/eliminar en la sección? */
  canEdit: (seccion: string) => boolean
  /** ¿Ve los importes en pesos de la sección, o solo cantidades? */
  canSeeImportes: (seccion: string) => boolean
  /** ¿Puede abrir alguna sección del módulo? Para grupos del menú. */
  canModulo: (modulo: Modulo) => boolean
  /** ¿Ve importes en alguna sección del módulo? */
  canSeeImportesModulo: (modulo: Modulo) => boolean
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
          permisos: [],
          clienteId: null,
          activo: true,
          clientes: null,
        }
      }

      return { ...(usuario as Usuario), permisos: (usuario as { permisos?: string[] }).permisos ?? [] }
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

  const permisos = userData?.permisos ?? []
  const isAdmin =
    userData?.tipo_acceso === 'ADMIN' || userData?.rol === 'ADMIN' || userData?.rol === 'SUPERADMIN'
  const sujeto = { esAdmin: isAdmin, permisos }

  return {
    user: userData ?? null,
    isLoading,
    isAdmin,
    isViewer: !isAdmin,
    isSuperAdmin: userData?.rol === 'SUPERADMIN',
    permisos,
    matriz: matrizDe(sujeto),
    nivel: (seccion: string) => nivelDe(sujeto, seccion),
    can: (seccion: string) => puedeVer(sujeto, seccion),
    canEdit: (seccion: string) => puedeEditar(sujeto, seccion),
    canSeeImportes: (seccion: string) => veImportes(sujeto, seccion),
    canModulo: (modulo: Modulo) => puedeVerModulo(sujeto, modulo),
    canSeeImportesModulo: (modulo: Modulo) => veImportesModulo(sujeto, modulo),
    clienteId: userData?.clienteId ?? null,
    clienteNombre: userData?.clientes?.razonSocial ?? null,
    signOut,
    refetch,
  }
}
