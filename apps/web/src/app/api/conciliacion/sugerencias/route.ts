import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Sugiere descripciones de líneas de factura (documento_items) para agrupar como
 * alias de un insumo (matching asistido). Agrupa descripciones distintas que
 * matchean ?q= por ILIKE, con apariciones/cantidad/subtotal/unidad más común,
 * y excluye las descripciones ya cubiertas por algún alias existente del cliente
 * (para no mapear la misma línea a dos insumos).
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const limit = Math.min(parseInt(sp.get('limit') || '50'), 100)
  if (!q) return NextResponse.json({ sugerencias: [] })

  // Patrones de alias ya existentes en el cliente, para excluir lo ya mapeado.
  const aliases = await prisma.insumo_alias.findMany({
    where: { insumo: { clienteId: clienteId! } },
    select: { patron: true },
  })
  const aliasLike = aliases.map((a) => `%${a.patron}%`)

  const params: any[] = [clienteId, `%${q}%`]
  let exclude = ''
  if (aliasLike.length > 0) {
    exclude = ` AND NOT (di.descripcion ILIKE ANY($3::text[]))`
    params.push(aliasLike)
  }

  const rows = await prisma.$queryRawUnsafe<Array<{
    descripcion: string
    apariciones: number
    cantidad_total: number | null
    subtotal_total: number | null
    unidad_comun: string | null
  }>>(`
    SELECT
      di.descripcion,
      COUNT(*)::int AS apariciones,
      SUM(di.cantidad)::numeric AS cantidad_total,
      SUM(di.subtotal)::numeric AS subtotal_total,
      MODE() WITHIN GROUP (ORDER BY di.unidad) AS unidad_comun
    FROM documento_items di
    JOIN documentos d ON d.id = di."documentoId"
    WHERE d."clienteId" = $1::uuid
      AND d."estadoRevision" = 'CONFIRMADO'
      AND di.descripcion ILIKE $2
      ${exclude}
    GROUP BY di.descripcion
    ORDER BY apariciones DESC, subtotal_total DESC NULLS LAST
    LIMIT ${limit}
  `, ...params)

  return NextResponse.json({
    sugerencias: rows.map((r) => ({
      descripcion: r.descripcion,
      apariciones: Number(r.apariciones),
      cantidadTotal: r.cantidad_total != null ? Number(r.cantidad_total) : 0,
      subtotalTotal: r.subtotal_total != null ? Number(r.subtotal_total) : 0,
      unidadComun: r.unidad_comun,
    })),
  })
}
