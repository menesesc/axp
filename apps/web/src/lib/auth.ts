import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  cumple,
  veImportes,
  type Modulo,
  type Nivel,
} from '@/lib/permisos'

export interface AuthUser {
  id: string
  email: string
  nombre: string
  rol: 'SUPERADMIN' | 'ADMIN' | 'USER'
  tipo_acceso: 'ADMIN' | 'VIEWER'
  permisos: string[]
  clienteId: string | null
  activo: boolean
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
        activo: true,
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

/** ¿El usuario tiene acceso total? Los admin no pasan por la matriz. */
export function esAdminUsuario(user: Pick<AuthUser, 'rol' | 'tipo_acceso'> | null): boolean {
  if (!user) return false
  return user.tipo_acceso === 'ADMIN' || user.rol === 'ADMIN' || user.rol === 'SUPERADMIN'
}

export interface ModuloResult extends AuthResult {
  clienteId: string | null
  /** ¿Puede ver los importes en pesos de este módulo? */
  verImportes: boolean
}

/**
 * Verifica que el usuario alcanza `minimo` en `modulo` y que tiene empresa.
 * Es el guard que usan las rutas: duplica a propósito el chequeo del
 * middleware, para que una ruta siga protegida si el matcher cambia.
 *
 *   const { clienteId, verImportes, error } = await requireModulo(MODULO.VENTAS)
 *   if (error) return error
 */
export async function requireModulo(
  modulo: Modulo,
  minimo: Nivel = 'view'
): Promise<ModuloResult> {
  const result = await getAuthUser()
  if (result.error) return { ...result, clienteId: null, verImportes: false }

  // Una cuenta dada de baja no entra a ningún lado, tenga los permisos que tenga.
  if (result.user && result.user.activo === false) {
    return {
      user: null,
      clienteId: null,
      verImportes: false,
      error: NextResponse.json({ error: 'Tu cuenta está desactivada' }, { status: 403 }),
    }
  }

  const sujeto = {
    esAdmin: esAdminUsuario(result.user),
    permisos: result.user?.permisos,
  }

  if (!result.user || !cumple(sujeto, modulo, minimo)) {
    return {
      user: null,
      clienteId: null,
      verImportes: false,
      error: NextResponse.json(
        {
          error:
            minimo === 'edit'
              ? 'No tenés permiso para modificar esta sección'
              : 'No tenés acceso a esta sección',
        },
        { status: 403 }
      ),
    }
  }

  if (!result.user.clienteId) {
    return {
      user: result.user,
      clienteId: null,
      verImportes: false,
      error: NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 }),
    }
  }

  return {
    ...result,
    clienteId: result.user.clienteId,
    verImportes: veImportes(sujeto, modulo),
  }
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
