import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { sugerirInsumos } from '@/lib/recetas/insumos'

export const dynamic = 'force-dynamic'

/** Catálogo de insumos, para el selector del editor. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error

  /*
   * Los de venta directa quedan afuera: son productos de la carta que se
   * venden tal cual (un vino, un agua), nunca un ingrediente de una receta.
   * Con 133 de 143 en esa condición, el desplegable era inusable.
   *
   * La categoría viaja para poder agrupar y filtrar en el selector.
   */
  const insumos = await prisma.$queryRaw<Array<{
    id: string; nombre: string; unidadBase: string; categoria: string | null; mermaPct: number
  }>>`
    SELECT id, nombre, "unidadBase", COALESCE(categoria, subcategoria) AS categoria,
           "mermaPct"::float8 AS "mermaPct"
      FROM insumos
     WHERE "clienteId" = ${clienteId}::uuid AND activo = true AND "productMasterId" IS NULL
     ORDER BY COALESCE(categoria, 'zzz'), nombre
  `
  return NextResponse.json({ insumos })
}

/**
 * Sugiere un insumo para cada ingrediente.
 *
 * `conIA: false` usa solo la comparación local, que es instantánea y gratis.
 * Con IA se resuelven las que la local no pudo, que es donde está el trabajo
 * aburrido. Nada se guarda acá: son sugerencias y el usuario confirma.
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error

  const body = await request.json().catch(() => null)
  const nombres: string[] = Array.isArray(body?.nombres)
    ? body.nombres.filter((n: unknown) => typeof n === 'string' && n.trim()).slice(0, 80)
    : []
  if (nombres.length === 0) return NextResponse.json({ sugerencias: [] })

  const sugerencias = await sugerirInsumos(clienteId!, nombres, body?.conIA !== false)
  return NextResponse.json({ sugerencias })
}
