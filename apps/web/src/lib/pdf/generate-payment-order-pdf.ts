import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { downloadFromR2 } from '@/lib/r2/client'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value)
}

function formatNumeroOrden(numero: number): string {
  return String(numero).padStart(6, '0')
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const tipoDocLabels: Record<string, string> = {
  FACTURA: 'FACTURA',
  NOTA_CREDITO: 'NOTA DE CREDITO',
  REMITO: 'REMITO',
}

const estadoLabels: Record<string, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  PAGADO: 'Pagada',
  ANULADO: 'Anulada',
}

const metodoLabels: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  ECHEQ: 'eCheq',
}

export interface PagoForPdf {
  numero: number
  fecha: Date | string
  estado: string
  nota: string | null
  proveedores: { razonSocial: string; cuit: string | null }
  pago_documentos: Array<{
    documentos: {
      tipo: string
      letra: string | null
      numeroCompleto: string | null
      fechaEmision: Date | string | null
      total: { toNumber?: () => number } | number | null
    }
  }>
  pago_metodos: Array<{
    tipo: string
    monto: { toNumber?: () => number } | number
    meta: unknown
  }>
}

export interface PdfContext {
  clienteRazonSocial: string
  clienteCuit: string
}

export async function generatePaymentOrderPdf(
  pago: PagoForPdf,
  context: PdfContext,
  options?: { includeAttachments?: boolean },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()
  let y = height - 50

  const primaryColor = rgb(0.13, 0.13, 0.13)
  const secondaryColor = rgb(0.4, 0.4, 0.4)
  const lightGray = rgb(0.85, 0.85, 0.85)
  const accentColor = rgb(0.2, 0.4, 0.8)

  // Header
  page.drawText(`ORDEN DE PAGO #${formatNumeroOrden(pago.numero)}`, {
    x: 50, y, size: 24, font: helveticaBold, color: primaryColor,
  })

  const estadoText = estadoLabels[pago.estado] || pago.estado
  const estadoWidth = helveticaBold.widthOfTextAtSize(estadoText, 10) + 16
  page.drawRectangle({
    x: width - 50 - estadoWidth, y: y - 4, width: estadoWidth, height: 20,
    color: pago.estado === 'EMITIDA' ? rgb(0.1, 0.6, 0.3) : pago.estado === 'PAGADO' ? rgb(0.2, 0.5, 0.8) : rgb(0.5, 0.5, 0.5),
  })
  page.drawText(estadoText, {
    x: width - 50 - estadoWidth + 8, y: y + 2, size: 10, font: helveticaBold, color: rgb(1, 1, 1),
  })
  y -= 35

  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 2, color: accentColor })
  y -= 25

  // Emisor
  page.drawText('EMISOR', { x: 50, y, size: 8, font: helveticaBold, color: secondaryColor })
  y -= 12
  page.drawText(context.clienteRazonSocial, { x: 50, y, size: 11, font: helveticaBold, color: primaryColor })
  y -= 14
  page.drawText(`CUIT: ${context.clienteCuit}`, { x: 50, y, size: 9, font: helvetica, color: secondaryColor })

  // Proveedor
  const rightColX = 320
  page.drawText('PROVEEDOR', { x: rightColX, y: y + 26, size: 8, font: helveticaBold, color: secondaryColor })
  page.drawText(pago.proveedores.razonSocial, { x: rightColX, y: y + 14, size: 11, font: helveticaBold, color: primaryColor })
  if (pago.proveedores.cuit) {
    page.drawText(`CUIT: ${pago.proveedores.cuit}`, { x: rightColX, y, size: 9, font: helvetica, color: secondaryColor })
  }
  y -= 30

  // Fecha
  page.drawText(`Fecha de emisión: ${formatDate(pago.fecha)}`, { x: 50, y, size: 10, font: helvetica, color: secondaryColor })
  y -= 30

  // Documentos
  page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 22, color: rgb(0.95, 0.95, 0.95) })
  page.drawText('DOCUMENTOS INCLUIDOS', { x: 60, y: y + 2, size: 10, font: helveticaBold, color: primaryColor })
  y -= 30

  const tableX = 50
  const colFecha = 70

  page.drawText('Fecha', { x: tableX, y, size: 8, font: helveticaBold, color: secondaryColor })
  page.drawText('Documento', { x: tableX + colFecha, y, size: 8, font: helveticaBold, color: secondaryColor })
  page.drawText('Total', { x: width - 50 - helveticaBold.widthOfTextAtSize('Total', 8), y, size: 8, font: helveticaBold, color: secondaryColor })
  y -= 8
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: lightGray })
  y -= 12

  let totalDocs = 0
  for (const pd of pago.pago_documentos) {
    const doc = pd.documentos
    const fechaStr = doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'
    const docName = `${tipoDocLabels[doc.tipo] || doc.tipo} ${doc.letra || ''} ${doc.numeroCompleto || 'S/N'}`
    const totalNum = doc.total ? (typeof doc.total === 'number' ? doc.total : Number(doc.total)) : 0
    const totalStr = totalNum ? formatCurrency(totalNum) : '-'
    totalDocs += totalNum

    page.drawText(fechaStr, { x: tableX, y, size: 9, font: helvetica, color: primaryColor })
    page.drawText(docName.slice(0, 45), { x: tableX + colFecha, y, size: 9, font: helvetica, color: primaryColor })
    const totalWidth = helvetica.widthOfTextAtSize(totalStr, 9)
    page.drawText(totalStr, { x: width - 50 - totalWidth, y, size: 9, font: helvetica, color: primaryColor })
    y -= 16
  }

  y -= 4
  page.drawLine({ start: { x: 350, y: y + 12 }, end: { x: width - 50, y: y + 12 }, thickness: 0.5, color: lightGray })
  const totalDocsStr = formatCurrency(totalDocs)
  page.drawText('TOTAL', { x: 350, y, size: 9, font: helveticaBold, color: primaryColor })
  page.drawText(totalDocsStr, { x: width - 50 - helveticaBold.widthOfTextAtSize(totalDocsStr, 9), y, size: 9, font: helveticaBold, color: primaryColor })
  y -= 35

  // Formas de pago
  page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 22, color: rgb(0.95, 0.95, 0.95) })
  page.drawText('FORMAS DE PAGO', { x: 60, y: y + 2, size: 10, font: helveticaBold, color: primaryColor })
  y -= 30

  let totalPagos = 0
  for (const m of pago.pago_metodos) {
    const meta = (m.meta || {}) as Record<string, unknown>
    const metodoNombre = metodoLabels[m.tipo] || m.tipo
    const monto = typeof m.monto === 'number' ? m.monto : Number(m.monto)
    totalPagos += monto
    const montoStr = formatCurrency(monto)
    const fecha = meta.fecha ? formatDate(meta.fecha as string) : formatDate(pago.fecha)
    const ref = (meta.referencia as string) || ''

    page.drawText(metodoNombre, { x: 60, y, size: 9, font: helveticaBold, color: primaryColor })
    page.drawText(`Fecha: ${fecha}`, { x: 160, y, size: 9, font: helvetica, color: secondaryColor })
    if (ref) {
      page.drawText(`Ref: ${ref}`, { x: 280, y, size: 9, font: helvetica, color: secondaryColor })
    }
    const montoWidth = helveticaBold.widthOfTextAtSize(montoStr, 9)
    page.drawText(montoStr, { x: width - 50 - montoWidth, y, size: 9, font: helveticaBold, color: primaryColor })
    y -= 18
  }

  y -= 4
  page.drawLine({ start: { x: 350, y: y + 14 }, end: { x: width - 50, y: y + 14 }, thickness: 0.5, color: lightGray })
  const totalPagosStr = formatCurrency(totalPagos)
  page.drawText('TOTAL PAGOS', { x: 350, y, size: 9, font: helveticaBold, color: primaryColor })
  page.drawText(totalPagosStr, { x: width - 50 - helveticaBold.widthOfTextAtSize(totalPagosStr, 9), y, size: 9, font: helveticaBold, color: primaryColor })
  y -= 30

  // Nota
  if (pago.nota) {
    y -= 50
    page.drawText('Observaciones:', { x: 50, y, size: 9, font: helveticaBold, color: secondaryColor })
    y -= 12
    page.drawText(pago.nota.slice(0, 100), { x: 50, y, size: 9, font: helvetica, color: primaryColor })
  }

  // Footer
  page.drawLine({ start: { x: 50, y: 45 }, end: { x: width - 50, y: 45 }, thickness: 0.5, color: lightGray })
  page.drawText('Generado por AXP', { x: 50, y: 30, size: 8, font: helvetica, color: secondaryColor })
  const dateStr = new Date().toLocaleString('es-AR')
  page.drawText(dateStr, { x: width - 50 - helvetica.widthOfTextAtSize(dateStr, 8), y: 30, size: 8, font: helvetica, color: secondaryColor })

  // Attachments
  if (options?.includeAttachments !== false) {
    const bucket = `axp-client-${context.clienteCuit}`
    for (const metodo of pago.pago_metodos) {
      const meta = (metodo.meta || {}) as Record<string, unknown>
      const attachments = (meta.attachments || []) as { key: string; filename: string }[]
      for (const att of attachments) {
        try {
          const bytes = await downloadFromR2(bucket, att.key)
          const attachmentPdf = await PDFDocument.load(bytes)
          const copiedPages = await pdfDoc.copyPages(attachmentPdf, attachmentPdf.getPageIndices())
          copiedPages.forEach((p) => pdfDoc.addPage(p))
        } catch (err) {
          console.warn(`Could not load attachment ${att.key}:`, err)
        }
      }
    }
  }

  return pdfDoc.save()
}

export { formatNumeroOrden, formatCurrency, formatDate }
