import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * "Ajustar al total": la transferencia de un borrador pasa a valer lo que
 * suman sus documentos.
 *
 * Pasa cuando se sacan facturas de la orden y la transferencia queda con el
 * monto anterior: el borrador se guarda igual, pero en "A transferir" no se
 * puede elegir. Sólo se ajusta lo que no tiene duda: un borrador con una única
 * transferencia. Con varias formas de pago no hay forma de saber cuál tocar.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS, 'edit')
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const { id } = await params
  const pago = await prisma.pagos.findFirst({
    where: { id, clienteId: user.clienteId },
    include: { pago_metodos: { select: { id: true, tipo: true } } },
  })
  if (!pago) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  if (pago.estado !== 'BORRADOR') {
    return NextResponse.json({ error: 'Sólo se ajustan órdenes en borrador' }, { status: 400 })
  }
  const [metodo, ...otros] = pago.pago_metodos
  if (!metodo || otros.length > 0 || metodo.tipo !== 'TRANSFERENCIA') {
    return NextResponse.json(
      { error: 'Sólo se ajusta una orden con una única transferencia. Editala para corregir las formas de pago.' },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.pago_metodos.update({ where: { id: metodo.id }, data: { monto: pago.montoTotal } }),
    prisma.pagos.update({ where: { id }, data: { updatedAt: new Date() } }),
  ])

  return NextResponse.json({ ok: true, monto: Number(pago.montoTotal) })
}
