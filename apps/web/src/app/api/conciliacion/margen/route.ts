import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'
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
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const def = defaultRange()
  const from = sp.get('from') || def.from
  const to = sp.get('to') || def.to
  const sucursal = sp.get('sucursal') || null
  const estadosFinal = [...ESTADOS_COMPRA]

  // Costo unitario por insumo (en $/unidadBase) a partir de las compras del período.
  const compradoRows = await prisma.$queryRawUnsafe<Array<{
    insumo_id: string
    qty_base: number
    costo_total: number | null
  }>>(`
    SELECT a."insumoId" AS insumo_id,
           SUM(di.cantidad * a."factorBase")::numeric AS qty_base,
           SUM(di.subtotal)::numeric AS costo_total
    FROM documento_items di
    JOIN documentos d ON d.id = di."documentoId"
    JOIN insumo_alias a ON di.descripcion ILIKE '%' || a.patron || '%'
    JOIN insumos i ON i.id = a."insumoId"
    WHERE d."clienteId" = $1::uuid AND i."clienteId" = $1::uuid
      AND d."fechaEmision" >= $2::date AND d."fechaEmision" <= $3::date
      AND d."estadoRevision"::text = ANY($4::text[])
    GROUP BY a."insumoId"
  `, clienteId, from, to, estadosFinal)
  const costoUnitarioByInsumo = new Map<string, number>()
  for (const r of compradoRows) {
    const qty = Number(r.qty_base) || 0
    if (qty > 0 && r.costo_total != null) costoUnitarioByInsumo.set(r.insumo_id, Number(r.costo_total) / qty)
  }

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

  // Recetas activas con ingredientes.
  const recetas = await prisma.sales_recipes.findMany({
    where: { activa: true, productMaster: { clienteId: clienteId! } },
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
      const precioVenta = unidadesVendidas > 0 ? importeVendido / unidadesVendidas : null

      let costoReceta = 0
      let costoIncompleto = false
      for (const ing of r.ingredients) {
        const costoUnit = ing.insumoId ? costoUnitarioByInsumo.get(ing.insumoId) : undefined
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
        costoReceta,
        foodCostPct,
        margenUnitario,
        margenTotal,
        costoIncompleto,
      }
    })
    .sort((a, b) => (b.margenTotal ?? -Infinity) - (a.margenTotal ?? -Infinity))

  return NextResponse.json({ periodo: { from, to, sucursal }, productos })
}
