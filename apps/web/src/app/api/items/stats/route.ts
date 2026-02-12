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
      })),
      monthlyTrend: monthlyTrendRaw.map(row => ({
        mes: row.mes,
        totalItems: Number(row.total_items),
        totalSubtotal: row.total_subtotal ? Number(row.total_subtotal) : 0,
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
