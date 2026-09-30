import { prisma } from '@/lib/prisma'
import { convert } from '@/lib/conciliacion/units'
import { ESTADOS_COMPRA } from '@/app/api/conciliacion/_range'

/**
 * Stock esperado de todos los insumos de un cliente a la MAÑANA de `fecha`
 * (antes del consumo de ese día), igual que el detalle de cada insumo:
 *
 *   esperado = último conteo anterior a `fecha` + comprado − consumo teórico
 *
 * con los movimientos del intervalo [fecha del conteo, fecha). Si el insumo no
 * tiene ningún conteo previo, no hay esperado (null): sin ancla no se puede
 * saber cuánto había.
 */
export async function stockEsperadoPorInsumo(
  clienteId: string,
  fecha: string
): Promise<Map<string, { ultimoConteoFecha: string; ultimoConteo: number; esperado: number }>> {
  const insumos = await prisma.insumos.findMany({
    where: { clienteId, activo: true },
    select: { id: true, unidadBase: true },
  })
  const baseDe = new Map(insumos.map((i) => [i.id, i.unidadBase]))

  // Último conteo estrictamente anterior a `fecha` por insumo.
  const anclas = await prisma.$queryRawUnsafe<Array<{ insumo_id: string; fecha: string; cantidad: number }>>(
    `SELECT DISTINCT ON (s."insumoId") s."insumoId" AS insumo_id,
            to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.cantidad::float8 AS cantidad
       FROM insumo_stock s
       JOIN insumos i ON i.id = s."insumoId"
      WHERE i."clienteId" = $1::uuid AND s.fecha < $2::date
      ORDER BY s."insumoId", s.fecha DESC`,
    clienteId,
    fecha
  )
  if (anclas.length === 0) return new Map()

  const ids = anclas.map((a) => a.insumo_id)
  const desdes = anclas.map((a) => a.fecha)

  // Comprado (unidadBase) por insumo entre su ancla y `fecha` (exclusivo).
  const compras = await prisma.$queryRawUnsafe<Array<{ insumo_id: string; qty: number | null }>>(
    `WITH ancla AS (SELECT * FROM unnest($2::uuid[], $3::date[]) AS t(insumo_id, desde))
     SELECT a."insumoId" AS insumo_id, SUM(di.cantidad * a."factorBase")::float8 AS qty
       FROM ancla an
       JOIN insumo_alias a ON a."insumoId" = an.insumo_id
       JOIN documento_items di ON di.descripcion ILIKE '%' || a.patron || '%'
       JOIN documentos d ON d.id = di."documentoId"
      WHERE d."clienteId" = $1::uuid
        AND d."fechaEmision" >= an.desde AND d."fechaEmision" < $4::date
        AND d."estadoRevision"::text = ANY($5::text[])
      GROUP BY a."insumoId"`,
    clienteId,
    ids,
    desdes,
    fecha,
    [...ESTADOS_COMPRA]
  )

  // Consumo teórico (ventas × receta + merma) por insumo y unidad de receta.
  const consumos = await prisma.$queryRawUnsafe<Array<{ insumo_id: string; unidad: string; qty: number }>>(
    `WITH ancla AS (SELECT * FROM unnest($2::uuid[], $3::date[]) AS t(insumo_id, desde))
     SELECT ri."insumoId" AS insumo_id, ri.unidad,
            SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::float8 AS qty
       FROM ancla an
       JOIN sales_recipe_items ri ON ri."insumoId" = an.insumo_id
       JOIN sales_recipes r ON r.id = ri."recipeId" AND r.activa = true
       JOIN sales_closure_items ci ON ci."productMasterId" = r."productMasterId"
       JOIN sales_closures c ON c.id = ci."closureId"
      WHERE c."clienteId" = $1::uuid AND c.fecha >= an.desde AND c.fecha < $4::date
      GROUP BY ri."insumoId", ri.unidad`,
    clienteId,
    ids,
    desdes,
    fecha
  )

  const compradoDe = new Map(compras.map((c) => [c.insumo_id, Number(c.qty) || 0]))
  const consumoDe = new Map<string, number>()
  for (const c of consumos) {
    const base = baseDe.get(c.insumo_id)
    if (!base) continue
    try {
      consumoDe.set(c.insumo_id, (consumoDe.get(c.insumo_id) ?? 0) + convert(Number(c.qty), c.unidad, base))
    } catch {
      /* unidad de receta incompatible: se ignora, como en el detalle */
    }
  }

  const out = new Map<string, { ultimoConteoFecha: string; ultimoConteo: number; esperado: number }>()
  for (const a of anclas) {
    const esperado = Number(a.cantidad) + (compradoDe.get(a.insumo_id) ?? 0) - (consumoDe.get(a.insumo_id) ?? 0)
    out.set(a.insumo_id, {
      ultimoConteoFecha: a.fecha,
      ultimoConteo: Number(a.cantidad),
      esperado: Number(esperado.toFixed(4)),
    })
  }
  return out
}
