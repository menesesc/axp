import { prisma } from '@/lib/prisma'
import { convert } from '@/lib/conciliacion/units'
import { ESTADOS_COMPRA } from '@/app/api/conciliacion/_range'
import { getCentral } from '@/lib/stock/depositos'

/**
 * Stock esperado de los insumos de un cliente en un depósito, a la MAÑANA de
 * `fecha` (antes de los movimientos de ese día):
 *
 *   esperado = último conteo del depósito anterior a `fecha`
 *            + compras                 (solo el central: todas entran ahí)
 *            + pedidos recibidos       (enviados desde el central)
 *            − pedidos despachados     (solo el central)
 *            − consumo teórico de los productos que salen de este depósito
 *
 * con los movimientos del intervalo [fecha del conteo, fecha). Los productos
 * sin depósito de salida asignado consumen del central. Sin conteo previo no
 * hay esperado (null): sin ancla no se sabe cuánto había.
 */
export async function stockEsperadoPorInsumo(
  clienteId: string,
  fecha: string,
  depositoId?: string
): Promise<Map<string, { ultimoConteoFecha: string; ultimoConteo: number; esperado: number }>> {
  const central = await getCentral(clienteId)
  const depId = depositoId ?? central.id
  const esCentral = depId === central.id

  const insumos = await prisma.insumos.findMany({
    where: { clienteId, activo: true },
    select: { id: true, unidadBase: true },
  })
  const baseDe = new Map(insumos.map((i) => [i.id, i.unidadBase]))

  // Último conteo del depósito estrictamente anterior a `fecha`, por insumo.
  const anclas = await prisma.$queryRawUnsafe<Array<{ insumo_id: string; fecha: string; cantidad: number }>>(
    `SELECT DISTINCT ON (s."insumoId") s."insumoId" AS insumo_id,
            to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.cantidad::float8 AS cantidad
       FROM insumo_stock s
       JOIN insumos i ON i.id = s."insumoId"
      WHERE i."clienteId" = $1::uuid AND s."depositoId" = $2::uuid AND s.fecha < $3::date
      ORDER BY s."insumoId", s.fecha DESC`,
    clienteId,
    depId,
    fecha
  )
  if (anclas.length === 0) return new Map()

  const ids = anclas.map((a) => a.insumo_id)
  const desdes = anclas.map((a) => a.fecha)
  const ANCLA = `WITH ancla AS (SELECT * FROM unnest($2::uuid[], $3::date[]) AS t(insumo_id, desde))`

  const [compras, consumos, transferencias] = await Promise.all([
    // Comprado (unidadBase) entre el ancla y `fecha`: solo entra al central.
    esCentral
      ? prisma.$queryRawUnsafe<Array<{ insumo_id: string; qty: number | null }>>(
          `${ANCLA}
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
      : Promise.resolve([]),
    // Consumo teórico de los productos que salen de este depósito.
    prisma.$queryRawUnsafe<Array<{ insumo_id: string; unidad: string; qty: number }>>(
      `${ANCLA}
       SELECT ri."insumoId" AS insumo_id, ri.unidad,
              SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::float8 AS qty
         FROM ancla an
         JOIN sales_recipe_items ri ON ri."insumoId" = an.insumo_id
         JOIN sales_recipes r ON r.id = ri."recipeId" AND r.activa = true
         JOIN sales_product_master pm ON pm.id = r."productMasterId"
         JOIN sales_closure_items ci ON ci."productMasterId" = pm.id
         JOIN sales_closures c ON c.id = ci."closureId"
        WHERE c."clienteId" = $1::uuid AND c.fecha >= an.desde AND c.fecha < $4::date
          AND COALESCE(pm."depositoId", $5::uuid) = $6::uuid
        GROUP BY ri."insumoId", ri.unidad`,
      clienteId,
      ids,
      desdes,
      fecha,
      central.id,
      depId
    ),
    // Pedidos internos enviados: + lo recibido, − lo despachado.
    prisma.$queryRawUnsafe<Array<{ insumo_id: string; qty: number }>>(
      `${ANCLA}
       SELECT it."insumoId" AS insumo_id,
              SUM(CASE WHEN p."destinoId" = $5::uuid THEN it."cantidadEnviada" ELSE -it."cantidadEnviada" END)::float8 AS qty
         FROM ancla an
         JOIN pedido_interno_items it ON it."insumoId" = an.insumo_id
         JOIN pedidos_internos p ON p.id = it."pedidoId"
        WHERE p."clienteId" = $1::uuid AND p.estado = 'enviado'
          AND ($5::uuid IN (p."destinoId", p."origenId"))
          AND p."fechaEnvio" >= an.desde AND p."fechaEnvio" < $4::date
          AND it."cantidadEnviada" IS NOT NULL
        GROUP BY it."insumoId"`,
      clienteId,
      ids,
      desdes,
      fecha,
      depId
    ),
  ])

  const compradoDe = new Map(compras.map((c) => [c.insumo_id, Number(c.qty) || 0]))
  const transferDe = new Map(transferencias.map((t) => [t.insumo_id, Number(t.qty) || 0]))
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
    const esperado =
      Number(a.cantidad) +
      (compradoDe.get(a.insumo_id) ?? 0) +
      (transferDe.get(a.insumo_id) ?? 0) -
      (consumoDe.get(a.insumo_id) ?? 0)
    out.set(a.insumo_id, {
      ultimoConteoFecha: a.fecha,
      ultimoConteo: Number(a.cantidad),
      esperado: Number(esperado.toFixed(4)),
    })
  }
  return out
}
