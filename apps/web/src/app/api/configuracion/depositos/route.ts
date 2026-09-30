import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { getDepositos } from '@/lib/stock/depositos'

export const dynamic = 'force-dynamic'

/**
 * Depósitos del cliente + productos vendidos con su depósito de salida,
 * agrupados por rubro para asignar en bloque.
 */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const [depositos, productos] = await Promise.all([
    getDepositos(clienteId),
    prisma.$queryRawUnsafe<Array<{
      id: string
      nombre: string
      rubro: string | null
      deposito_id: string | null
      unidades: number | null
      con_receta: boolean
    }>>(
      `SELECT pm.id, pm.nombre, pm."rubroNombre" AS rubro, pm."depositoId" AS deposito_id,
              (SELECT SUM(ci.unidades) FROM sales_closure_items ci
                 JOIN sales_closures c ON c.id = ci."closureId"
                WHERE ci."productMasterId" = pm.id AND c.fecha >= CURRENT_DATE - 60)::float8 AS unidades,
              EXISTS (SELECT 1 FROM sales_recipes r WHERE r."productMasterId" = pm.id AND r.activa) AS con_receta
         FROM sales_product_master pm
        WHERE pm."clienteId" = $1::uuid AND pm.activo
        ORDER BY pm."rubroNombre" NULLS LAST, pm.nombre`,
      clienteId
    ),
  ])

  return NextResponse.json({
    depositos,
    productos: productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      rubro: p.rubro,
      depositoId: p.deposito_id,
      unidades: Number(p.unidades ?? 0),
      conReceta: p.con_receta,
    })),
  })
}

/** Crea un depósito. Body: { nombre } */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const nombre = String(body?.nombre || '').trim().slice(0, 60)
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  const max = await prisma.depositos.aggregate({ where: { clienteId }, _max: { orden: true } })
  try {
    const deposito = await prisma.depositos.create({ data: { clienteId, nombre, orden: (max._max.orden ?? 0) + 10 } })
    return NextResponse.json({ deposito }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Ya existe un depósito con ese nombre' }, { status: 409 })
    throw e
  }
}
