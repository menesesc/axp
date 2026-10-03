import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { convert } from '@/lib/conciliacion/units'
import { defaultRange, ESTADOS_COMPRA } from './_range'

export const dynamic = 'force-dynamic'

/**
 * Informe de conciliación compra-venta por insumo en un período.
 * Compara el consumo teórico (ventas × receta + merma) contra lo comprado
 * (líneas de factura agrupadas por alias × factorBase), y reporta cobertura.
 * Las compras se cuentan sobre facturas confirmadas o pagadas (ESTADOS_COMPRA).
 *
 * Query: ?from=&to=&sucursal=&umbralPct=
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_CONTROL)
  if (error) return error

  const sp = request.nextUrl.searchParams
  const def = defaultRange()
  const from = sp.get('from') || def.from
  const to = sp.get('to') || def.to
  const sucursal = sp.get('sucursal') || null
  const umbralPct = Number(sp.get('umbralPct') || '15')
  const estadosFinal = [...ESTADOS_COMPRA]
  const diasPeriodo = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1)

  // Catálogo de insumos del cliente (id → nombre, unidadBase).
  const insumos = await prisma.insumos.findMany({
    where: { clienteId: clienteId! },
    select: { id: true, nombre: true, unidadBase: true, categoria: true },
  })
  const insumoMap = new Map(insumos.map((i) => [i.id, i]))

  // 1) Consumo teórico por (insumo, unidad). La vista suma recetas y
  //    productos de venta directa (1 a 1, sin receta).
  const consumoRows = await prisma.$queryRawUnsafe<Array<{
    insumo_id: string
    unidad_receta: string
    qty: number
  }>>(`
    SELECT cv.insumo_id,
           cv.unidad AS unidad_receta,
           SUM(cv.qty)::numeric AS qty
    FROM insumo_consumo_linea cv
    WHERE cv.cliente_id = $1::uuid
      AND cv.fecha >= $2::date AND cv.fecha <= $3::date
      AND ($4::text IS NULL OR cv.sucursal = $4)
    GROUP BY cv.insumo_id, cv.unidad
  `, clienteId, from, to, sucursal)

  const consumoByInsumo = new Map<string, number>()
  for (const row of consumoRows) {
    const ins = insumoMap.get(row.insumo_id)
    if (!ins) continue
    let qtyBase: number
    try {
      qtyBase = convert(Number(row.qty), row.unidad_receta, ins.unidadBase)
    } catch {
      // Unidad de receta incompatible con la base (dato legado): se ignora.
      continue
    }
    consumoByInsumo.set(row.insumo_id, (consumoByInsumo.get(row.insumo_id) ?? 0) + qtyBase)
  }

  // 2) Comprado por insumo (alias × factorBase). La vista trae las notas
  //    de crédito en negativo: una devolución resta, no suma.
  const compradoRows = await prisma.$queryRawUnsafe<Array<{
    insumo_id: string
    qty_base: number
    costo_total: number | null
  }>>(`
    SELECT co.insumo_id,
           SUM(co.qty_base)::numeric AS qty_base,
           SUM(co.subtotal)::numeric AS costo_total
    FROM insumo_compra_linea co
    WHERE co.cliente_id = $1::uuid
      AND co.fecha >= $2::date AND co.fecha <= $3::date
      AND co.estado_revision::text = ANY($4::text[])
    GROUP BY co.insumo_id
  `, clienteId, from, to, estadosFinal)

  const compradoByInsumo = new Map<string, { qty: number; costo: number }>()
  for (const row of compradoRows) {
    compradoByInsumo.set(row.insumo_id, {
      qty: Number(row.qty_base) || 0,
      costo: row.costo_total != null ? Number(row.costo_total) : 0,
    })
  }

  // 3) Filas por insumo (solo los que tienen consumo o compra en el período).
  const insumoIds = new Set<string>([...consumoByInsumo.keys(), ...compradoByInsumo.keys()])
  const items = [...insumoIds].map((id) => {
    const ins = insumoMap.get(id)
    const consumoTeorico = consumoByInsumo.get(id) ?? 0
    const comprado = compradoByInsumo.get(id) ?? { qty: 0, costo: 0 }
    const diferencia = comprado.qty - consumoTeorico
    const diferenciaPct = consumoTeorico > 0 ? (diferencia / consumoTeorico) * 100 : null
    const costoUnitario = comprado.qty > 0 ? comprado.costo / comprado.qty : null
    // Días que cubre lo comprado al ritmo de consumo del período (lectura de stock).
    const consumoDiario = consumoTeorico / diasPeriodo
    const diasCobertura = consumoDiario > 0 ? comprado.qty / consumoDiario : null
    // Solo es incidencia un FALTANTE (consumiste más de lo que compraste): puede ser
    // facturas sin cargar, receta mal o fuga. Un excedente suele ser stock, no merma.
    const incidencia = diferenciaPct != null && diferenciaPct < -umbralPct
    const posibleStock = diferenciaPct != null && diferenciaPct > umbralPct
    return {
      insumoId: id,
      nombre: ins?.nombre ?? '(insumo eliminado)',
      unidadBase: ins?.unidadBase ?? '',
      categoria: ins?.categoria ?? null,
      consumoTeorico,
      compradoBase: comprado.qty,
      costoComprado: comprado.costo,
      costoUnitario,
      diferencia,
      diferenciaPct,
      diasCobertura,
      incidencia,
      posibleStock,
    }
  })
  items.sort((a, b) => {
    // Incidencias (faltantes) primero, luego por magnitud de diferencia %.
    if (a.incidencia !== b.incidencia) return a.incidencia ? -1 : 1
    return Math.abs(b.diferenciaPct ?? 0) - Math.abs(a.diferenciaPct ?? 0)
  })

  // 4) Cobertura: productos vendidos sin receta activa.
  const productosSinReceta = await prisma.$queryRawUnsafe<Array<{
    pid: string
    nombre: string
    unidades: number
    importe: number
  }>>(`
    SELECT ci."productMasterId" AS pid,
           MAX(pm.nombre) AS nombre,
           SUM(ci.unidades)::numeric AS unidades,
           SUM(ci.importe)::numeric AS importe
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    JOIN sales_product_master pm ON pm.id = ci."productMasterId"
    LEFT JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
      AND ci."productMasterId" IS NOT NULL
      AND r.id IS NULL
    GROUP BY ci."productMasterId"
    ORDER BY importe DESC NULLS LAST
    LIMIT 100
  `, clienteId, from, to, sucursal)

  // Cobertura global: % de unidades vendidas que provienen de productos con receta.
  const cobRows = await prisma.$queryRawUnsafe<Array<{ total: number | null; con_receta: number | null }>>(`
    SELECT SUM(ci.unidades)::numeric AS total,
           SUM(CASE WHEN r.id IS NOT NULL THEN ci.unidades ELSE 0 END)::numeric AS con_receta
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    LEFT JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
  `, clienteId, from, to, sucursal)
  const totalU = Number(cobRows[0]?.total ?? 0)
  const conRecetaU = Number(cobRows[0]?.con_receta ?? 0)
  const coberturaPct = totalU > 0 ? (conRecetaU / totalU) * 100 : 0

  // Insumos con consumo teórico > 0 pero sin compras matcheadas (falta alias o no se compró).
  const insumosSinCompra = items
    .filter((it) => it.consumoTeorico > 0 && it.compradoBase === 0)
    .map((it) => ({ insumoId: it.insumoId, nombre: it.nombre, consumoTeorico: it.consumoTeorico, unidadBase: it.unidadBase }))

  // Sucursales disponibles para el filtro.
  const sucRows = await prisma.$queryRawUnsafe<Array<{ sucursal: string }>>(`
    SELECT DISTINCT sucursal FROM sales_closures
    WHERE "clienteId" = $1::uuid AND sucursal IS NOT NULL
    ORDER BY sucursal
  `, clienteId)

  return NextResponse.json({
    periodo: { from, to, sucursal },
    umbralPct,
    estados: estadosFinal,
    items,
    cobertura: {
      coberturaPct,
      unidadesTotales: totalU,
      unidadesConReceta: conRecetaU,
      productosSinReceta: productosSinReceta.map((p) => ({
        productMasterId: p.pid,
        nombre: p.nombre,
        unidades: Number(p.unidades),
        importe: Number(p.importe),
      })),
      insumosSinCompra,
    },
    sucursales: sucRows.map((s) => s.sucursal),
  })
}
