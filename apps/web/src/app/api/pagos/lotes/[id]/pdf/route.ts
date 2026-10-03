import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { cargarLote, pdfFinalLote } from '@/lib/pagos/lotes'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** PDF único con todas las órdenes del lote, cada una con su comprobante anexado. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }
  const { id } = await params

  const cliente = await prisma.clientes.findUnique({
    where: { id: user.clienteId },
    select: { cuit: true, razonSocial: true },
  })
  if (!cliente?.cuit) return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })

  const lote = await cargarLote(user.clienteId, id)
  if (!lote) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })

  const bytes = await pdfFinalLote(lote, { razonSocial: cliente.razonSocial, cuit: cliente.cuit })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Lote${lote.numero}-ordenes-de-pago.pdf"`,
    },
  })
}
