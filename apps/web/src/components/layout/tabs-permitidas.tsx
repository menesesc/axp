'use client'

import { useUser } from '@/hooks/use-user'
import { seccionesDeModulo, type Modulo } from '@/lib/permisos'

/**
 * Pestañas de una página, filtradas por los permisos del usuario.
 *
 * Cada pestaña es una sección (ver SECCIONES en lib/permisos): el usuario ve
 * solo aquellas en las que tiene al menos nivel "ver". Es únicamente cosmético
 * — el candado real es el middleware, que bloquea la API de cada pestaña — pero
 * evita mostrar una pestaña que al abrirse daría 403.
 */
export function useTabsPermitidas(modulo: Modulo) {
  const { can, canSeeImportes } = useUser()

  const secciones = seccionesDeModulo(modulo).filter((s) => s.tab)
  const permitidas = secciones.filter((s) => can(s.value))

  return {
    /** ¿Puede ver esta pestaña? */
    puede: (tab: string) => permitidas.some((s) => s.tab === tab),
    /** ¿Ve importes en pesos en esta pestaña, o solo cantidades? */
    veImportes: (tab: string) => {
      const def = secciones.find((s) => s.tab === tab)
      return def ? canSeeImportes(def.value) : false
    },
    /**
     * Primera pestaña que puede abrir; sirve de `defaultValue`. Cadena vacía
     * si no tiene ninguna — los llamadores cortan antes con `vacio`.
     */
    primera: permitidas[0]?.tab ?? '',
    /** No tiene ninguna pestaña de este módulo. */
    vacio: permitidas.length === 0,
  }
}
