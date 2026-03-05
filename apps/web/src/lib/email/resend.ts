import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) {
      throw new Error('RESEND_API_KEY no está configurada')
    }
    _resend = new Resend(key)
  }
  return _resend
}

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  attachments?: Array<{
    filename: string
    content: Buffer
  }>
}

const DEFAULT_FROM = 'AXP Pagos <pagos@axp.com.ar>'

export async function sendEmail(options: SendEmailOptions) {
  const { to, subject, html, attachments, from = DEFAULT_FROM } = options

  const resend = getResend()
  const payload: Parameters<typeof resend.emails.send>[0] = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  }
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }))
  }

  const result = await resend.emails.send(payload)

  return result
}
