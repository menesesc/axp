import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { NextResponse, NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getAnthropicClient, AI_MODEL } from '@/lib/ai/anthropic-client'

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
    const proveedorId = searchParams.get('proveedorId')

    const proveedorFilter = proveedorId
      ? Prisma.sql`AND "proveedorId" = ${proveedorId}::uuid`
      : Prisma.empty
    const proveedorFilterD = proveedorId
      ? Prisma.sql`AND d."proveedorId" = ${proveedorId}::uuid`
      : Prisma.empty

    // Obtener datos históricos para análisis
    const [gastoMensual, variacionesPrecios, topProveedores, resumenGeneral] = await Promise.all([
      // Gasto mensual últimos 12 meses
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
          ${proveedorFilter}
        GROUP BY TO_CHAR("fechaEmision", 'YYYY-MM')
        ORDER BY mes
      `,

      // Variaciones de precios significativas
      prisma.$queryRaw<Array<{
        descripcion: string
        proveedor: string
        precio_anterior: number
        precio_actual: number
        variacion_pct: number
      }>>`
        WITH precios AS (
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
            ${proveedorFilterD}
        )
        SELECT
          a.descripcion,
          a.proveedor,
          b."precioUnitario"::float as precio_anterior,
          a."precioUnitario"::float as precio_actual,
          ROUND(((a."precioUnitario" - b."precioUnitario") / NULLIF(b."precioUnitario", 0) * 100)::numeric, 1)::float as variacion_pct
        FROM precios a
        JOIN precios b ON a.descripcion = b.descripcion AND a.proveedor = b.proveedor
        WHERE a.rn = 1 AND b.rn = 2 AND b."precioUnitario" > 0
        ORDER BY ABS((a."precioUnitario" - b."precioUnitario") / NULLIF(b."precioUnitario", 0)) DESC
        LIMIT 15
      `,

      // Top 5 proveedores por gasto
      prisma.$queryRaw<Array<{
        proveedor: string
        total_6m: number
        total_3m: number
      }>>`
        SELECT
          p."razonSocial" as proveedor,
          COALESCE(SUM(CASE WHEN d."fechaEmision" >= NOW() - INTERVAL '6 months' THEN d.total ELSE 0 END), 0)::float as total_6m,
          COALESCE(SUM(CASE WHEN d."fechaEmision" >= NOW() - INTERVAL '3 months' THEN d.total ELSE 0 END), 0)::float as total_3m
        FROM documentos d
        JOIN proveedores p ON d."proveedorId" = p.id
        WHERE d."clienteId" = ${clienteId}::uuid
          AND d."fechaEmision" >= NOW() - INTERVAL '6 months'
          AND d.tipo = 'FACTURA'
          AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorFilterD}
        GROUP BY p."razonSocial"
        ORDER BY total_6m DESC
        LIMIT 5
      `,

      // Resumen general
      prisma.$queryRaw<[{
        total_12m: number
        total_6m: number
        total_3m: number
        total_1m: number
        proveedores_activos: number
      }]>`
        SELECT
          COALESCE(SUM(CASE WHEN "fechaEmision" >= NOW() - INTERVAL '12 months' THEN total ELSE 0 END), 0)::float as total_12m,
          COALESCE(SUM(CASE WHEN "fechaEmision" >= NOW() - INTERVAL '6 months' THEN total ELSE 0 END), 0)::float as total_6m,
          COALESCE(SUM(CASE WHEN "fechaEmision" >= NOW() - INTERVAL '3 months' THEN total ELSE 0 END), 0)::float as total_3m,
          COALESCE(SUM(CASE WHEN "fechaEmision" >= NOW() - INTERVAL '1 month' THEN total ELSE 0 END), 0)::float as total_1m,
          COUNT(DISTINCT "proveedorId")::int as proveedores_activos
        FROM documentos
        WHERE "clienteId" = ${clienteId}::uuid
          AND "fechaEmision" >= NOW() - INTERVAL '12 months'
          AND tipo = 'FACTURA'
          AND "estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
          ${proveedorFilter}
      `,
    ])

    // Proyección simple basada en tendencia
    const meses = gastoMensual.map(g => g.total)
    const proyeccion = calcularProyeccion(meses, 3)

    // Datos base para respuesta (siempre incluidos)
    const responseData: any = {
      gastoMensual,
      proyeccion,
      resumen: resumenGeneral[0],
      variacionesPrecios: variacionesPrecios.filter(v => v.variacion_pct !== null),
      topProveedores,
      analisisIA: null,
    }

    // Generar análisis con IA
    try {
      const client = getAnthropicClient()

      const prompt = `Eres un analista financiero senior. Analiza estos datos de compras de una empresa argentina y genera un informe ejecutivo breve.

DATOS:
- Gasto mensual (últimos 12 meses): ${JSON.stringify(gastoMensual)}
- Resumen: Último mes $${resumenGeneral[0]?.total_1m?.toLocaleString()}, Últimos 3 meses $${resumenGeneral[0]?.total_3m?.toLocaleString()}, Últimos 6 meses $${resumenGeneral[0]?.total_6m?.toLocaleString()}, Año $${resumenGeneral[0]?.total_12m?.toLocaleString()}
- Top proveedores (6m vs 3m): ${JSON.stringify(topProveedores)}
- Variaciones de precios significativas: ${JSON.stringify(variacionesPrecios.slice(0, 10))}
- Proyección próximos 3 meses (cálculo lineal): ${JSON.stringify(proyeccion)}

Responde SOLO con un JSON válido (sin markdown ni backticks) con esta estructura:
{
  "resumenEjecutivo": "2-3 oraciones resumen de la situación financiera",
  "tendencia": "CRECIENTE" | "ESTABLE" | "DECRECIENTE",
  "alertas": ["lista de 2-4 alertas o puntos de atención importantes"],
  "recomendaciones": ["lista de 2-4 recomendaciones accionables"],
  "proyeccionTexto": "1-2 oraciones sobre qué esperar los próximos meses"
}`

      const response = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      // Parse JSON, handle potential markdown wrapping
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (match?.[1]) {
          parsed = JSON.parse(match[1].trim())
        }
      }

      if (parsed) {
        responseData.analisisIA = parsed
      }
    } catch (aiError) {
      console.error('Error en análisis IA:', aiError)
      // Continúa sin análisis IA
    }

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Error fetching proyecciones:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function calcularProyeccion(meses: number[], cantidadMeses: number): Array<{ mes: string; total: number }> {
  if (meses.length < 3) return []

  // Regresión lineal simple
  const n = meses.length
  const xs = meses.map((_, i) => i)
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = meses.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((s, x, i) => s + x * meses[i]!, 0)
  const sumX2 = xs.reduce((s, x) => s + x * x, 0)

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  const now = new Date()
  const result: Array<{ mes: string; total: number }> = []

  for (let i = 1; i <= cantidadMeses; i++) {
    const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const mes = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`
    const total = Math.max(0, Math.round(intercept + slope * (n + i - 1)))
    result.push({ mes, total })
  }

  return result
}
