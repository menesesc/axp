/**
 * Comparación de nombres entre ingredientes de receta e insumos del catálogo.
 *
 * Sin dependencias: es lógica pura y se puede probar sola, que es justo lo que
 * hace falta con algo que decide si dos cosas son el mismo producto.
 */

export interface InsumoLite {
  id: string
  nombre: string
}

export interface SugerenciaInsumo {
  /** Nombre del ingrediente tal como está en la receta. */
  nombre: string
  insumoId: string | null
  insumoNombre: string | null
  /** 0 a 1. Por debajo de 0.5 conviene que lo mire un humano. */
  confianza: number
  fuente: 'local' | 'ia' | 'ninguna'
}

export /** Minúsculas, sin acentos ni plurales obvios, sin palabras de relleno. */
const RELLENO = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'con', 'sin', 'x', 'por', 'al', 'y', 'en'])

export function normalizar(t: string): string[] {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((p) => p.replace(/(es|s)$/, ''))
    .filter((p) => p.length > 2 && !RELLENO.has(p))
}

/**
 * Parecido entre dos nombres: proporción de palabras del ingrediente que
 * aparecen en el insumo. Se mide contra el ingrediente y no contra el insumo
 * porque los nombres de insumo traen marca y presentación ("MANTECA LA
 * SERENISIMA X 200G") y eso no debería castigar la coincidencia.
 */
export function parecido(ingrediente: string, insumo: string): number {
  const a = normalizar(ingrediente)
  const b = new Set(normalizar(insumo))
  if (a.length === 0 || b.size === 0) return 0
  let hits = 0
  for (const palabra of a) {
    if (b.has(palabra)) hits++
    // Prefijo: "cebolla" contra "cebollita".
    else if ([...b].some((x) => x.startsWith(palabra) || palabra.startsWith(x))) hits += 0.7
  }
  return hits / a.length
}

/** Primera pasada, local. */
export function sugerirLocal(nombres: string[], insumos: InsumoLite[]): SugerenciaInsumo[] {
  return nombres.map((nombre) => {
    let mejor: InsumoLite | null = null
    let score = 0
    for (const ins of insumos) {
      const s = parecido(nombre, ins.nombre)
      if (s > score) {
        score = s
        mejor = ins
      }
    }
    if (!mejor || score < 0.5) {
      return { nombre, insumoId: null, insumoNombre: null, confianza: score, fuente: 'ninguna' as const }
    }
    return { nombre, insumoId: mejor.id, insumoNombre: mejor.nombre, confianza: score, fuente: 'local' as const }
  })
}
