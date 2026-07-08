/**
 * Permisos granulares para usuarios restringidos.
 *
 * Modelo: la tabla `usuarios` tiene una columna `permisos text[]`.
 *  - permisos vacío  → usuario NO restringido: ADMIN/VIEWER conservan su acceso
 *    completo de siempre (retrocompatible).
 *  - permisos no vacío → usuario RESTRINGIDO: solo puede ver los módulos listados.
 *
 * El candado real vive en el servidor (requirePermiso + middleware). La UI solo
 * oculta lo que el server ya bloquea.
 */

export const PERMISO = {
  /** Ranking de ventas por unidades, SIN montos. */
  VENTAS_RANKING: 'ventas.ranking',
  /** Compras / gasto por proveedor, CON importes. */
  COMPRAS: 'compras',
} as const

export type Permiso = (typeof PERMISO)[keyof typeof PERMISO]

/** Todos los permisos asignables desde el panel de usuarios. */
export const PERMISOS_DISPONIBLES: Array<{ value: Permiso; label: string; hint: string }> = [
  { value: PERMISO.VENTAS_RANKING, label: 'Ranking de ventas', hint: 'Unidades vendidas, sin montos' },
  { value: PERMISO.COMPRAS, label: 'Compras', hint: 'Gasto por proveedor, con importes' },
]

/** ¿El usuario está restringido a un subconjunto de módulos? */
export function esRestringido(permisos: string[] | null | undefined): boolean {
  return Array.isArray(permisos) && permisos.length > 0
}

/**
 * ¿Puede el usuario acceder a `modulo`?
 * Usuarios no restringidos (permisos vacío) pueden todo.
 */
export function puede(permisos: string[] | null | undefined, modulo: Permiso): boolean {
  if (!esRestringido(permisos)) return true
  return permisos!.includes(modulo)
}

/**
 * Rutas de página que puede abrir un usuario restringido según sus permisos.
 * Cualquier otra ruta de página lo redirige a su landing.
 */
export function paginasPermitidas(permisos: string[]): string[] {
  const paths: string[] = []
  if (permisos.includes(PERMISO.VENTAS_RANKING)) paths.push('/ventas')
  if (permisos.includes(PERMISO.COMPRAS)) paths.push('/informes/compras')
  return paths
}

/** Landing a la que mandamos a un usuario restringido. */
export function landingRestringido(permisos: string[]): string {
  if (permisos.includes(PERMISO.VENTAS_RANKING)) return '/ventas'
  if (permisos.includes(PERMISO.COMPRAS)) return '/informes/compras'
  return '/login'
}

/**
 * Prefijos de API que puede consumir un usuario restringido.
 * El resto de /api/** le responde 403 desde el middleware (match exacto de path).
 * Nota: /api/sales/ranking y /api/sales/ranking/product están permitidos, pero
 * ambos endpoints eliminan los montos para el usuario restringido (importe = 0).
 */
export function apisPermitidas(permisos: string[]): string[] {
  const apis: string[] = []
  if (permisos.includes(PERMISO.VENTAS_RANKING)) {
    apis.push('/api/sales/ranking', '/api/sales/ranking/product', '/api/sales/units-daily')
  }
  if (permisos.includes(PERMISO.COMPRAS)) {
    apis.push('/api/informes/compras')
  }
  return apis
}
