import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { convert } from '@/lib/conciliacion/units'
import { defaultRange, ESTADOS_COMPRA } from '../_range'

export const dynamic = 'force-dynamic'

/**
 * Margen / food-cost por producto de venta con receta activa.
 * costoReceta = Σ ingrediente(normalizado a unidadBase) × (1+merma) × costoUnitarioInsumo.
 * precioVenta = Σimporte / Σunidades de los cierres del período.
 * Costos sobre facturas confirmadas o pagadas (ESTADOS_COMPRA).
 *
 * Query: ?from=&to=&sucursal=
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_MARGEN)
  if (error) return error

  const sp = request.nextUrl.searchParams
  const def = defaultRange()
  const from = sp.get('from') || def.from
  const to = sp.get('to') || def.to
  const sucursal = sp.get('sucursal') || null
  const insumoId = sp.get('insumoId') || null
  const estadosFinal = [...ESTADOS_COMPRA]

  // Costo unitario por insumo (en $/unidadBase) a partir de las compras del período.
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
  const costoUnitarioByInsumo = new Map<string, number>()
  for (const r of compradoRows) {
    const qty = Number(r.qty_base) || 0
    if (qty > 0 && r.costo_total != null) costoUnitarioByInsumo.set(r.insumo_id, Number(r.costo_total) / qty)
  }

  // Último costo conocido por insumo (compra más reciente ≤ to): fallback cuando
  // no hubo compras del insumo dentro del período seleccionado.
  const lastCostRows = await prisma.$queryRawUnsafe<Array<{ insumo_id: string; costo_unit: number | null }>>(`
    SELECT DISTINCT ON (co.insumo_id) co.insumo_id,
           (co.subtotal / NULLIF(co.qty_base, 0))::numeric AS costo_unit
    FROM insumo_compra_linea co
    WHERE co.cliente_id = $1::uuid
      AND co.fecha <= $2::date
      AND co.estado_revision::text = ANY($3::text[])
      AND co.cantidad IS NOT NULL AND co.subtotal IS NOT NULL
      AND co.tipo <> 'NOTA_CREDITO'
    ORDER BY co.insumo_id, co.fecha DESC
  `, clienteId, to, estadosFinal)
  const lastCostByInsumo = new Map<string, number>()
  for (const r of lastCostRows) { if (r.costo_unit != null) lastCostByInsumo.set(r.insumo_id, Number(r.costo_unit)) }

  // Ventas por producto en el período (unidades + importe).
  const ventasRows = await prisma.$queryRawUnsafe<Array<{
    pid: string
    unidades: number
    importe: number
  }>>(`
    SELECT ci."productMasterId" AS pid,
           SUM(ci.unidades)::numeric AS unidades,
           SUM(ci.importe)::numeric AS importe
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
      AND ci."productMasterId" IS NOT NULL
    GROUP BY ci."productMasterId"
  `, clienteId, from, to, sucursal)
  const ventasByProducto = new Map(ventasRows.map((v) => [v.pid, { unidades: Number(v.unidades), importe: Number(v.importe) }]))

  // Tasa de IVA de venta tomada de los cierres del período (ivaTotal/netoGravado).
  // El importe de Maxirest viene CON IVA y el costo de factura está NETO, así que
  // el margen se calcula neto contra neto: precio_neto = importe / (1 + tasa).
  const ivaRows = await prisma.$queryRawUnsafe<Array<{ iva: number | null; neto: number | null }>>(`
    SELECT SUM("ivaTotal")::numeric AS iva, SUM("netoGravado")::numeric AS neto
    FROM sales_closures
    WHERE "clienteId" = $1::uuid AND fecha >= $2::date AND fecha <= $3::date
      AND ($4::text IS NULL OR sucursal = $4)
  `, clienteId, from, to, sucursal)
  const ivaNeto = Number(ivaRows[0]?.neto) || 0
  const ivaMonto = Number(ivaRows[0]?.iva) || 0
  const ivaVentaRate = ivaNeto > 0 ? ivaMonto / ivaNeto : 0.21
  const netFactor = 1 / (1 + ivaVentaRate)

  // Recetas activas con ingredientes.
  const recetas = await prisma.sales_recipes.findMany({
    where: {
      activa: true,
      productMaster: { clienteId: clienteId! },
      ...(insumoId ? { ingredients: { some: { insumoId } } } : {}),
    },
    include: {
      productMaster: { select: { id: true, nombre: true, rubroNombre: true } },
      ingredients: { include: { insumo: { select: { id: true, unidadBase: true } } } },
    },
  })

  const productos = recetas
    .map((r) => {
      const ventas = ventasByProducto.get(r.productMasterId)
      const unidadesVendidas = ventas?.unidades ?? 0
      const importeVendido = ventas?.importe ?? 0
      // Precio bruto (con IVA, lo que figura en el menú) y neto (sin IVA, comparable al costo).
      const precioVentaBruto = unidadesVendidas > 0 ? importeVendido / unidadesVendidas : null
      const precioVenta = precioVentaBruto != null ? precioVentaBruto * netFactor : null

      let costoReceta = 0
      let costoIncompleto = false
      for (const ing of r.ingredients) {
        const costoUnit = ing.insumoId
          ? (costoUnitarioByInsumo.get(ing.insumoId) ?? lastCostByInsumo.get(ing.insumoId))
          : undefined
        if (!ing.insumoId || ing.insumo == null || costoUnit == null) {
          costoIncompleto = true
          continue
        }
        let cantBase: number
        try {
          cantBase = convert(Number(ing.cantidad), ing.unidad, ing.insumo.unidadBase)
        } catch {
          costoIncompleto = true
          continue
        }
        const conMerma = cantBase * (1 + Number(ing.mermaPct) / 100)
        costoReceta += conMerma * costoUnit
      }

      const foodCostPct = precioVenta && precioVenta > 0 ? (costoReceta / precioVenta) * 100 : null
      const margenUnitario = precioVenta != null ? precioVenta - costoReceta : null
      const margenTotal = margenUnitario != null ? margenUnitario * unidadesVendidas : null

      return {
        productMasterId: r.productMaster.id,
        nombre: r.productMaster.nombre,
        rubroNombre: r.productMaster.rubroNombre,
        unidadesVendidas,
        precioVenta,
        precioVentaBruto,
        costoReceta,
        foodCostPct,
        margenUnitario,
        margenTotal,
        costoIncompleto,
      }
    })
    .sort((a, b) => (b.margenTotal ?? -Infinity) - (a.margenTotal ?? -Infinity))

  return NextResponse.json({ periodo: { from, to, sucursal }, ivaVentaPct: ivaVentaRate * 100, productos })
}
