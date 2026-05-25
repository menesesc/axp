/**
 * Helper para descargar attachments de emails recibidos via Resend.
 *
 * Resend NO envía el contenido binario de attachments en el payload del webhook
 * (solo metadata: filename, content_type, content_id). Hay que llamar a la API
 * para obtener un download_url temporal y descargar el binario.
 *
 * Doc: https://resend.com/docs/dashboard/receiving/attachments
 *
 * Usamos fetch directo a la REST API porque el SDK v4.x no expone aún el namespace
 * resend.emails.receiving.attachments (sí está en v5+).
 */

export interface ResendAttachmentMeta {
  id: string
  filename: string
  content_type: string
  size?: number
  content_disposition?: string
  content_id?: string
  download_url: string
}

export interface ResendAttachmentWithBuffer {
  filename: string
  content_type: string
  buffer: Buffer
}

const RESEND_API_BASE = 'https://api.resend.com'

async function resendApiKey(): Promise<string> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY no está configurada')
  return key
}

/**
 * Lista los attachments de un email recibido (devuelve metadata + download_url).
 */
export async function listReceivingAttachments(emailId: string): Promise<ResendAttachmentMeta[]> {
  const key = await resendApiKey()
  const res = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}/attachments`, {
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Resend list attachments failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const body = (await res.json()) as { data?: ResendAttachmentMeta[] } | ResendAttachmentMeta[]
  // La API puede devolver { data: [...] } o el array directo según versión
  if (Array.isArray(body)) return body
  return body.data ?? []
}

/**
 * Descarga el binario de un attachment desde su download_url (URL firmada y temporal).
 */
async function downloadAttachment(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Download attachment failed: ${res.status}`)
  }
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

/**
 * Lista y descarga todos los attachments PDF de un email recibido.
 * Filtra por content_type === 'application/pdf' o filename .pdf.
 */
export async function fetchInboundPdfAttachments(
  emailId: string
): Promise<ResendAttachmentWithBuffer[]> {
  const metas = await listReceivingAttachments(emailId)
  const pdfs = metas.filter(
    (m) =>
      m.content_type === 'application/pdf' ||
      m.filename?.toLowerCase().endsWith('.pdf')
  )
  const out: ResendAttachmentWithBuffer[] = []
  for (const m of pdfs) {
    try {
      const buffer = await downloadAttachment(m.download_url)
      out.push({
        filename: m.filename ?? 'documento.pdf',
        content_type: m.content_type,
        buffer,
      })
    } catch (err) {
      console.error(`Failed to download attachment ${m.filename}:`, err)
    }
  }
  return out
}
