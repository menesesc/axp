import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { importesJson } from '@/lib/importes'
import { descNormSql } from '@/lib/compras/categorias'
import { defaultRange, ESTADOS_COMPRA } from '../_range'

export const dynamic = 'force-dynamic'

/**
 * Cobertura de la conciliación en un período: qué parte de lo vendido tiene
 * receta y qué parte de lo comprado está asignado a un insumo. Lo que queda
 * afuera no entra en el cuadre compra-venta ni en el stock.
 *
 * - ventas: productos vendidos, con/sin receta activa (con ingredientes).
 * - compras: descripciones de factura (confirmadas/pagadas), con su categoría
 *   y el insumo cuyo alias las matchea (o null).
 *
 * Query: ?from=&to=&sucursal=
 */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.CONCILIACION_COBERTURA)
  if (error) return error
  const json = importesJson(verImportes)

  const sp = request.nextUrl.searchParams
  const def = defaultRange()
  const from = sp.get('from') || def.from
  const to = sp.get('to') || def.to
  const sucursal = sp.get('sucursal') || null

  const [ventas, compras] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{
      id: string
      nombre: string
      rubro: string | null
      unidades: number
      importe: number
      ingredientes: number
    }>>(
      `SELECT pm.id, pm.nombre, pm."rubroNombre" AS rubro,
              SUM(ci.unidades)::float8 AS unidades, SUM(ci.importe)::float8 AS importe,
              COALESCE((SELECT COUNT(*) FROM sales_recipes r
                         JOIN sales_recipe_items ri ON ri."recipeId" = r.id
                        WHERE r."productMasterId" = pm.id AND r.activa = true), 0)::int AS ingredientes
         FROM sales_closure_items ci
         JOIN sales_closures c ON c.id = ci."closureId"
         JOIN sales_product_master pm ON pm.id = ci."productMasterId"
        WHERE c."clienteId" = $1::uuid AND c.fecha >= $2::date AND c.fecha <= $3::date
          AND ($4::text IS NULL OR c.sucursal = $4)
        GROUP BY pm.id
        ORDER BY SUM(ci.unidades) DESC`,
      clienteId,
      from,
      to,
      sucursal
    ),
    prisma.$queryRawUnsafe<Array<{
      norm: string
      descripcion: string
      lineas: bigint
      cantidad: number | null
      subtotal: number | null
      categoria: string | null
      insumo_id: string | null
      insumo: string | null
    }>>(
      `SELECT ${descNormSql('di.descripcion')} AS norm,
              MIN(di.descripcion) AS descripcion,
              COUNT(*)::bigint AS lineas,
              SUM(di.cantidad)::float8 AS cantidad,
              SUM(di.subtotal)::float8 AS subtotal,
              MIN(cc.nombre) AS categoria,
              (ARRAY_AGG(ins.id::text))[1] AS insumo_id,
              (ARRAY_AGG(ins.nombre))[1] AS insumo
         FROM documento_items di
         JOIN documentos d ON d.id = di."documentoId"
         LEFT JOIN compra_item_categoria cic
                ON cic."clienteId" = d."clienteId" AND cic."descripcionNorm" = ${descNormSql('di.descripcion')}
         LEFT JOIN compra_categorias cc ON cc.id = cic."categoriaId"
         LEFT JOIN LATERAL (
           SELECT i.id, i.nombre FROM insumo_alias a JOIN insumos i ON i.id = a."insumoId"
            WHERE i."clienteId" = d."clienteId" AND di.descripcion ILIKE '%' || a.patron || '%'
            LIMIT 1
         ) ins ON true
        WHERE d."clienteId" = $1::uuid AND d."fechaEmision" >= $2::date AND d."fechaEmision" <= $3::date
          AND d."estadoRevision"::text = ANY($4::text[])
        GROUP BY 1
        ORDER BY SUM(di.subtotal) DESC NULLS LAST`,
      clienteId,
      from,
      to,
      [...ESTADOS_COMPRA]
    ),
  ])

  return json({
    from,
    to,
    ventas: ventas.map((v) => ({
      id: v.id,
      nombre: v.nombre,
      rubro: v.rubro,
      unidades: Number(v.unidades),
      importe: Number(v.importe),
      conReceta: v.ingredientes > 0,
    })),
    compras: compras.map((c) => ({
      descripcion: c.descripcion,
      norm: c.norm,
      lineas: Number(c.lineas),
      cantidad: c.cantidad != null ? Number(c.cantidad) : null,
      subtotal: Number(c.subtotal ?? 0),
      categoria: c.categoria,
      insumoId: c.insumo_id,
      insumo: c.insumo,
    })),
  })
}
