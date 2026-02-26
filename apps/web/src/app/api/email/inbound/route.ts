import { NextRequest, NextResponse } from 'next/server'
import { resolveSender } from '@/lib/email/resolve-sender'
import { uploadToR2 } from '@/lib/r2/client'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * Resend Inbound Webhook
 *
 * Receives emails forwarded to inbox@axp.com.ar, extracts PDF attachments,
 * resolves the sender to a client via usuarios.email (the client user who
 * forwarded the email), and uploads PDFs to the client's R2 bucket inbox/
 * for OCR processing.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature
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

    // Only process inbound emails
    if (eventType !== 'email.received') {
      return NextResponse.json({ received: true })
    }

    const emailData = payload.data
    const from = emailData.from?.address || emailData.from
    const subject = emailData.subject || ''
    const attachments: { filename: string; content: string; content_type: string }[] =
      emailData.attachments || []

    // Filter only PDF attachments
    const pdfAttachments = attachments.filter(
      (att) =>
        att.content_type === 'application/pdf' ||
        att.filename?.toLowerCase().endsWith('.pdf')
    )

    if (pdfAttachments.length === 0) {
      console.log(`Inbound email from ${from} has no PDF attachments, skipping`)
      return NextResponse.json({ received: true, processed: 0 })
    }

    // Resolve sender to client
    const resolved = await resolveSender(from)

    if (!resolved) {
      console.warn(`Could not resolve sender ${from} to any client`)
      // Can't log to processing_logs without a clienteId (required field)
      return NextResponse.json({ received: true, processed: 0, unresolved: true })
    }

    // Upload each PDF to R2 inbox/
    let uploaded = 0
    for (const att of pdfAttachments) {
      try {
        const pdfBuffer = Buffer.from(att.content, 'base64')
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const safeName = (att.filename || 'documento.pdf')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .substring(0, 100)
        const key = `inbox/${timestamp}_${safeName}`

        await uploadToR2(resolved.bucket, key, pdfBuffer, {
          source: 'EMAIL',
          forwardedBy: from,
          userId: resolved.userId,
        })

        uploaded++
      } catch (err) {
        console.error(`Failed to upload attachment ${att.filename}:`, err)
      }
    }

    // Log success
    await prisma.processing_logs.create({
      data: {
        cliente_id: resolved.clienteId,
        level: 'INFO',
        source: 'EMAIL_INBOUND',
        message: `Email inbound procesado: ${uploaded} PDFs de ${from}`,
        details: {
          forwardedBy: from,
          subject,
          userId: resolved.userId,
          uploaded,
          total: pdfAttachments.length,
        },
      },
    }).catch(() => {})

    return NextResponse.json({ received: true, processed: uploaded })
  } catch (err) {
    console.error('Error processing inbound email webhook:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
