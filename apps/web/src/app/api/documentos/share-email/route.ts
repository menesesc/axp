import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/resend'
import { renderTemplate } from '@/lib/email/templates/render'
import { downloadFromR2 } from '@/lib/r2/client'
import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'

const shareSchema = z.object({
  documentoIds: z.array(z.string().uuid()).min(1),
  to: z.string().email(),
  message: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error
    if (!user?.clienteId) {
      return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
    }

    const body = await request.json()
    const { documentoIds, to, message } = shareSchema.parse(body)

    const cliente = await prisma.clientes.findUnique({
      where: { id: user.clienteId },
      select: { razonSocial: true, cuit: true },
    })

    if (!cliente?.cuit) {
      return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
    }

    // Fetch documents
    const documentos = await prisma.documentos.findMany({
      where: {
        id: { in: documentoIds },
        clienteId: user.clienteId,
      },
      select: {
        id: true,
        pdfFinalKey: true,
        pdfRawKey: true,
        tipo: true,
        letra: true,
        numeroCompleto: true,
      },
    })

    if (documentos.length === 0) {
      return NextResponse.json({ error: 'No se encontraron documentos' }, { status: 404 })
    }

    const bucket = `axp-client-${cliente.cuit}`

    // Merge all PDFs into one
    const mergedPdf = await PDFDocument.create()

    for (const doc of documentos) {
      const pdfKey = doc.pdfFinalKey || doc.pdfRawKey
      try {
        const pdfBytes = await downloadFromR2(bucket, pdfKey)
        const srcPdf = await PDFDocument.load(pdfBytes)
        const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices())
        pages.forEach((page) => mergedPdf.addPage(page))
      } catch (err) {
        console.warn(`Could not load PDF for document ${doc.id} (${pdfKey}):`, err)
      }
    }

    if (mergedPdf.getPageCount() === 0) {
      return NextResponse.json({ error: 'No se pudieron cargar los PDFs' }, { status: 500 })
    }

    const mergedBytes = await mergedPdf.save()

    // Render template
    const { subject, html } = await renderTemplate(user.clienteId, 'COMPARTIR_DOCUMENTOS', {
      empresa: cliente.razonSocial,
      empresaCuit: cliente.cuit,
      proveedor: '',
      mensaje: message || undefined,
    })

    // Send
    const result = await sendEmail({
      to,
      subject,
      html,
      attachments: [{
        filename: `documentos-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: Buffer.from(mergedBytes),
      }],
    })

    if (result.error) {
      return NextResponse.json({ error: 'Error al enviar email' }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: documentos.length })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Datos inválidos', details: err.errors }, { status: 400 })
    }
    console.error('Error sharing documents via email:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
