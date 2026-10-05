import { prisma } from '@/lib/prisma'
import { convert, sameDimension } from '@/lib/conciliacion/units'
import { ESTADOS_COMPRA } from '@/app/api/conciliacion/_range'

/**
 * Costo de las recetas a partir de los insumos vinculados.
 *
 * El precio sale de la última compra de cada insumo: `insumo_compra_linea` ya
 * trae el subtotal y la cantidad normalizados a la unidadBase, y con el signo
 * de las notas de crédito aplicado. Se excluyen las NC: una devolución no fija
 * el precio de referencia.
 *
 * El ingrediente puede estar en otra unidad que el insumo (receta en gramos,
 * insumo en kilos), así que se convierte. Si las dimensiones no son
 * compatibles —receta en ml contra un insumo en kg— no se inventa un número:
 * ese ingrediente queda sin costear y se informa, porque un costo a medias y
 * silencioso es peor que ninguno.
 */

export interface CostoReceta {
  /** Costo de la receta completa, en sus porciones base. */
  total: number
  /** Cuántos ingredientes tienen insumo vinculado y precio conocido. */
  costeados: number
  /** Total de ingredientes de la receta. */
  ingredientes: number
  /** Nombres sin costear, para avisar qué falta. */
  faltantes: string[]
}

/** Último costo por unidadBase de cada insumo del cliente. */
export async function costoPorInsumo(clienteId: string): Promise<Map<string, number>> {
  const filas = await prisma.$queryRawUnsafe<Array<{ insumo_id: string; costo: number | null }>>(
    `SELECT DISTINCT ON (co.insumo_id) co.insumo_id,
            (co.subtotal / NULLIF(co.qty_base, 0))::float8 AS costo
       FROM insumo_compra_linea co
      WHERE co.cliente_id = $1::uuid
        AND co.estado_revision::text = ANY($2::text[])
        AND co.tipo <> 'NOTA_CREDITO'
        AND co.subtotal IS NOT NULL
        AND co.qty_base > 0
      ORDER BY co.insumo_id, co.fecha DESC`,
    clienteId,
    [...ESTADOS_COMPRA]
  )
  const m = new Map<string, number>()
  for (const f of filas) if (f.costo != null && isFinite(f.costo)) m.set(f.insumo_id, Number(f.costo))
  return m
}

interface IngredienteCosteable {
  nombre: string
  cantidad: unknown
  unidad: string | null
  insumoId: string | null
  insumo?: { unidadBase: string } | null
}

/** Costo de una receta con los precios ya resueltos. */
export function costoDeReceta(
  ingredientes: IngredienteCosteable[],
  precios: Map<string, number>
): CostoReceta {
  let total = 0
  let costeados = 0
  const faltantes: string[] = []

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
      total += convert(cantidad, ing.unidad, base) * precio
      costeados++
    } catch {
      faltantes.push(ing.nombre)
    }
  }

  return { total, costeados, ingredientes: ingredientes.length, faltantes }
}
