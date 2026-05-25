import { NextRequest, NextResponse } from 'next/server'
import { resolveSender } from '@/lib/email/resolve-sender'
import { uploadToR2 } from '@/lib/r2/client'
import { prisma } from '@/lib/prisma'
import { ingestMaxirestPdf, isMaxirestEmail } from '@/lib/sales/maxirest-ingest'
import { fetchInboundPdfAttachments } from '@/lib/email/resend-attachments'
import crypto from 'crypto'

/**
 * Resend Inbound Webhook
 *
 * Maneja eventos email.received. Resend NO incluye el binario de attachments
 * en el payload (solo metadata + email_id) — hay que llamar a la API de Resend
 * para descargarlos.
 *
 * Dos flujos según el email:
 *  - Maxirest (subject "MaxiREST - Fin de turno..." o sender oficial):
 *      parseo + persistencia en sales_closures, cliente por CUIT del PDF.
 *  - Factura normal: resuelve sender por usuarios.email, sube PDF a R2 inbox/
 *      para que el worker OCR procese.
 */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    // ---- Verificación de firma Svix ----
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
    const svixId = request.headers.get('svix-id')
    const svixTimestamp = request.headers.get('svix-timestamp')
    const svixSignature = request.headers.get('svix-signature')

    const body = await request.text()

    if (webhookSecret && svixId && svixTimestamp && svixSignature) {
      const toSign = `${svixId}.${svixTimestamp}.${body}`
      const secret = webhookSecret.startsWith('whsec_')
        ? webhookSecret.slice(6)
        : webhookSecret
      const secretBytes = Buffer.from(secret, 'base64')
      const signature = crypto
        .createHmac('sha256', secretBytes)
        .update(toSign)
        .digest('base64')

      const expectedSignatures = svixSignature.split(' ').map((s) => s.split(',')[1])
      if (!expectedSignatures.includes(signature)) {
        console.error('Invalid webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body)
    const eventType = payload.type

    if (eventType !== 'email.received') {
      return NextResponse.json({ received: true })
    }

    const emailData = payload.data ?? {}
    const from: string = emailData.from?.address || emailData.from || ''
    const subject: string = emailData.subject || ''
    const emailId: string | undefined = emailData.email_id || emailData.id

    // Si vienen attachments inline en el payload (modelo viejo o tests) usarlos;
    // sino, descargarlos via API de Resend con el email_id.
    const inlineAttachments: Array<{ filename?: string; content?: string; content_type?: string }> =
      Array.isArray(emailData.attachments) ? emailData.attachments : []

    let pdfBuffers: Array<{ filename: string; content_type: string; buffer: Buffer }> = []

    // Modelo viejo: attachments con base64 inline
    const inlineWithContent = inlineAttachments.filter((a) => typeof a.content === 'string' && a.content.length > 0)
    if (inlineWithContent.length > 0) {
      for (const a of inlineWithContent) {
        const isPdf = a.content_type === 'application/pdf' || a.filename?.toLowerCase().endsWith('.pdf')
        if (!isPdf) continue
        pdfBuffers.push({
          filename: a.filename || 'documento.pdf',
          content_type: a.content_type || 'application/pdf',
          buffer: Buffer.from(a.content as string, 'base64'),
        })
      }
    } else if (emailId) {
      // Modelo nuevo: descargar via API
      try {
        pdfBuffers = await fetchInboundPdfAttachments(emailId)
      } catch (err) {
        console.error('Error fetching attachments from Resend API:', err)
        return NextResponse.json(
          { received: true, error: 'failed_to_fetch_attachments', detail: (err as Error).message },
          { status: 500 }
        )
      }
    }

    if (pdfBuffers.length === 0) {
      console.log(`Inbound email from ${from} subject="${subject}" emailId=${emailId} has no PDF attachments, skipping`)
      return NextResponse.json({
        received: true,
        processed: 0,
        attachments: inlineAttachments.length,
        emailId: emailId ?? null,
      })
    }

    // ---- Rama Maxirest ----
    if (isMaxirestEmail({ from, subject })) {
      const results: Array<{ filename: string; status: string; message: string; nroCierre?: number | undefined }> = []
      let okCount = 0
      for (const pdf of pdfBuffers) {
        const r = await ingestMaxirestPdf(pdf.buffer, {
          source: 'EMAIL',
          forwardedBy: from,
          filename: pdf.filename,
        })
        results.push({
          filename: pdf.filename,
          status: r.status,
          message: r.message,
          nroCierre: r.nroCierre,
        })
        if (r.status === 'OK') okCount++
        if (r.clienteId) {
          await prisma.processing_logs.create({
            data: {
              cliente_id: r.clienteId,
              level: r.status === 'OK' ? 'INFO' : 'WARN',
              source: 'EMAIL_INBOUND_MAXIREST',
              message: r.message,
              details: {
                from,
                subject,
                emailId: emailId ?? null,
                filename: pdf.filename,
                nroCierre: r.nroCierre,
                fecha: r.fecha,
                status: r.status,
              },
            },
          }).catch(() => {})
        }
      }
      return NextResponse.json({
        received: true,
        processed: okCount,
        total: pdfBuffers.length,
        flow: 'MAXIREST',
        results,
      })
    }

    // ---- Flujo normal (facturas) ----
    const resolved = await resolveSender(from)

    if (!resolved) {
      console.warn(`Could not resolve sender ${from} to any client`)
      return NextResponse.json({ received: true, processed: 0, unresolved: true })
    }

    let uploaded = 0
    for (const pdf of pdfBuffers) {
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const safeName = pdf.filename
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .substring(0, 100)
        const key = `inbox/${timestamp}_${safeName}`

        await uploadToR2(resolved.bucket, key, pdf.buffer, {
          source: 'EMAIL',
          forwardedBy: from,
          userId: resolved.userId,
        })

        uploaded++
      } catch (err) {
        console.error(`Failed to upload attachment ${pdf.filename}:`, err)
      }
    }

    await prisma.processing_logs.create({
      data: {
        cliente_id: resolved.clienteId,
        level: 'INFO',
        source: 'EMAIL_INBOUND',
        message: `Email inbound procesado: ${uploaded} PDFs de ${from}`,
        details: {
          forwardedBy: from,
          subject,
          emailId: emailId ?? null,
          userId: resolved.userId,
          uploaded,
          total: pdfBuffers.length,
        },
      },
    }).catch(() => {})

    return NextResponse.json({ received: true, processed: uploaded, flow: 'INVOICE' })
  } catch (err) {
    console.error('Error processing inbound email webhook:', err)
    return NextResponse.json({ error: 'Internal error', detail: (err as Error).message }, { status: 500 })
  }
}
