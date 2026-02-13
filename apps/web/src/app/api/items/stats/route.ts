import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q') || ''
    const proveedorId = searchParams.get('proveedorId') || ''
    const fechaDesde = searchParams.get('fechaDesde') || ''
    const fechaHasta = searchParams.get('fechaHasta') || ''

    // Build date filter for raw query
    let dateFilter = ''
    const params: any[] = [clienteId]
    let paramIndex = 2

    if (fechaDesde) {
      dateFilter += ` AND d."fechaEmision" >= $${paramIndex}::date`
      params.push(fechaDesde)
      paramIndex++
    }
    if (fechaHasta) {
      dateFilter += ` AND d."fechaEmision" <= $${paramIndex}::date`
      params.push(fechaHasta)
      paramIndex++
    }
    if (proveedorId) {
      dateFilter += ` AND d."proveedorId" = $${paramIndex}::uuid`
      params.push(proveedorId)
      paramIndex++
    }
    if (q) {
      dateFilter += ` AND di.descripcion ILIKE $${paramIndex}`
      params.push(`%${q}%`)
      paramIndex++
    }

    // Aggregations by provider
    const byProviderRaw = await prisma.$queryRawUnsafe<Array<{
      proveedor_id: string | null
      proveedor: string
      total_items: bigint
      total_cantidad: number | null
      total_subtotal: number | null
    }>>(`
      SELECT
        p.id as proveedor_id,
        COALESCE(p."razonSocial", 'Sin proveedor') as proveedor,
        COUNT(di.id)::bigint as total_items,
        SUM(di.cantidad::numeric) as total_cantidad,
        SUM(di.subtotal::numeric) as total_subtotal
      FROM documento_items di
      JOIN documentos d ON di."documentoId" = d.id
      LEFT JOIN proveedores p ON d."proveedorId" = p.id
      WHERE d."clienteId" = $1::uuid ${dateFilter}
      GROUP BY p.id, p."razonSocial"
      ORDER BY total_subtotal DESC NULLS LAST
      LIMIT 20
    `, ...params)

    // Top items by total value
    const topItemsRaw = await prisma.$queryRawUnsafe<Array<{
      descripcion: string
      total_cantidad: number | null
      total_subtotal: number | null
      proveedores: number
    }>>(`
      SELECT
        di.descripcion,
        SUM(di.cantidad::numeric) as total_cantidad,
        SUM(di.subtotal::numeric) as total_subtotal,
        COUNT(DISTINCT d."proveedorId")::int as proveedores
      FROM documento_items di
      JOIN documentos d ON di."documentoId" = d.id
      WHERE d."clienteId" = $1::uuid ${dateFilter}
      GROUP BY di.descripcion
      ORDER BY total_subtotal DESC NULLS LAST
      LIMIT 15
    `, ...params)

    // Price history for top items (last 10 purchases per item)
    const topDescriptions = topItemsRaw.slice(0, 5).map(i => i.descripcion)
    let priceHistoryRaw: Array<{
      descripcion: string
      fecha: Date
      precio_unitario: number | null
    }> = []

    if (topDescriptions.length > 0) {
      priceHistoryRaw = await prisma.$queryRawUnsafe<Array<{
        descripcion: string
        fecha: Date
        precio_unitario: number | null
      }>>(`
        WITH ranked_prices AS (
          SELECT
            di.descripcion,
            d."fechaEmision" as fecha,
            di."precioUnitario"::numeric as precio_unitario,
            ROW_NUMBER() OVER (PARTITION BY di.descripcion ORDER BY d."fechaEmision" DESC) as rn
          FROM documento_items di
          JOIN documentos d ON di."documentoId" = d.id
          WHERE d."clienteId" = $1::uuid
            AND di.descripcion = ANY($2::text[])
            AND di."precioUnitario" IS NOT NULL
        )
        SELECT descripcion, fecha, precio_unitario
        FROM ranked_prices
        WHERE rn <= 10
        ORDER BY descripcion, fecha ASC
      `, clienteId, topDescriptions)
    }

    // Monthly trend
    const monthlyTrendRaw = await prisma.$queryRawUnsafe<Array<{
      mes: string
      total_items: bigint
      total_subtotal: number | null
    }>>(`
      SELECT
        TO_CHAR(d."fechaEmision", 'YYYY-MM') as mes,
        COUNT(di.id)::bigint as total_items,
        SUM(di.subtotal::numeric) as total_subtotal
      FROM documento_items di
      JOIN documentos d ON di."documentoId" = d.id
      WHERE d."clienteId" = $1::uuid
        AND d."fechaEmision" >= NOW() - INTERVAL '12 months'
        ${dateFilter}
      GROUP BY TO_CHAR(d."fechaEmision", 'YYYY-MM')
      ORDER BY mes ASC
    `, ...params)

    // Items with biggest price variation (comparing first and last price)
    const priceVariationRaw = await prisma.$queryRawUnsafe<Array<{
      descripcion: string
      precio_inicial: number
      precio_final: number
      fecha_inicial: Date
      fecha_final: Date
      variacion_pct: number
      compras: number
    }>>(`
      WITH item_prices AS (
        SELECT
          di.descripcion,
          di."precioUnitario"::numeric as precio,
          d."fechaEmision" as fecha,
          ROW_NUMBER() OVER (PARTITION BY di.descripcion ORDER BY d."fechaEmision" ASC) as rn_asc,
          ROW_NUMBER() OVER (PARTITION BY di.descripcion ORDER BY d."fechaEmision" DESC) as rn_desc,
          COUNT(*) OVER (PARTITION BY di.descripcion) as total_compras
        FROM documento_items di
        JOIN documentos d ON di."documentoId" = d.id
        WHERE d."clienteId" = $1::uuid
          AND di."precioUnitario" IS NOT NULL
          AND di."precioUnitario" > 0
      ),
      first_last AS (
        SELECT
          descripcion,
          MAX(CASE WHEN rn_asc = 1 THEN precio END) as precio_inicial,
          MAX(CASE WHEN rn_desc = 1 THEN precio END) as precio_final,
          MAX(CASE WHEN rn_asc = 1 THEN fecha END) as fecha_inicial,
          MAX(CASE WHEN rn_desc = 1 THEN fecha END) as fecha_final,
          MAX(total_compras) as compras
        FROM item_prices
        GROUP BY descripcion
        HAVING MAX(total_compras) >= 2
      )
      SELECT
        descripcion,
        precio_inicial,
        precio_final,
        fecha_inicial,
        fecha_final,
        ROUND(((precio_final - precio_inicial) / precio_inicial * 100)::numeric, 1) as variacion_pct,
        compras::int
      FROM first_last
      WHERE precio_inicial > 0
        AND precio_final != precio_inicial
      ORDER BY ABS((precio_final - precio_inicial) / precio_inicial) DESC
      LIMIT 10
    `, clienteId)

    // Group price history by item
    const priceHistoryByItem: Record<string, Array<{ fecha: string; precio: number }>> = {}
    for (const row of priceHistoryRaw) {
      const desc = row.descripcion
      if (!priceHistoryByItem[desc]) {
        priceHistoryByItem[desc] = []
      }
      priceHistoryByItem[desc].push({
        fecha: row.fecha?.toISOString().split('T')[0] ?? '',
        precio: row.precio_unitario ? Number(row.precio_unitario) : 0,
      })
    }

    return NextResponse.json({
      byProvider: byProviderRaw.map(row => ({
        proveedorId: row.proveedor_id,
        proveedor: row.proveedor,
        totalItems: Number(row.total_items),
        totalCantidad: row.total_cantidad ? Number(row.total_cantidad) : 0,
        totalSubtotal: row.total_subtotal ? Number(row.total_subtotal) : 0,
      })),
      topItems: topItemsRaw.map(row => ({
        descripcion: row.descripcion,
        totalCantidad: row.total_cantidad ? Number(row.total_cantidad) : 0,
        totalSubtotal: row.total_subtotal ? Number(row.total_subtotal) : 0,
        proveedores: row.proveedores,
        priceHistory: priceHistoryByItem[row.descripcion] || [],
      })),
      monthlyTrend: monthlyTrendRaw.map(row => ({
        mes: row.mes,
        totalItems: Number(row.total_items),
        totalSubtotal: row.total_subtotal ? Number(row.total_subtotal) : 0,
      })),
      priceVariation: priceVariationRaw.map(row => ({
        descripcion: row.descripcion,
        precioInicial: Number(row.precio_inicial),
        precioFinal: Number(row.precio_final),
        variacionPct: Number(row.variacion_pct),
        compras: row.compras,
      })),
    })
  } catch (error) {
    console.error('Error fetching item stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
