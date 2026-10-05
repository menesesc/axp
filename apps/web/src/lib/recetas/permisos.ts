import { esAdminUsuario } from '@/lib/auth'
import { puedeEditar, SECCION } from '@/lib/permisos'

/**
 * ¿Puede editar el recetario?
 *
 * Se resuelve con los permisos que ya trae el usuario autenticado, sin pegarle
 * de nuevo a la base. Se usa para dos cosas: habilitar los botones y, sobre
 * todo, decidir si los borradores entran en el listado.
 */
export function puedeEditarRecetario(
  user: { rol: string; tipo_acceso: string; permisos?: string[] } | null | undefined
): boolean {
  if (!user) return false
  const esAdmin = esAdminUsuario(user as Parameters<typeof esAdminUsuario>[0])
  return puedeEditar({ esAdmin, permisos: user.permisos }, SECCION.RECETAS_LIBRO)
}
