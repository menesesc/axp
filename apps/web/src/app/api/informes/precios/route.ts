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
    const q = searchParams.get('q')

    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Parámetros desde y hasta son requeridos' }, { status: 400 })
    }

    const fechaDesde = new Date(`${desde}T00:00:00-03:00`)
    const fechaHasta = new Date(`${hasta}T23:59:59-03:00`)

    const proveedorFilter = proveedorId
      ? Prisma.sql`AND d."proveedorId" = ${proveedorId}::uuid`
      : Prisma.empty
    const searchFilter = q
      ? Prisma.sql`AND di.descripcion ILIKE ${'%' + q + '%'}`
      : Prisma.empty

    // Alertas de variación de precios
    const alertas = await prisma.$queryRaw<Array<{
      descripcion: string
      proveedor_id: string
      proveedor: string
      precio_anterior: number
      precio_actual: number
      variacion_pct: number
      fecha_anterior: Date
      fecha_actual: Date
      cantidad_compras: number
    }>>`
      WITH precios AS (
        SELECT
          di.descripcion,
          d."proveedorId" as proveedor_id,
          p."razonSocial" as proveedor,
          di."precioUnitario",
          d."fechaEmision",
          ROW_NUMBER() OVER (PARTITION BY di.descripcion, d."proveedorId" ORDER BY d."fechaEmision" DESC) as rn,
          COUNT(*) OVER (PARTITION BY di.descripcion, d."proveedorId") as cantidad_compras
        FROM documento_items di
        JOIN documentos d ON di."documentoId" = d.id
        JOIN proveedores p ON d."proveedorId" = p.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND di."precioUnitario" IS NOT NULL
          AND di."precioUnitario" > 0
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorFilter}
          ${searchFilter}
      ),
      variaciones AS (
        SELECT
          a.descripcion,
          a.proveedor_id,
          a.proveedor,
          b."precioUnitario"::float as precio_anterior,
          a."precioUnitario"::float as precio_actual,
          ROUND(((a."precioUnitario" - b."precioUnitario") / NULLIF(b."precioUnitario", 0) * 100)::numeric, 1)::float as variacion_pct,
          b."fechaEmision" as fecha_anterior,
          a."fechaEmision" as fecha_actual,
          a.cantidad_compras::int
        FROM precios a
        JOIN precios b ON a.descripcion = b.descripcion AND a.proveedor_id = b.proveedor_id
        WHERE a.rn = 1 AND b.rn = 2
          AND b."precioUnitario" > 0
      )
      SELECT * FROM variaciones
      WHERE variacion_pct IS NOT NULL
      ORDER BY ABS(variacion_pct) DESC
      LIMIT 50
    `

    // Historial de precios para items con mayor variación (top 10)
    const topItems = alertas.slice(0, 10)
    const historiales: Record<string, Array<{ fecha: string; precio: number; proveedor: string }>> = {}

    for (const item of topItems) {
      const historial = await prisma.$queryRaw<Array<{
        fecha: string
        precio: number
        proveedor: string
      }>>`
        SELECT
          TO_CHAR(d."fechaEmision", 'YYYY-MM-DD') as fecha,
          di."precioUnitario"::float as precio,
          p."razonSocial" as proveedor
        FROM documento_items di
        JOIN documentos d ON di."documentoId" = d.id
        JOIN proveedores p ON d."proveedorId" = p.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND di.descripcion = ${item.descripcion}
          AND di."precioUnitario" IS NOT NULL
          AND di."precioUnitario" > 0
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
        ORDER BY d."fechaEmision" ASC
        LIMIT 20
      `
      historiales[item.descripcion] = historial
    }

    // Comparativo entre proveedores
    const comparativo = await prisma.$queryRaw<Array<{
      descripcion: string
      proveedor: string
      precio_promedio: number
      compras: number
      ultimo_precio: number
    }>>`
      WITH items_multi AS (
        SELECT di.descripcion
        FROM documento_items di
        JOIN documentos d ON di."documentoId" = d.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND di."precioUnitario" IS NOT NULL
          AND di."precioUnitario" > 0
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          AND d."fechaEmision" >= ${fechaDesde}
          AND d."fechaEmision" <= ${fechaHasta}
          ${searchFilter}
        GROUP BY di.descripcion
        HAVING COUNT(DISTINCT d."proveedorId") > 1
        LIMIT 20
      )
      SELECT
        di.descripcion,
        p."razonSocial" as proveedor,
        AVG(di."precioUnitario")::float as precio_promedio,
        COUNT(*)::int as compras,
        (ARRAY_AGG(di."precioUnitario"::float ORDER BY d."fechaEmision" DESC))[1] as ultimo_precio
      FROM documento_items di
      JOIN documentos d ON di."documentoId" = d.id
      JOIN proveedores p ON d."proveedorId" = p.id
      WHERE d."clienteId" = ${clienteId}::uuid
        AND di.descripcion IN (SELECT descripcion FROM items_multi)
        AND di."precioUnitario" IS NOT NULL
        AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
      GROUP BY di.descripcion, p."razonSocial"
      ORDER BY di.descripcion, precio_promedio ASC
    `

    // Separar bajas de precio
    const bajas = alertas.filter(a => a.variacion_pct <= -30)
    const aumentos = alertas.filter(a => a.variacion_pct > 0)

    return NextResponse.json({
      aumentos,
      bajas,
      historiales,
      comparativo,
    })
  } catch (error) {
    console.error('Error fetching precios:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
