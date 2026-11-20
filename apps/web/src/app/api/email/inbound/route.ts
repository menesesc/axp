import { NextRequest, NextResponse } from 'next/server'
import { procesarEmailInbound } from '@/lib/email/inbound'
import { inboundDeps } from '@/lib/email/inbound-deps'
import crypto from 'crypto'

/**
 * Resend Inbound Webhook
 *
 * Maneja eventos email.received. Resend NO incluye el binario de attachments
 * en el payload (solo metadata + email_id) — hay que llamar a la API de Resend
 * para descargarlos.
 *
 * Acá solo se verifica la firma; la lógica está en lib/email/inbound.ts:
 *  - Confirmación de reenvío de Gmail: se guarda código + link (Canales).
 *  - Maxirest (subject "MaxiREST - Fin de turno..." o sender oficial):
 *      parseo + persistencia en sales_closures, cliente por CUIT del PDF.
 *  - Factura: empresa por casilla destinataria (<casilla>@axp.com.ar, también
 *      en Delivered-To / X-Forwarded-To / received_for); si no, por remitente
 *      usuario (inbox@, flujo viejo). Sube PDF a R2 inbox/ para el worker OCR.
 *  - Todo queda en email_recibidos.
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

    // Con secreto configurado la firma es obligatoria: como la casilla acepta
    // cualquier remitente, un POST sin firma podría meter PDFs en el inbox.
    if (webhookSecret && !(svixId && svixTimestamp && svixSignature)) {
      console.error('Inbound webhook sin headers de firma Svix')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

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
    const r = await procesarEmailInbound(payload, inboundDeps)
    return NextResponse.json(r.body, { status: r.status })
  } catch (err) {
    console.error('Error processing inbound email webhook:', err)
    return NextResponse.json({ error: 'Internal error', detail: (err as Error).message }, { status: 500 })
  }
}
