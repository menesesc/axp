import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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
