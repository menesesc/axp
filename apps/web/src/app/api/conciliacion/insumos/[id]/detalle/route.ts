import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'
import { convert } from '@/lib/conciliacion/units'
import { defaultRange, ESTADOS_COMPRA } from '../../../_range'

export const dynamic = 'force-dynamic'

/**
 * Detalle de conciliación de un insumo en un período: serie semanal de consumo
 * teórico vs comprado (+ costo unitario), ranking de productos que más lo
 * consumen y diferencia acumulada. Compras sobre facturas confirmadas/pagadas.
 *
 * Query: ?from=&to=&sucursal=
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const insumo = await prisma.insumos.findFirst({
    where: { id: params.id, clienteId: clienteId! },
    select: { id: true, nombre: true, unidadBase: true },
  })
  if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const sp = request.nextUrl.searchParams
  const def = defaultRange()
  const from = sp.get('from') || def.from
  const to = sp.get('to') || def.to
  const sucursal = sp.get('sucursal') || null
  const base = insumo.unidadBase

  // Consumo teórico semanal (ventas × receta + merma), por unidad de receta.
  const consumoRows = await prisma.$queryRawUnsafe<Array<{
    semana: string
    unidad_receta: string
    qty: number
  }>>(`
    SELECT date_trunc('week', c.fecha)::date AS semana,
           ri.unidad AS unidad_receta,
           SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::numeric AS qty
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
    JOIN sales_recipe_items ri ON ri."recipeId" = r.id AND ri."insumoId" = $5::uuid
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
    GROUP BY semana, ri.unidad
    ORDER BY semana
  `, clienteId, from, to, sucursal, insumo.id)

  const consumoByWeek = new Map<string, number>()
  for (const row of consumoRows) {
    let q: number
    try { q = convert(Number(row.qty), row.unidad_receta, base) } catch { continue }
    const key = String(row.semana).slice(0, 10)
    consumoByWeek.set(key, (consumoByWeek.get(key) ?? 0) + q)
  }

  // Comprado semanal (líneas de factura × factorBase) + costo.
  const compradoRows = await prisma.$queryRawUnsafe<Array<{
    semana: string
    qty_base: number
    costo: number | null
  }>>(`
    SELECT date_trunc('week', d."fechaEmision")::date AS semana,
           SUM(di.cantidad * a."factorBase")::numeric AS qty_base,
           SUM(di.subtotal)::numeric AS costo
    FROM documento_items di
    JOIN documentos d ON d.id = di."documentoId"
    JOIN insumo_alias a ON di.descripcion ILIKE '%' || a.patron || '%'
    WHERE a."insumoId" = $5::uuid
      AND d."clienteId" = $1::uuid
      AND d."fechaEmision" >= $2::date AND d."fechaEmision" <= $3::date
      AND d."estadoRevision"::text = ANY($4::text[])
    GROUP BY semana
    ORDER BY semana
  `, clienteId, from, to, [...ESTADOS_COMPRA], insumo.id)

  const compradoByWeek = new Map<string, { qty: number; costo: number }>()
  for (const row of compradoRows) {
    const key = String(row.semana).slice(0, 10)
    compradoByWeek.set(key, {
      qty: Number(row.qty_base) || 0,
      costo: row.costo != null ? Number(row.costo) : 0,
    })
  }

  // Serie unificada de semanas, ordenada ascendente.
  const semanas = [...new Set([...consumoByWeek.keys(), ...compradoByWeek.keys()])].sort()
  let consumoAcum = 0
  let compradoAcum = 0
  const serie = semanas.map((semana) => {
    const consumo = consumoByWeek.get(semana) ?? 0
    const compra = compradoByWeek.get(semana) ?? { qty: 0, costo: 0 }
    consumoAcum += consumo
    compradoAcum += compra.qty
    return {
      semana,
      consumo,
      comprado: compra.qty,
      costo: compra.costo,
      costoUnitario: compra.qty > 0 ? compra.costo / compra.qty : null,
      difAcum: compradoAcum - consumoAcum,
      consumoAcum,
      compradoAcum,
    }
  })

  // Ranking de productos que más consumen el insumo en el período.
  const prodRows = await prisma.$queryRawUnsafe<Array<{
    pid: string
    nombre: string
    unidades: number
    unidad_receta: string
    qty: number
  }>>(`
    SELECT ci."productMasterId" AS pid,
           MAX(pm.nombre) AS nombre,
           SUM(ci.unidades)::numeric AS unidades,
           ri.unidad AS unidad_receta,
           SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::numeric AS qty
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
    JOIN sales_recipe_items ri ON ri."recipeId" = r.id AND ri."insumoId" = $5::uuid
    JOIN sales_product_master pm ON pm.id = ci."productMasterId"
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
    GROUP BY ci."productMasterId", ri.unidad
  `, clienteId, from, to, sucursal, insumo.id)

  const prodMap = new Map<string, { nombre: string; unidades: number; consumo: number }>()
  for (const row of prodRows) {
    let q: number
    try { q = convert(Number(row.qty), row.unidad_receta, base) } catch { continue }
    const prev = prodMap.get(row.pid) ?? { nombre: row.nombre, unidades: 0, consumo: 0 }
    prev.consumo += q
    prev.unidades += Number(row.unidades) || 0
    prodMap.set(row.pid, prev)
  }
  const productos = [...prodMap.entries()]
    .map(([productMasterId, v]) => ({ productMasterId, ...v }))
    .sort((a, b) => b.consumo - a.consumo)

  // Resumen del período.
  const consumoTeorico = [...consumoByWeek.values()].reduce((s, v) => s + v, 0)
  const compradoBase = [...compradoByWeek.values()].reduce((s, v) => s + v.qty, 0)
  const costoComprado = [...compradoByWeek.values()].reduce((s, v) => s + v.costo, 0)
  const diferencia = compradoBase - consumoTeorico

  return NextResponse.json({
    insumo,
    periodo: { from, to, sucursal },
    resumen: {
      consumoTeorico,
      compradoBase,
      costoComprado,
      costoUnitario: compradoBase > 0 ? costoComprado / compradoBase : null,
      diferencia,
      diferenciaPct: consumoTeorico > 0 ? (diferencia / consumoTeorico) * 100 : null,
    },
    serie,
    productos,
  })
}
