import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/resend'
import { renderTemplate } from '@/lib/email/templates/render'
import { generatePaymentOrderPdf, formatNumeroOrden, formatCurrency, formatDate } from '@/lib/pdf/generate-payment-order-pdf'
import { z } from 'zod'

const shareSchema = z.object({
  to: z.string().email(),
  message: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error
    if (!user?.clienteId) {
      return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { to, message } = shareSchema.parse(body)

    const cliente = await prisma.clientes.findUnique({
      where: { id: user.clienteId },
      select: { razonSocial: true, cuit: true },
    })

    if (!cliente?.cuit) {
      return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
    }

    const pago = await prisma.pagos.findUnique({
      where: { id },
      include: {
        proveedores: { select: { razonSocial: true, cuit: true } },
        pago_documentos: {
          include: {
            documentos: {
              select: { tipo: true, letra: true, numeroCompleto: true, fechaEmision: true, total: true },
            },
          },
        },
        pago_metodos: true,
      },
    })

    if (!pago || pago.clienteId !== user.clienteId) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    }

    // Render template
    const { subject, html } = await renderTemplate(user.clienteId, 'ORDEN_PAGO', {
      empresa: cliente.razonSocial,
      empresaCuit: cliente.cuit,
      proveedor: pago.proveedores.razonSocial,
      monto: formatCurrency(Number(pago.montoTotal)),
      numero: formatNumeroOrden(pago.numero),
      fecha: formatDate(pago.fecha),
      nota: pago.nota || undefined,
      mensaje: message || undefined,
    })

    // Generate PDF
    const pdfBytes = await generatePaymentOrderPdf(pago, {
      clienteRazonSocial: cliente.razonSocial,
      clienteCuit: cliente.cuit,
    })

    // Send
    const result = await sendEmail({
      to,
      subject,
      html,
      attachments: [{
        filename: `orden-pago-${formatNumeroOrden(pago.numero)}.pdf`,
        content: Buffer.from(pdfBytes),
      }],
    })

    if (result.error) {
      return NextResponse.json({ error: 'Error al enviar email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }
    console.error('Error sharing pago via email:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
