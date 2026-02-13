import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

const r2Client = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const estadoLabels: Record<string, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  PAGADO: 'Pagada',
  ANULADO: 'Anulada',
}

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

    // Get cliente for bucket name
    const cliente = await prisma.clientes.findUnique({
      where: { id: user.clienteId },
      select: { cuit: true, razonSocial: true },
    })

    if (!cliente?.cuit) {
      return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
    }

    // Get the pago with all details
    const pago = await prisma.pagos.findUnique({
      where: { id },
      include: {
        proveedores: {
          select: {
            razonSocial: true,
            cuit: true,
          },
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

    // Create PDF document
    const pdfDoc = await PDFDocument.create()
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // First page: Summary
    const page = pdfDoc.addPage([595, 842]) // A4 size
    const { width, height } = page.getSize()
    let y = height - 50

    // Colors
    const primaryColor = rgb(0.13, 0.13, 0.13)
    const secondaryColor = rgb(0.4, 0.4, 0.4)
    const lightGray = rgb(0.85, 0.85, 0.85)
    const accentColor = rgb(0.2, 0.4, 0.8)

    // Header with title and number
    page.drawText(`ORDEN DE PAGO #${pago.numero}`, {
      x: 50,
      y,
      size: 24,
      font: helveticaBold,
      color: primaryColor,
    })

    // Status badge on the right
    const estadoText = estadoLabels[pago.estado] || pago.estado
    const estadoWidth = helveticaBold.widthOfTextAtSize(estadoText, 10) + 16
    page.drawRectangle({
      x: width - 50 - estadoWidth,
      y: y - 4,
      width: estadoWidth,
      height: 20,
      color: pago.estado === 'EMITIDA' ? rgb(0.1, 0.6, 0.3) : pago.estado === 'PAGADO' ? rgb(0.2, 0.5, 0.8) : rgb(0.5, 0.5, 0.5),
    })
    page.drawText(estadoText, {
      x: width - 50 - estadoWidth + 8,
      y: y + 2,
      size: 10,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    })
    y -= 35

    // Horizontal line
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 2,
      color: accentColor,
    })
    y -= 25

    // Two-column layout for empresa and proveedor
    // Left column: Empresa
    page.drawText('EMISOR', {
      x: 50,
      y,
      size: 8,
      font: helveticaBold,
      color: secondaryColor,
    })
    y -= 12
    page.drawText(cliente.razonSocial, {
      x: 50,
      y,
      size: 11,
      font: helveticaBold,
      color: primaryColor,
    })
    y -= 14
    page.drawText(`CUIT: ${cliente.cuit}`, {
      x: 50,
      y,
      size: 9,
      font: helvetica,
      color: secondaryColor,
    })

    // Right column: Proveedor (same y level)
    const rightColX = 320
    page.drawText('PROVEEDOR', {
      x: rightColX,
      y: y + 26,
      size: 8,
      font: helveticaBold,
      color: secondaryColor,
    })
    page.drawText(pago.proveedores.razonSocial, {
      x: rightColX,
      y: y + 14,
      size: 11,
      font: helveticaBold,
      color: primaryColor,
    })
    if (pago.proveedores.cuit) {
      page.drawText(`CUIT: ${pago.proveedores.cuit}`, {
        x: rightColX,
        y,
        size: 9,
        font: helvetica,
        color: secondaryColor,
      })
    }
    y -= 30

    // Fecha
    page.drawText(`Fecha de emisión: ${formatDate(pago.fecha)}`, {
      x: 50,
      y,
      size: 10,
      font: helvetica,
      color: secondaryColor,
    })
    y -= 30

    // Documentos section
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: width - 100,
      height: 22,
      color: rgb(0.95, 0.95, 0.95),
    })
    page.drawText('DOCUMENTOS INCLUIDOS', {
      x: 60,
      y: y + 2,
      size: 10,
      font: helveticaBold,
      color: primaryColor,
    })
    y -= 30

    // Table header
    const tableX = 50
    const colFecha = 70

    // Header row
    page.drawText('Fecha', {
      x: tableX,
      y,
      size: 8,
      font: helveticaBold,
      color: secondaryColor,
    })
    page.drawText('Documento', {
      x: tableX + colFecha,
      y,
      size: 8,
      font: helveticaBold,
      color: secondaryColor,
    })
    page.drawText('Total', {
      x: width - 50 - helveticaBold.widthOfTextAtSize('Total', 8),
      y,
      size: 8,
      font: helveticaBold,
      color: secondaryColor,
    })
    y -= 8

    // Header line
    page.drawLine({
      start: { x: 50, y },
      end: { x: width - 50, y },
      thickness: 0.5,
      color: lightGray,
    })
    y -= 12

    // Document rows
    let totalDocs = 0
    for (const pd of pago.pago_documentos) {
      const doc = pd.documentos
      const fechaStr = doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'
      const docName = `${doc.tipo} ${doc.letra || ''} ${doc.numeroCompleto || 'S/N'}`
      const totalStr = doc.total ? formatCurrency(Number(doc.total)) : '-'
      totalDocs += Number(doc.total || 0)

      page.drawText(fechaStr, {
        x: tableX,
        y,
        size: 9,
        font: helvetica,
        color: primaryColor,
      })
      page.drawText(docName.slice(0, 45), {
        x: tableX + colFecha,
        y,
        size: 9,
        font: helvetica,
        color: primaryColor,
      })
      // Right-aligned total
      const totalWidth = helvetica.widthOfTextAtSize(totalStr, 9)
      page.drawText(totalStr, {
        x: width - 50 - totalWidth,
        y,
        size: 9,
        font: helvetica,
        color: primaryColor,
      })
      y -= 16
    }

    // Total row
    y -= 4
    page.drawLine({
      start: { x: 350, y: y + 12 },
      end: { x: width - 50, y: y + 12 },
      thickness: 0.5,
      color: lightGray,
    })

    page.drawText('TOTAL', {
      x: 350,
      y,
      size: 9,
      font: helveticaBold,
      color: primaryColor,
    })
    const totalDocsStr = formatCurrency(totalDocs)
    const totalDocsWidth = helveticaBold.widthOfTextAtSize(totalDocsStr, 9)
    page.drawText(totalDocsStr, {
      x: width - 50 - totalDocsWidth,
      y,
      size: 9,
      font: helveticaBold,
      color: primaryColor,
    })
    y -= 35

    // Formas de pago section
    page.drawRectangle({
      x: 50,
      y: y - 5,
      width: width - 100,
      height: 22,
      color: rgb(0.95, 0.95, 0.95),
    })
    page.drawText('FORMAS DE PAGO', {
      x: 60,
      y: y + 2,
      size: 10,
      font: helveticaBold,
      color: primaryColor,
    })
    y -= 30

    const metodoLabels: Record<string, string> = {
      EFECTIVO: 'Efectivo',
      TRANSFERENCIA: 'Transferencia',
      CHEQUE: 'Cheque',
      ECHEQ: 'eCheq',
    }

    let totalPagos = 0
    for (const m of pago.pago_metodos) {
      const meta = (m.meta || {}) as Record<string, unknown>
      const metodoNombre = metodoLabels[m.tipo] || m.tipo
      const monto = Number(m.monto)
      totalPagos += monto
      const montoStr = formatCurrency(monto)
      const fecha = meta.fecha ? formatDate(meta.fecha as string) : formatDate(pago.fecha)
      const ref = (meta.referencia as string) || ''

      page.drawText(metodoNombre, {
        x: 60,
        y,
        size: 9,
        font: helveticaBold,
        color: primaryColor,
      })
      page.drawText(`Fecha: ${fecha}`, {
        x: 160,
        y,
        size: 9,
        font: helvetica,
        color: secondaryColor,
      })
      if (ref) {
        page.drawText(`Ref: ${ref}`, {
          x: 280,
          y,
          size: 9,
          font: helvetica,
          color: secondaryColor,
        })
      }
      // Right-aligned amount
      const montoWidth = helveticaBold.widthOfTextAtSize(montoStr, 9)
      page.drawText(montoStr, {
        x: width - 50 - montoWidth,
        y,
        size: 9,
        font: helveticaBold,
        color: primaryColor,
      })
      y -= 18
    }

    // Total pagos
    y -= 4
    page.drawLine({
      start: { x: 350, y: y + 14 },
      end: { x: width - 50, y: y + 14 },
      thickness: 0.5,
      color: lightGray,
    })
    page.drawText('TOTAL PAGOS', {
      x: 350,
      y,
      size: 9,
      font: helveticaBold,
      color: primaryColor,
    })
    const totalPagosStr = formatCurrency(totalPagos)
    const totalPagosWidth = helveticaBold.widthOfTextAtSize(totalPagosStr, 9)
    page.drawText(totalPagosStr, {
      x: width - 50 - totalPagosWidth,
      y,
      size: 9,
      font: helveticaBold,
      color: primaryColor,
    })
    y -= 30

    // Nota if exists
    if (pago.nota) {
      y -= 50
      page.drawText('Observaciones:', {
        x: 50,
        y,
        size: 9,
        font: helveticaBold,
        color: secondaryColor,
      })
      y -= 12
      page.drawText(pago.nota.slice(0, 100), {
        x: 50,
        y,
        size: 9,
        font: helvetica,
        color: primaryColor,
      })
    }

    // Footer
    page.drawLine({
      start: { x: 50, y: 45 },
      end: { x: width - 50, y: 45 },
      thickness: 0.5,
      color: lightGray,
    })
    page.drawText('Generado por AXP', {
      x: 50,
      y: 30,
      size: 8,
      font: helvetica,
      color: secondaryColor,
    })
    page.drawText(new Date().toLocaleString('es-AR'), {
      x: width - 50 - helvetica.widthOfTextAtSize(new Date().toLocaleString('es-AR'), 8),
      y: 30,
      size: 8,
      font: helvetica,
      color: secondaryColor,
    })

    // Now append any attachments from payment methods
    if (r2Client) {
      const bucket = `axp-client-${cliente.cuit}`

      for (const metodo of pago.pago_metodos) {
        const meta = (metodo.meta || {}) as Record<string, unknown>
        const attachments = (meta.attachments || []) as { key: string; filename: string }[]

        for (const att of attachments) {
          try {
            const response = await r2Client.send(new GetObjectCommand({
              Bucket: bucket,
              Key: att.key,
            }))

            if (response.Body) {
              const bytes = await response.Body.transformToByteArray()
              try {
                const attachmentPdf = await PDFDocument.load(bytes)
                const copiedPages = await pdfDoc.copyPages(
                  attachmentPdf,
                  attachmentPdf.getPageIndices()
                )
                copiedPages.forEach((copiedPage) => {
                  pdfDoc.addPage(copiedPage)
                })
              } catch (pdfError) {
                console.warn(`Could not load attachment ${att.key} as PDF:`, pdfError)
              }
            }
          } catch (s3Error) {
            console.warn(`Could not fetch attachment ${att.key}:`, s3Error)
          }
        }
      }
    }

    // Generate final PDF
    const pdfBytes = await pdfDoc.save()

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': isView
          ? `inline; filename="orden-pago-${pago.numero}.pdf"`
          : `attachment; filename="orden-pago-${pago.numero}.pdf"`,
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
