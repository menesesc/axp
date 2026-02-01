import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'SUPERADMIN' | 'ADMIN' | 'USER'
  tipo_acceso: 'ADMIN' | 'VIEWER'
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
        clienteId: null,
      },
      error: null,
    }
  }

  return {
    user: usuario as AuthUser,
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
