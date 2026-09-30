import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Asigna el depósito de salida de productos vendidos: todos los de un rubro o
 * una lista puntual. depositoId null = sin asignar (consume del central).
 * Body: { depositoId: string | null, rubro?: string | null, productIds?: string[] }
 * (rubro null con `sinRubro: true` apunta a los productos sin rubro)
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const depositoId = body?.depositoId ? String(body.depositoId) : null
  if (depositoId && !(await prisma.depositos.findFirst({ where: { id: depositoId, clienteId } }))) {
    return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
  }

  let where
  if (Array.isArray(body?.productIds) && body.productIds.length > 0) {
    where = { clienteId, id: { in: body.productIds.map(String) } }
  } else if (typeof body?.rubro === 'string') {
    where = { clienteId, rubroNombre: body.rubro }
  } else if (body?.sinRubro === true) {
    where = { clienteId, rubroNombre: null }
  } else {
    return NextResponse.json({ error: 'Indicá un rubro o productos' }, { status: 400 })
  }

  const r = await prisma.sales_product_master.updateMany({ where, data: { depositoId } })
  return NextResponse.json({ actualizados: r.count })
}
