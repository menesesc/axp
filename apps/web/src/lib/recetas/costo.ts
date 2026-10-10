import { prisma } from '@/lib/prisma'
import { ESTADOS_COMPRA } from '@/app/api/conciliacion/_range'

/**
 * Costo de las recetas a partir de los insumos vinculados.
 *
 * El precio sale de la última compra de cada insumo: `insumo_compra_linea` ya
 * trae el subtotal y la cantidad normalizados a la unidadBase, y con el signo
 * de las notas de crédito aplicado. Se excluyen las NC: una devolución no fija
 * el precio de referencia.
 *
 * Acá vive sólo lo que toca la base. El cálculo (conversión de unidades y
 * merma) está en `costo-calculo.ts`, que no importa Prisma y por eso se puede
 * probar solo.
 */

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

export { cantidadBruta, costoDeReceta } from './costo-calculo'
export type { CostoReceta } from './costo-calculo'
