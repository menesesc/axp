import { prisma } from '@/lib/prisma'
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

    const [gastoMensual, ranking, rankingAnterior, topItems] = await Promise.all([
      // Gasto mensual por proveedor (últimos 12 meses)
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
          ${proveedorId ? prisma.$queryRaw`AND d."proveedorId" = ${proveedorId}::uuid` : prisma.$queryRaw``}
        GROUP BY mes, p."razonSocial"
        ORDER BY mes, total DESC
      `,

      // Ranking de proveedores período actual
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
          COUNT(DISTINCT d.id)::int as cantidad,
          COUNT(di.id)::int as total_items
        FROM documentos d
        JOIN proveedores p ON d."proveedorId" = p.id
        LEFT JOIN documento_items di ON di."documentoId" = d.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaEmision" >= ${fechaDesde}
          AND d."fechaEmision" <= ${fechaHasta}
          AND d.tipo = 'FACTURA'
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorId ? prisma.$queryRaw`AND d."proveedorId" = ${proveedorId}::uuid` : prisma.$queryRaw``}
        GROUP BY d."proveedorId", p."razonSocial"
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
          ${proveedorId ? prisma.$queryRaw`AND d."proveedorId" = ${proveedorId}::uuid` : prisma.$queryRaw``}
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
          ${proveedorId ? prisma.$queryRaw`AND d."proveedorId" = ${proveedorId}::uuid` : prisma.$queryRaw``}
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

    // Preparar datos para gráfico de barras apiladas
    const mesesSet = [...new Set(gastoMensual.map(g => g.mes))].sort()
    const proveedoresSet = [...new Set(gastoMensual.map(g => g.proveedor))].slice(0, 6)
    const gastoMensualChart = mesesSet.map(mes => {
      const entry: any = { mes }
      for (const prov of proveedoresSet) {
        const found = gastoMensual.find(g => g.mes === mes && g.proveedor === prov)
        entry[prov] = found?.total || 0
      }
      return entry
    })

    return NextResponse.json({
      gastoMensualChart,
      proveedoresChart: proveedoresSet,
      ranking: rankingConVariacion,
      topItems,
      totalGeneral,
    })
  } catch (error) {
    console.error('Error fetching compras:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
