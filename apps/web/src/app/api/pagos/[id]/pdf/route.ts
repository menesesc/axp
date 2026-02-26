import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generatePaymentOrderPdf, formatNumeroOrden } from '@/lib/pdf/generate-payment-order-pdf'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    if (!user?.clienteId) {
      return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
    }

    const { id } = await params
    const isView = request.nextUrl.searchParams.get('view') === 'true'

    const cliente = await prisma.clientes.findUnique({
      where: { id: user.clienteId },
      select: { cuit: true, razonSocial: true },
    })

    if (!cliente?.cuit) {
      return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
    }

    const pago = await prisma.pagos.findUnique({
      where: { id },
      include: {
        proveedores: {
          select: { razonSocial: true, cuit: true },
        },
        pago_documentos: {
          include: {
            documentos: {
              select: {
                tipo: true,
                letra: true,
                numeroCompleto: true,
                fechaEmision: true,
                total: true,
              },
            },
          },
        },
        pago_metodos: true,
      },
    })

    if (!pago || pago.clienteId !== user.clienteId) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    const pdfBytes = await generatePaymentOrderPdf(pago, {
      clienteRazonSocial: cliente.razonSocial,
      clienteCuit: cliente.cuit,
    })

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': isView
          ? `inline; filename="orden-pago-${formatNumeroOrden(pago.numero)}.pdf"`
          : `attachment; filename="orden-pago-${formatNumeroOrden(pago.numero)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Error generating payment PDF:', error)
    return NextResponse.json(
      { error: 'Error al generar PDF' },
      { status: 500 }
    )
  }
}
