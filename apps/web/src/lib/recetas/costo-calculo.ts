import { convert, sameDimension } from '../conciliacion/units'

/**
 * Costo de una receta a partir de los insumos vinculados, sin tocar la base.
 *
 * Vive aparte de `costo.ts` para poder probarlo solo: ese otro importa Prisma
 * y arrastra toda la conexión.
 *
 * El ingrediente puede estar en otra unidad que el insumo (receta en gramos,
 * insumo en kilos), así que se convierte. Si las dimensiones no son
 * compatibles —receta en ml contra un insumo en kg— no se inventa un número:
 * ese ingrediente queda sin costear y se informa, porque un costo a medias y
 * silencioso es peor que ninguno.
 *
 * La merma se aplica acá y no en la vista `receta_ingrediente_costo`: el
 * cálculo necesita la tabla de conversión de unidades, que vive en
 * TypeScript. La vista deja la cantidad bruta y el último precio a mano para
 * la pantalla, pero el costo sale de esta función, una sola vez.
 */

export interface CostoReceta {
  /** Costo de la receta completa, en sus porciones base. */
  total: number
  /** Costo de cada ingrediente, por nombre, para mostrarlo en la lista. */
  porIngrediente: Record<string, number>
  /** Cuántos ingredientes tienen insumo vinculado y precio conocido. */
  costeados: number
  /** Total de ingredientes de la receta. */
  ingredientes: number
  /** Nombres sin costear, para avisar qué falta. */
  faltantes: string[]
}

interface IngredienteCosteable {
  nombre: string
  cantidad: unknown
  unidad: string | null
  insumoId: string | null
  insumo?: { unidadBase: string } | null
  /** % de merma ya resuelto (el de la línea o el del insumo). */
  mermaPct?: number | null
}

/**
 * Lo que hay que sacar del depósito para que quede `neta` en el plato.
 *
 * El porcentaje es sobre la cantidad bruta, que es como se mide en la cocina:
 * de 2 kg de bife con 20% de merma quedan 1,6. Al revés: 1,6 / (1 - 0,20) = 2.
 */
export function cantidadBruta(neta: number, mermaPct: number | null | undefined): number {
  const m = Number(mermaPct ?? 0)
  if (!isFinite(m) || m <= 0 || m >= 100) return neta
  return neta / (1 - m / 100)
}

/** Costo de una receta con los precios ya resueltos. */
export function costoDeReceta(
  ingredientes: IngredienteCosteable[],
  precios: Map<string, number>
): CostoReceta {
  let total = 0
  let costeados = 0
  const faltantes: string[] = []
  const porIngrediente: Record<string, number> = {}

  for (const ing of ingredientes) {
    const precio = ing.insumoId ? precios.get(ing.insumoId) : undefined
    const base = ing.insumo?.unidadBase
    const cantidad = ing.cantidad == null ? null : Number(ing.cantidad)

    if (precio === undefined || !base || !ing.unidad || cantidad === null || !isFinite(cantidad)) {
      faltantes.push(ing.nombre)
      continue
    }
    // La receta puede estar en otra unidad que el insumo (g contra kg).
    if (!sameDimension(ing.unidad, base)) {
      faltantes.push(ing.nombre)
      continue
    }
    try {
      const bruta = cantidadBruta(cantidad, ing.mermaPct)
      const costo = convert(bruta, ing.unidad, base) * precio
      total += costo
      porIngrediente[ing.nombre] = costo
      costeados++
    } catch {
      faltantes.push(ing.nombre)
    }
  }

  return { total, porIngrediente, costeados, ingredientes: ingredientes.length, faltantes }
}
