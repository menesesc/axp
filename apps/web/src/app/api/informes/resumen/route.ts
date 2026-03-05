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

    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Parámetros desde y hasta son requeridos' }, { status: 400 })
    }

    const fechaDesde = new Date(`${desde}T00:00:00-03:00`)
    const fechaHasta = new Date(`${hasta}T23:59:59-03:00`)

    // Período anterior (misma duración para comparar)
    const duracionMs = fechaHasta.getTime() - fechaDesde.getTime()
    const fechaDesdeAnterior = new Date(fechaDesde.getTime() - duracionMs)
    const fechaHastaAnterior = new Date(fechaDesde.getTime() - 1)

    const [
      kpis,
      kpisAnterior,
      facturacionMensual,
      topProveedores,
      topProveedoresAnterior,
      documentosVencidos,
      alertasPrecios,
    ] = await Promise.all([
      // KPIs período actual
      prisma.$queryRaw<[{
        total_facturado: number
        total_pagado: number
        cantidad_documentos: number
        cantidad_facturas: number
        cantidad_nc: number
      }]>`
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'FACTURA' THEN total ELSE 0 END), 0)::float as total_facturado,
          COALESCE(SUM(CASE WHEN "estadoRevision" = 'PAGADO' THEN total ELSE 0 END), 0)::float as total_pagado,
          COUNT(*)::int as cantidad_documentos,
          COUNT(CASE WHEN tipo = 'FACTURA' THEN 1 END)::int as cantidad_facturas,
          COUNT(CASE WHEN tipo = 'NOTA_CREDITO' THEN 1 END)::int as cantidad_nc
        FROM documentos
        WHERE "clienteId" = ${clienteId}::uuid
          AND "fechaEmision" >= ${fechaDesde}
          AND "fechaEmision" <= ${fechaHasta}
          AND "estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
      `,

      // KPIs período anterior (para comparación)
      prisma.$queryRaw<[{
        total_facturado: number
        total_pagado: number
        cantidad_documentos: number
      }]>`
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'FACTURA' THEN total ELSE 0 END), 0)::float as total_facturado,
          COALESCE(SUM(CASE WHEN "estadoRevision" = 'PAGADO' THEN total ELSE 0 END), 0)::float as total_pagado,
          COUNT(*)::int as cantidad_documentos
        FROM documentos
        WHERE "clienteId" = ${clienteId}::uuid
          AND "fechaEmision" >= ${fechaDesdeAnterior}
          AND "fechaEmision" <= ${fechaHastaAnterior}
          AND "estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
      `,

      // Facturación mensual (últimos 12 meses)
      prisma.$queryRaw<Array<{
        mes: string
        total: number
        cantidad: number
      }>>`
        SELECT
          TO_CHAR("fechaEmision", 'YYYY-MM') as mes,
          COALESCE(SUM(total), 0)::float as total,
          COUNT(*)::int as cantidad
        FROM documentos
        WHERE "clienteId" = ${clienteId}::uuid
          AND "fechaEmision" >= NOW() - INTERVAL '12 months'
          AND tipo = 'FACTURA'
          AND "estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
        GROUP BY TO_CHAR("fechaEmision", 'YYYY-MM')
        ORDER BY mes
      `,

      // Top proveedores en el período
      prisma.$queryRaw<Array<{
        proveedor_id: string
        razon_social: string
        total: number
        cantidad: number
      }>>`
        SELECT
          d."proveedorId" as proveedor_id,
          p."razonSocial" as razon_social,
          COALESCE(SUM(d.total), 0)::float as total,
          COUNT(*)::int as cantidad
        FROM documentos d
        JOIN proveedores p ON d."proveedorId" = p.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaEmision" >= ${fechaDesde}
          AND d."fechaEmision" <= ${fechaHasta}
          AND d.tipo = 'FACTURA'
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
        GROUP BY d."proveedorId", p."razonSocial"
        ORDER BY total DESC
        LIMIT 10
      `,

      // Top proveedores período anterior (para variación)
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
        GROUP BY d."proveedorId"
      `,

      // Documentos vencidos sin pagar
      prisma.$queryRaw<Array<{
        id: string
        tipo: string
        letra: string | null
        numero_completo: string | null
        fecha_vencimiento: Date
        total: number
        proveedor: string
        dias_vencido: number
      }>>`
        SELECT
          d.id,
          d.tipo,
          d.letra,
          d."numeroCompleto" as numero_completo,
          d."fechaVencimiento" as fecha_vencimiento,
          d.total::float,
          p."razonSocial" as proveedor,
          EXTRACT(DAY FROM NOW() - d."fechaVencimiento")::int as dias_vencido
        FROM documentos d
        LEFT JOIN proveedores p ON d."proveedorId" = p.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaVencimiento" < NOW()
          AND d."estadoRevision" IN ('PENDIENTE', 'CONFIRMADO')
          AND d.tipo = 'FACTURA'
        ORDER BY d."fechaVencimiento" ASC
        LIMIT 10
      `,

      // Alertas de precios: items con variación significativa
      prisma.$queryRaw<Array<{
        descripcion: string
        proveedor: string
        precio_anterior: number
        precio_actual: number
        variacion_pct: number
        fecha_anterior: Date
        fecha_actual: Date
      }>>`
        WITH precios_recientes AS (
          SELECT
            di.descripcion,
            p."razonSocial" as proveedor,
            di."precioUnitario",
            d."fechaEmision",
            ROW_NUMBER() OVER (PARTITION BY di.descripcion, d."proveedorId" ORDER BY d."fechaEmision" DESC) as rn
          FROM documento_items di
          JOIN documentos d ON di."documentoId" = d.id
          JOIN proveedores p ON d."proveedorId" = p.id
          WHERE d."clienteId" = ${clienteId}::uuid
            AND di."precioUnitario" IS NOT NULL
            AND di."precioUnitario" > 0
            AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
        ),
        variaciones AS (
          SELECT
            a.descripcion,
            a.proveedor,
            b."precioUnitario"::float as precio_anterior,
            a."precioUnitario"::float as precio_actual,
            ROUND(((a."precioUnitario" - b."precioUnitario") / b."precioUnitario" * 100)::numeric, 1)::float as variacion_pct,
            b."fechaEmision" as fecha_anterior,
            a."fechaEmision" as fecha_actual
          FROM precios_recientes a
          JOIN precios_recientes b ON a.descripcion = b.descripcion AND a.proveedor = b.proveedor
          WHERE a.rn = 1 AND b.rn = 2
            AND b."precioUnitario" > 0
        )
        SELECT * FROM variaciones
        WHERE ABS(variacion_pct) >= 30
        ORDER BY ABS(variacion_pct) DESC
        LIMIT 20
      `,
    ])

    const currentKpis = kpis[0]!
    const previousKpis = kpisAnterior[0]!

    // Calcular saldo pendiente
    const saldoPendiente = currentKpis.total_facturado - currentKpis.total_pagado

    // Calcular variaciones vs período anterior
    const variacionFacturado = previousKpis.total_facturado > 0
      ? Math.round(((currentKpis.total_facturado - previousKpis.total_facturado) / previousKpis.total_facturado) * 100 * 10) / 10
      : 0

    // Agregar variación % a proveedores
    const anteriorMap = new Map(topProveedoresAnterior.map(p => [p.proveedor_id, p.total]))
    const totalGasto = topProveedores.reduce((sum, p) => sum + p.total, 0)
    const proveedoresConVariacion = topProveedores.map(p => {
      const anterior = anteriorMap.get(p.proveedor_id) || 0
      const variacion = anterior > 0
        ? Math.round(((p.total - anterior) / anterior) * 100 * 10) / 10
        : 0
      return {
        ...p,
        porcentaje: totalGasto > 0 ? Math.round((p.total / totalGasto) * 100 * 10) / 10 : 0,
        variacion,
      }
    })

    // Clasificar alertas de precios
    const alertasCriticas = alertasPrecios.filter(a => a.variacion_pct >= 100)
    const alertasWarning = alertasPrecios.filter(a => a.variacion_pct >= 50 && a.variacion_pct < 100)
    const alertasInfo = alertasPrecios.filter(a => a.variacion_pct >= 30 && a.variacion_pct < 50)

    return NextResponse.json({
      kpis: {
        totalFacturado: currentKpis.total_facturado,
        totalPagado: currentKpis.total_pagado,
        saldoPendiente,
        cantidadDocumentos: currentKpis.cantidad_documentos,
        cantidadFacturas: currentKpis.cantidad_facturas,
        cantidadNC: currentKpis.cantidad_nc,
        variacionFacturado,
      },
      facturacionMensual,
      proveedores: proveedoresConVariacion,
      alertas: {
        documentosVencidos,
        preciosCriticos: alertasCriticas,
        preciosWarning: alertasWarning,
        preciosInfo: alertasInfo,
      },
    })
  } catch (error) {
    console.error('Error fetching resumen:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
