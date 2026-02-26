import { prisma } from '@/lib/prisma'
import { sendEmail } from './resend'
import { renderTemplate } from './templates/render'
import { generatePaymentOrderPdf, formatNumeroOrden, formatCurrency, formatDate } from '@/lib/pdf/generate-payment-order-pdf'

const metodoLabels: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  ECHEQ: 'eCheq',
}

const tipoDocLabels: Record<string, string> = {
  FACTURA: 'Factura',
  NOTA_CREDITO: 'Nota de Crédito',
  REMITO: 'Remito',
}

export async function sendPaymentOrderEmail(pagoId: string, clienteId: string): Promise<void> {
  // Fetch pago with all relations
  const pago = await prisma.pagos.findUnique({
    where: { id: pagoId },
    include: {
      proveedores: {
        select: { razonSocial: true, cuit: true, email: true },
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

  if (!pago) {
    console.warn(`sendPaymentOrderEmail: pago ${pagoId} not found`)
    return
  }

  // Check if supplier has email
  const proveedorEmail = pago.proveedores.email
  if (!proveedorEmail) {
    console.log(`sendPaymentOrderEmail: proveedor ${pago.proveedores.razonSocial} has no email, skipping`)
    return
  }

  // Get client info
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: { razonSocial: true, cuit: true },
  })

  if (!cliente) {
    console.warn(`sendPaymentOrderEmail: cliente ${clienteId} not found`)
    return
  }

  // Build document rows HTML
  const documentosHtml = pago.pago_documentos.map((pd) => {
    const doc = pd.documentos
    const docName = `${tipoDocLabels[doc.tipo] || doc.tipo} ${doc.letra || ''} ${doc.numeroCompleto || 'S/N'}`
    const fecha = doc.fechaEmision ? formatDate(doc.fechaEmision) : '-'
    const total = doc.total ? formatCurrency(Number(doc.total)) : '-'
    return `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${docName}</td><td style="padding:8px;border-bottom:1px solid #eee;">${fecha}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${total}</td></tr>`
  }).join('')

  // Build methods rows HTML
  const metodosHtml = pago.pago_metodos.map((m) => {
    const nombre = metodoLabels[m.tipo] || m.tipo
    const monto = formatCurrency(Number(m.monto))
    return `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${nombre}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #eee;">${monto}</td></tr>`
  }).join('')

  // Render email template
  const { subject, html } = await renderTemplate(clienteId, 'ORDEN_PAGO', {
    empresa: cliente.razonSocial,
    empresaCuit: cliente.cuit,
    proveedor: pago.proveedores.razonSocial,
    proveedorCuit: pago.proveedores.cuit || undefined,
    monto: formatCurrency(Number(pago.montoTotal)),
    numero: formatNumeroOrden(pago.numero),
    fecha: formatDate(pago.fecha),
    nota: pago.nota || undefined,
    documentos: documentosHtml || undefined,
    metodos: metodosHtml || undefined,
  })

  // Generate PDF
  const pdfBytes = await generatePaymentOrderPdf(pago, {
    clienteRazonSocial: cliente.razonSocial,
    clienteCuit: cliente.cuit,
  })

  // Send email
  const result = await sendEmail({
    to: proveedorEmail,
    subject,
    html,
    attachments: [{
      filename: `orden-pago-${formatNumeroOrden(pago.numero)}.pdf`,
      content: Buffer.from(pdfBytes),
    }],
  })

  // Log result
  await prisma.processing_logs.create({
    data: {
      cliente_id: clienteId,
      level: result.error ? 'error' : 'info',
      source: 'EMAIL',
      message: result.error
        ? `Error enviando email OP #${formatNumeroOrden(pago.numero)} a ${proveedorEmail}: ${JSON.stringify(result.error)}`
        : `Email enviado OP #${formatNumeroOrden(pago.numero)} a ${proveedorEmail}`,
      details: { pagoId, to: proveedorEmail, result } as object,
    },
  })

  if (result.error) {
    throw new Error(`Resend error: ${JSON.stringify(result.error)}`)
  }
}
