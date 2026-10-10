import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Productos de venta para elegir en la venta directa.
 *
 * Se marcan los que ya están tomados por otro insumo en vez de esconderlos:
 * si alguien busca "ALAMOS MALBEC" y no aparece, lo primero que piensa es
 * que falta cargarlo, y en realidad ya estaba vinculado en otro lado.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_INSUMOS, 'edit')
  if (error) return error

  const q = (request.nextUrl.searchParams.get('q') || '').trim()

  const productos = await prisma.$queryRaw<Array<{
    id: string
    nombre: string
    codigo: string
    rubro: string | null
    conReceta: boolean
    tomadoPor: string | null
  }>>`
    SELECT pm.id, pm.nombre, pm."codigoMaxirest" AS codigo, pm."rubroNombre" AS rubro,
           EXISTS (SELECT 1 FROM sales_recipes r WHERE r."productMasterId" = pm.id AND r.activa) AS "conReceta",
           (SELECT i.nombre FROM insumos i WHERE i."productMasterId" = pm.id) AS "tomadoPor"
      FROM sales_product_master pm
     WHERE pm."clienteId" = ${clienteId}::uuid
       AND pm.activo = true
       AND (${q} = '' OR pm.nombre ILIKE ${'%' + q + '%'} OR pm."codigoMaxirest" ILIKE ${'%' + q + '%'})
     ORDER BY pm.nombre
     LIMIT 300
  `

  return NextResponse.json({ productos })
}
