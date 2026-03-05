import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { NextResponse, NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const proveedorId = searchParams.get('proveedorId')

    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Parámetros desde y hasta son requeridos' }, { status: 400 })
    }

    const fechaDesde = new Date(`${desde}T00:00:00-03:00`)
    const fechaHasta = new Date(`${hasta}T23:59:59-03:00`)

    // Período anterior para comparación
    const duracionMs = fechaHasta.getTime() - fechaDesde.getTime()
    const fechaDesdeAnterior = new Date(fechaDesde.getTime() - duracionMs)
    const fechaHastaAnterior = new Date(fechaDesde.getTime() - 1)

    const proveedorFilter = proveedorId
      ? Prisma.sql`AND d."proveedorId" = ${proveedorId}::uuid`
      : Prisma.empty

    const [gastoMensual, ranking, rankingAnterior, topItems] = await Promise.all([
      // Gasto mensual por proveedor (sin join a items, totales correctos)
      prisma.$queryRaw<Array<{
        mes: string
        proveedor: string
        total: number
      }>>`
        SELECT
          TO_CHAR(d."fechaEmision", 'YYYY-MM') as mes,
          p."razonSocial" as proveedor,
          COALESCE(SUM(d.total), 0)::float as total
        FROM documentos d
        JOIN proveedores p ON d."proveedorId" = p.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaEmision" >= ${fechaDesde}
          AND d."fechaEmision" <= ${fechaHasta}
          AND d.tipo = 'FACTURA'
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorFilter}
        GROUP BY mes, p."razonSocial"
        ORDER BY mes, total DESC
      `,

      // Ranking de proveedores período actual
      // Total e items se calculan por separado para evitar producto cartesiano
      prisma.$queryRaw<Array<{
        proveedor_id: string
        razon_social: string
        total: number
        cantidad: number
        total_items: number
      }>>`
        SELECT
          d."proveedorId" as proveedor_id,
          p."razonSocial" as razon_social,
          COALESCE(SUM(d.total), 0)::float as total,
          COUNT(d.id)::int as cantidad,
          COALESCE(items.total_items, 0)::int as total_items
        FROM documentos d
        JOIN proveedores p ON d."proveedorId" = p.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int as total_items
          FROM documento_items di
          WHERE di."documentoId" IN (
            SELECT dd.id FROM documentos dd
            WHERE dd."clienteId" = ${clienteId}::uuid
              AND dd."proveedorId" = d."proveedorId"
              AND dd."fechaEmision" >= ${fechaDesde}
              AND dd."fechaEmision" <= ${fechaHasta}
              AND dd.tipo = 'FACTURA'
              AND dd."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          )
        ) items ON true
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaEmision" >= ${fechaDesde}
          AND d."fechaEmision" <= ${fechaHasta}
          AND d.tipo = 'FACTURA'
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorFilter}
        GROUP BY d."proveedorId", p."razonSocial", items.total_items
        ORDER BY total DESC
      `,

      // Ranking período anterior
      prisma.$queryRaw<Array<{
        proveedor_id: string
        total: number
      }>>`
        SELECT
          d."proveedorId" as proveedor_id,
          COALESCE(SUM(d.total), 0)::float as total
        FROM documentos d
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaEmision" >= ${fechaDesdeAnterior}
          AND d."fechaEmision" <= ${fechaHastaAnterior}
          AND d.tipo = 'FACTURA'
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorFilter}
        GROUP BY d."proveedorId"
      `,

      // Top items comprados en el período
      prisma.$queryRaw<Array<{
        descripcion: string
        proveedor: string
        cantidad_total: number
        subtotal_total: number
        compras: number
      }>>`
        SELECT
          di.descripcion,
          p."razonSocial" as proveedor,
          COALESCE(SUM(di.cantidad), 0)::float as cantidad_total,
          COALESCE(SUM(di.subtotal), 0)::float as subtotal_total,
          COUNT(*)::int as compras
        FROM documento_items di
        JOIN documentos d ON di."documentoId" = d.id
        JOIN proveedores p ON d."proveedorId" = p.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaEmision" >= ${fechaDesde}
          AND d."fechaEmision" <= ${fechaHasta}
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorFilter}
        GROUP BY di.descripcion, p."razonSocial"
        ORDER BY subtotal_total DESC
        LIMIT 30
      `,
    ])

    // Agregar variación al ranking
    const anteriorMap = new Map(rankingAnterior.map(r => [r.proveedor_id, r.total]))
    const totalGeneral = ranking.reduce((s, r) => s + r.total, 0)
    const rankingConVariacion = ranking.map(r => {
      const anterior = anteriorMap.get(r.proveedor_id) || 0
      return {
        ...r,
        porcentaje: totalGeneral > 0 ? Math.round((r.total / totalGeneral) * 100 * 10) / 10 : 0,
        variacion: anterior > 0
          ? Math.round(((r.total - anterior) / anterior) * 100 * 10) / 10
          : 0,
        totalAnterior: anterior,
      }
    })

    // Preparar datos para gráfico mensual (total por mes, sin desglose por proveedor)
    const mesesMap = new Map<string, number>()
    for (const g of gastoMensual) {
      mesesMap.set(g.mes, (mesesMap.get(g.mes) || 0) + g.total)
    }
    const gastoMensualChart = [...mesesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => ({ mes, total }))

    return NextResponse.json({
      gastoMensualChart,
      ranking: rankingConVariacion,
      topItems,
      totalGeneral,
    })
  } catch (error) {
    console.error('Error fetching compras:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
