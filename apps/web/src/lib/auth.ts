import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { puede, type Permiso } from '@/lib/permisos'

interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'SUPERADMIN' | 'ADMIN' | 'USER'
  tipo_acceso: 'ADMIN' | 'VIEWER'
  permisos: string[]
  clienteId: string | null
}

interface AuthResult {
  user: AuthUser | null
  error: NextResponse | null
}

/**
 * Obtiene el usuario autenticado desde la sesión
 * Retorna el usuario o un error 401 si no está autenticado
 */
export async function getAuthUser(): Promise<AuthResult> {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      ),
    }
  }

  // Obtener datos del usuario desde nuestra tabla
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (error || !usuario) {
    // Usuario autenticado pero sin registro en nuestra tabla
    return {
      user: {
        id: authUser.id,
        email: authUser.email || '',
        nombre: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
        rol: 'USER',
        tipo_acceso: 'VIEWER',
        permisos: [],
        clienteId: null,
      },
      error: null,
    }
  }

  return {
    user: { ...(usuario as AuthUser), permisos: (usuario as { permisos?: string[] }).permisos ?? [] },
    error: null,
  }
}

/**
 * Verifica que el usuario tiene acceso de administrador
 */
export async function requireAdmin(): Promise<AuthResult> {
  const result = await getAuthUser()

  if (result.error) {
    return result
  }

  if (!result.user || result.user.tipo_acceso !== 'ADMIN') {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'No tienes permisos de administrador' },
        { status: 403 }
      ),
    }
  }

  return result
}

/**
 * Verifica que el usuario tiene permiso para un módulo dado.
 * Usuarios NO restringidos (permisos vacío) pasan siempre; los restringidos
 * pasan solo si el módulo está en su lista. Devuelve también clienteId.
 */
export async function requirePermiso(
  modulo: Permiso
): Promise<AuthResult & { clienteId: string | null }> {
  const result = await getAuthUser()
  if (result.error) return { ...result, clienteId: null }

  if (!result.user || !puede(result.user.permisos, modulo)) {
    return {
      user: null,
      clienteId: null,
      error: NextResponse.json({ error: 'No tienes acceso a esta sección' }, { status: 403 }),
    }
  }

  if (!result.user.clienteId) {
    return {
      user: result.user,
      clienteId: null,
      error: NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 }),
    }
  }

  return { ...result, clienteId: result.user.clienteId }
}

/**
 * Verifica que el usuario tiene un cliente asignado
 */
export async function requireClienteId(): Promise<AuthResult & { clienteId: string | null }> {
  const result = await getAuthUser()

  if (result.error) {
    return { ...result, clienteId: null }
  }

  if (!result.user?.clienteId) {
    return {
      user: result.user,
      clienteId: null,
      error: NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      ),
    }
  }

  return {
    ...result,
    clienteId: result.user.clienteId,
  }
}
