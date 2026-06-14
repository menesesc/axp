// Conversión de unidades para la conciliación compra-venta.
//
// Cada unidad pertenece a una "dimensión" (masa, volumen, conteo) y se define su
// factor hacia la unidad canónica de esa dimensión. Solo se puede convertir entre
// unidades de la misma dimensión: la unidad de un ingrediente de receta debe ser
// compatible con la unidadBase de su insumo (ej. receta en g ↔ insumo en kg).

type Dimension = 'masa' | 'volumen' | 'conteo'

const FACTORS: Record<string, { dim: Dimension; toCanon: number }> = {
  g:  { dim: 'masa',    toCanon: 1 },
  kg: { dim: 'masa',    toCanon: 1000 },
  ml: { dim: 'volumen', toCanon: 1 },
  l:  { dim: 'volumen', toCanon: 1000 },
  u:  { dim: 'conteo',  toCanon: 1 },
}

export const UNIDADES = Object.keys(FACTORS) as Unidad[]
export type Unidad = keyof typeof FACTORS

/** Normaliza la unidad (trim + minúsculas + alias comunes) o null si no se reconoce. */
export function normalizeUnidad(u: string | null | undefined): Unidad | null {
  if (!u) return null
  const key = u.trim().toLowerCase()
  const aliases: Record<string, Unidad> = {
    g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
    kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg',
    ml: 'ml', cc: 'ml',
    l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
    u: 'u', un: 'u', uni: 'u', unidad: 'u', unidades: 'u',
  }
  return aliases[key] ?? (FACTORS[key] ? (key as Unidad) : null)
}

export function dimensionOf(u: string): Dimension | null {
  const n = normalizeUnidad(u)
  return n ? (FACTORS[n]?.dim ?? null) : null
}

/** true si ambas unidades existen y comparten dimensión (son convertibles). */
export function sameDimension(a: string, b: string): boolean {
  const da = dimensionOf(a)
  const db = dimensionOf(b)
  return da !== null && da === db
}

/** Convierte `qty` de la unidad `from` a la unidad `to`. Lanza si son incompatibles. */
export function convert(qty: number, from: string, to: string): number {
  const f = FACTORS[normalizeUnidad(from) ?? '']
  const t = FACTORS[normalizeUnidad(to) ?? '']
  if (!f) throw new Error(`Unidad desconocida: "${from}"`)
  if (!t) throw new Error(`Unidad desconocida: "${to}"`)
  if (f.dim !== t.dim) {
    throw new Error(`Dimensiones incompatibles: ${from} (${f.dim}) → ${to} (${t.dim})`)
  }
  return (qty * f.toCanon) / t.toCanon
}
