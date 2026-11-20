/**
 * Lógica del webhook de Resend inbound (email.received), separada de la ruta
 * para poder testearla sin prisma, R2 ni Resend: todo lo que toca afuera entra
 * por `InboundDeps` (ver inbound-deps.ts para la implementación real).
 *
 * Orden de decisión:
 *  1. Confirmación de reenvío de Gmail (forwarding-noreply@google.com):
 *     se guarda código + link para mostrarlo en Canales. No se procesa nada más.
 *  2. Maxirest (sender oficial o subject "MaxiREST - Fin de turno"): igual que
 *     antes, cliente por CUIT del PDF. NO cambiar sin probar contra producción.
 *  3. Facturas: la empresa sale del DESTINATARIO (<casilla>@axp.com.ar) mirando
 *     to, cc, received_for (sobre SMTP) y, si hace falta, los headers de reenvío
 *     (Delivered-To, X-Forwarded-To, X-Original-To, Envelope-To). Si no hay
 *     casilla, se cae al flujo viejo: remitente = usuario activo (inbox@).
 *     Con empresa resuelta se acepta cualquier remitente: lo que no sea factura
 *     lo rechaza el OCR/validación después.
 *  4. Todo email queda registrado en email_recibidos (nada se descarta en silencio).
 */
import crypto from 'crypto'
import type { IngestResult } from '@/lib/sales/maxirest-ingest'

export const CASILLA_DOMINIO = 'axp.com.ar'

/** Casillas que no se pueden asignar a una empresa. */
export const CASILLAS_RESERVADAS = new Set([
  'inbox',
  'pagos',
  'maxirest',
  'admin',
  'administrador',
  'postmaster',
  'abuse',
  'hostmaster',
  'webmaster',
  'noreply',
  'no-reply',
  'soporte',
  'support',
  'info',
  'contacto',
  'facturas',
])

const CASILLA_RX = /^[a-z0-9]([a-z0-9.-]{0,38}[a-z0-9])?$/

/** Normaliza y valida un slug de casilla. Devuelve el error en castellano o null. */
export function validarCasilla(slug: string): string | null {
  if (!slug) return 'La casilla no puede estar vacía'
  if (slug.length > 40) return 'Máximo 40 caracteres'
  if (!CASILLA_RX.test(slug)) {
    return 'Solo minúsculas, números, punto y guión (sin empezar ni terminar con punto o guión)'
  }
  if (slug.includes('..')) return 'No puede tener dos puntos seguidos'
  if (CASILLAS_RESERVADAS.has(slug)) return `"${slug}" está reservada`
  return null
}

export type ResultadoEmail =
  | 'PROCESADO'
  | 'SIN_ADJUNTO'
  | 'DUPLICADO'
  | 'NO_RESUELTO'
  | 'MAXIREST'
  | 'CONFIRMACION_GMAIL'
  | 'ERROR'

/** Headers de reenvío / sobre que pueden traer la casilla cuando el To es otro. */
export const HEADERS_REENVIO = ['delivered-to', 'x-forwarded-to', 'x-original-to', 'envelope-to'] as const

export const GMAIL_FORWARDING_SENDER = 'forwarding-noreply@google.com'

// ---------------------------------------------------------------------------
// Tipos de Resend
// ---------------------------------------------------------------------------

export interface ResendAttachmentInfo {
  id?: string
  filename?: string
  content_type?: string
  content?: string
  size?: number
}

/** `data` del webhook email.received (solo metadata, sin body ni headers). */
export interface InboundEmailData {
  email_id?: string
  id?: string
  created_at?: string
  from?: string | { address?: string; name?: string }
  to?: unknown
  cc?: unknown
  bcc?: unknown
  received_for?: unknown
  subject?: string
  message_id?: string
  attachments?: ResendAttachmentInfo[]
}

/** GET /emails/receiving/{id}: igual que el webhook + body y headers. */
export interface ResendReceivedEmail {
  id?: string
  from?: string
  to?: unknown
  cc?: unknown
  received_for?: unknown
  subject?: string
  html?: string | null
  text?: string | null
  headers?: unknown
}

export interface PdfAdjunto {
  filename: string
  content_type: string
  buffer: Buffer
}

export interface ClienteResuelto {
  clienteId: string
  cuit: string
  /** Cómo se resolvió: por casilla (destinatario) o por remitente (usuario). */
  via: 'CASILLA' | 'REMITENTE'
  casilla?: string
  userId?: string
}

export interface RegistroEmail {
  clienteId: string | null
  fecha: Date
  remitente: string
  destinatario: string
  asunto: string
  emailId: string | null
  resultado: ResultadoEmail
  detalle: string | null
  adjuntos: number
  extra: Record<string, unknown>
}

export interface InboundDeps {
  buscarClientePorCasilla(slugs: string[]): Promise<{ clienteId: string; cuit: string; casilla: string } | null>
  resolverRemitente(email: string): Promise<{ clienteId: string; cuit: string; userId: string } | null>
  obtenerEmail(emailId: string): Promise<ResendReceivedEmail>
  descargarPdfs(emailId: string): Promise<PdfAdjunto[]>
  existeDocumentoConHash(clienteId: string, sha256: string): Promise<boolean>
  subirAInbox(bucket: string, key: string, buffer: Buffer, metadata: Record<string, string>): Promise<void>
  /** isMaxirestEmail de maxirest-ingest (inyectado para no arrastrar prisma). */
  esMaxirest(args: { from: string; subject: string }): boolean
  ingestMaxirest(buffer: Buffer, opts: { source: 'EMAIL'; forwardedBy: string; filename: string }): Promise<IngestResult>
  /** processing_logs (lo que ya existía). Nunca debe tirar. */
  logProcesamiento(data: {
    clienteId: string
    level: 'INFO' | 'WARN' | 'ERROR'
    source: string
    message: string
    details: Record<string, unknown>
  }): Promise<void>
  /** Upsert en email_recibidos por emailId. Nunca debe tirar. */
  registrar(row: RegistroEmail): Promise<void>
  ahora?(): Date
}

export interface InboundRespuesta {
  status: number
  body: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Direcciones y headers
// ---------------------------------------------------------------------------

const EMAIL_RX = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/**
 * Saca direcciones de email de lo que venga: "Nombre <a@b.com>", "a@b, c@d",
 * arrays, objetos { address } o { email }. Devuelve en minúsculas y sin repetir.
 */
export function extraerDirecciones(valor: unknown): string[] {
  const out: string[] = []
  const visitar = (v: unknown) => {
    if (v == null) return
    if (typeof v === 'string') {
      for (const m of v.match(EMAIL_RX) ?? []) out.push(m.toLowerCase())
    } else if (Array.isArray(v)) {
      v.forEach(visitar)
    } else if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      visitar(o.address ?? o.email ?? o.value)
    }
  }
  visitar(valor)
  return [...new Set(out)]
}

/**
 * Valores de los headers de reenvío. Resend devuelve `headers` como objeto
 * { nombre: valor } (nombres en minúscula); por las dudas aceptamos también
 * valores array, nombres con mayúsculas y el formato [{ name, value }].
 */
export function direccionesDeHeaders(headers: unknown): string[] {
  if (!headers) return []
  const valores: unknown[] = []
  const buscados = new Set<string>(HEADERS_REENVIO)
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const name = String((h as { name?: unknown })?.name ?? '').toLowerCase()
      if (buscados.has(name)) valores.push((h as { value?: unknown }).value)
    }
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (buscados.has(k.toLowerCase())) valores.push(v)
    }
  }
  return extraerDirecciones(valores)
}

/**
 * Slugs candidatos a casilla: la parte local de las direcciones @axp.com.ar,
 * sin "+etiqueta" y sin las reservadas (inbox@ va por el flujo viejo).
 */
export function casillasCandidatas(direcciones: string[]): string[] {
  const out: string[] = []
  for (const d of direcciones) {
    const [local, dominio] = d.toLowerCase().split('@')
    if (!local || dominio !== CASILLA_DOMINIO) continue
    const slug = local.split('+')[0]!
    if (!slug || CASILLAS_RESERVADAS.has(slug)) continue
    if (!out.includes(slug)) out.push(slug)
  }
  return out
}

// ---------------------------------------------------------------------------
// Confirmación de reenvío de Gmail
// ---------------------------------------------------------------------------

export function esConfirmacionGmail(from: string): boolean {
  return extraerDirecciones(from).includes(GMAIL_FORWARDING_SENDER)
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x3d;|&#61;/gi, '=')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Solo links https a *.google.com: se muestran clickeables en Canales. */
export function esLinkGoogleSeguro(link: string): boolean {
  try {
    const u = new URL(link)
    return u.protocol === 'https:' && (u.hostname === 'google.com' || u.hostname.endsWith('.google.com'))
  } catch {
    return false
  }
}

/**
 * Extrae código, link y quién pidió el reenvío del mail de Gmail.
 * Asunto en inglés: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from x@gmail.com"
 * Asunto en castellano: "(n.º 123456789) Confirmación de reenvío de Gmail: recibir correo de x@gmail.com"
 */
export function extraerConfirmacionGmail(input: {
  subject?: string | null | undefined
  text?: string | null | undefined
  html?: string | null | undefined
}): { codigo: string | null; link: string | null; solicitante: string | null } {
  const subject = input.subject ?? ''
  const cuerpo = decodificarEntidades(
    [input.text ?? '', (input.html ?? '').replace(/<[^>]+>/g, ' ')].join('\n')
  )
  const html = decodificarEntidades(input.html ?? '')

  let codigo: string | null = null
  const mCuerpo = cuerpo.match(/(?:confirmation code|c[oó]digo de confirmaci[oó]n)\s*:?\s*(\d{6,12})/i)
  const mAsunto = subject.match(/\((?:#|n\.?\s*[ºo°]\s*)\s*(\d{6,12})\)/i)
  codigo = mCuerpo?.[1] ?? mAsunto?.[1] ?? subject.match(/\b(\d{8,12})\b/)?.[1] ?? null

  // Link de verificación: .../mail/vf-... en mail-settings.google.com o mail.google.com.
  const urls = [...(input.text ?? '').matchAll(/https:\/\/[^\s"'<>]+/g), ...html.matchAll(/https:\/\/[^\s"'<>]+/g)]
    .map((m) => m[0].replace(/[).,;]+$/, ''))
    .filter(esLinkGoogleSeguro)
  const link = urls.find((u) => /\/mail\/(?:u\/\d+\/)?vf-/.test(u)) ?? urls.find((u) => /mail-settings\.google\.com/.test(u)) ?? null

  const enAsunto = extraerDirecciones(subject).filter((d) => d !== GMAIL_FORWARDING_SENDER)
  const solicitante = enAsunto[enAsunto.length - 1] ?? null

  return { codigo, link, solicitante }
}

// ---------------------------------------------------------------------------
// Resolución de la empresa
// ---------------------------------------------------------------------------

/**
 * Busca la empresa por casilla mirando to/cc/received_for del webhook; si no
 * aparece, pide el email completo a Resend y mira también los headers de
 * reenvío. Devuelve además el email completo si lo tuvo que pedir (para no
 * pedirlo dos veces).
 */
export async function resolverPorCasilla(
  data: InboundEmailData,
  emailId: string | undefined,
  deps: InboundDeps,
  emailCompleto?: ResendReceivedEmail | null
): Promise<{ cliente: ClienteResuelto | null; email: ResendReceivedEmail | null; direcciones: string[] }> {
  const delWebhook = extraerDirecciones([data.to, data.cc, data.bcc, data.received_for])
  let slugs = casillasCandidatas(delWebhook)
  let direcciones = delWebhook
  let email = emailCompleto ?? null

  const buscar = async (s: string[]) => {
    if (s.length === 0) return null
    const c = await deps.buscarClientePorCasilla(s)
    return c ? ({ clienteId: c.clienteId, cuit: c.cuit, via: 'CASILLA', casilla: c.casilla } as ClienteResuelto) : null
  }

  let cliente = await buscar(slugs)
  if (cliente) return { cliente, email, direcciones }

  // Reenvío automático: el To original es la casilla del cliente en Gmail;
  // la nuestra queda en el sobre o en los headers de reenvío.
  if (emailId) {
    if (!email) {
      try {
        email = await deps.obtenerEmail(emailId)
      } catch (err) {
        console.error('No se pudo obtener el email de Resend para ver headers:', err)
      }
    }
    if (email) {
      direcciones = [
        ...new Set([
          ...delWebhook,
          ...extraerDirecciones([email.to, email.cc, email.received_for]),
          ...direccionesDeHeaders(email.headers),
        ]),
      ]
      const nuevos = casillasCandidatas(direcciones).filter((s) => !slugs.includes(s))
      slugs = [...slugs, ...nuevos]
      cliente = await buscar(nuevos)
    }
  }
  return { cliente, email, direcciones }
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

function nombreSeguroPdf(filename: string): string {
  let safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100)
  // El worker OCR solo toma claves que terminan en .pdf.
  if (!safe.toLowerCase().endsWith('.pdf')) safe = `${safe || 'documento'}.pdf`
  else safe = safe.slice(0, -4) + '.pdf'
  return safe
}

function esPdf(a: { filename?: string; content_type?: string }): boolean {
  return a.content_type === 'application/pdf' || !!a.filename?.toLowerCase().endsWith('.pdf')
}

export async function procesarEmailInbound(payload: unknown, deps: InboundDeps): Promise<InboundRespuesta> {
  const p = (payload ?? {}) as { type?: string; data?: InboundEmailData }
  if (p.type !== 'email.received') return { status: 200, body: { received: true } }

  const data = p.data ?? {}
  // `from` tal cual venía (Maxirest compara contra esto, no cambiarlo).
  const from: string =
    (typeof data.from === 'object' ? data.from?.address : data.from) || ''
  const remitente = extraerDirecciones(from)[0] ?? from
  const subject: string = data.subject || ''
  const emailId: string | undefined = data.email_id || data.id
  const fecha = data.created_at ? new Date(data.created_at) : (deps.ahora?.() ?? new Date())
  const destinatario = extraerDirecciones([data.to, data.cc]).join(', ')
  const metaAdjuntos: ResendAttachmentInfo[] = Array.isArray(data.attachments) ? data.attachments : []

  const base = {
    fecha: isNaN(fecha.getTime()) ? new Date() : fecha,
    remitente,
    destinatario,
    asunto: subject,
    emailId: emailId ?? null,
  }

  // ---- 1. Confirmación de reenvío de Gmail ----
  if (esConfirmacionGmail(from)) {
    let email: ResendReceivedEmail | null = null
    if (emailId) {
      try {
        email = await deps.obtenerEmail(emailId)
      } catch (err) {
        console.error('No se pudo obtener el cuerpo de la confirmación de Gmail:', err)
      }
    }
    const conf = extraerConfirmacionGmail({ subject, text: email?.text, html: email?.html })
    let cliente: ClienteResuelto | null = null
    try {
      cliente = (await resolverPorCasilla(data, emailId, deps, email)).cliente
    } catch (err) {
      console.error('Error resolviendo casilla de la confirmación de Gmail:', err)
    }
    await deps.registrar({
      ...base,
      clienteId: cliente?.clienteId ?? null,
      resultado: 'CONFIRMACION_GMAIL',
      detalle: conf.codigo
        ? `Código de confirmación de Gmail: ${conf.codigo}${conf.solicitante ? ` (pedido por ${conf.solicitante})` : ''}`
        : 'Confirmación de reenvío de Gmail (no se encontró el código, revisar a mano)',
      adjuntos: 0,
      extra: { codigo: conf.codigo, link: conf.link, solicitante: conf.solicitante },
    })
    return {
      status: 200,
      body: { received: true, flow: 'CONFIRMACION_GMAIL', resolved: !!cliente, codigo: conf.codigo },
    }
  }

  // ---- 2. Descargar PDFs (igual que antes) ----
  // Si vienen attachments inline en el payload (modelo viejo o tests) usarlos;
  // sino, descargarlos via API de Resend con el email_id.
  let pdfBuffers: PdfAdjunto[] = []
  const inlineWithContent = metaAdjuntos.filter((a) => typeof a.content === 'string' && a.content.length > 0)
  if (inlineWithContent.length > 0) {
    for (const a of inlineWithContent) {
      if (!esPdf(a)) continue
      pdfBuffers.push({
        filename: a.filename || 'documento.pdf',
        content_type: a.content_type || 'application/pdf',
        buffer: Buffer.from(a.content as string, 'base64'),
      })
    }
  } else if (emailId) {
    try {
      pdfBuffers = await deps.descargarPdfs(emailId)
    } catch (err) {
      console.error('Error fetching attachments from Resend API:', err)
      await deps.registrar({
        ...base,
        clienteId: null,
        resultado: 'ERROR',
        detalle: `No se pudieron descargar los adjuntos de Resend: ${(err as Error).message}`.slice(0, 500),
        adjuntos: metaAdjuntos.length,
        extra: {},
      })
      // 500 para que Resend reintente.
      return {
        status: 500,
        body: { received: true, error: 'failed_to_fetch_attachments', detail: (err as Error).message },
      }
    }
  }

  // ---- 3. Maxirest (sin cambios de comportamiento) ----
  if (pdfBuffers.length > 0 && deps.esMaxirest({ from, subject })) {
    const results: Array<{ filename: string; status: string; message: string; nroCierre?: number | undefined }> = []
    let okCount = 0
    let clienteMaxirest: string | null = null
    for (const pdf of pdfBuffers) {
      const r = await deps.ingestMaxirest(pdf.buffer, { source: 'EMAIL', forwardedBy: from, filename: pdf.filename })
      results.push({ filename: pdf.filename, status: r.status, message: r.message, nroCierre: r.nroCierre })
      if (r.status === 'OK') okCount++
      if (r.clienteId) {
        clienteMaxirest = r.clienteId
        await deps.logProcesamiento({
          clienteId: r.clienteId,
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
        })
      }
    }
    await deps.registrar({
      ...base,
      clienteId: clienteMaxirest,
      resultado: 'MAXIREST',
      detalle: results.map((r) => `${r.filename}: ${r.status}${r.nroCierre ? ` (cierre ${r.nroCierre})` : ''}`).join('; '),
      adjuntos: pdfBuffers.length,
      extra: { results },
    })
    return {
      status: 200,
      body: { received: true, processed: okCount, total: pdfBuffers.length, flow: 'MAXIREST', results },
    }
  }

  // ---- 4. Resolver empresa: casilla (destinatario) y si no, remitente ----
  let cliente: ClienteResuelto | null = null
  let direcciones: string[] = []
  try {
    const r = await resolverPorCasilla(data, emailId, deps)
    cliente = r.cliente
    direcciones = r.direcciones
  } catch (err) {
    // Ej.: columna casillaEmail todavía no migrada. Seguimos con el flujo viejo.
    console.error('Error resolviendo casilla:', err)
  }
  if (!cliente && remitente) {
    const r = await deps.resolverRemitente(remitente)
    if (r) cliente = { clienteId: r.clienteId, cuit: r.cuit, userId: r.userId, via: 'REMITENTE' }
  }

  if (!cliente) {
    console.warn(`Email inbound no resuelto: from=${remitente} to=${destinatario}`)
    await deps.registrar({
      ...base,
      clienteId: null,
      resultado: 'NO_RESUELTO',
      detalle: `Ninguna casilla de empresa entre los destinatarios (${direcciones.join(', ') || 'sin destinatarios'}) y el remitente no es un usuario`,
      adjuntos: pdfBuffers.length,
      extra: { direcciones },
    })
    return { status: 200, body: { received: true, processed: 0, unresolved: true } }
  }

  const extraBase = { via: cliente.via, casilla: cliente.casilla ?? null }

  if (pdfBuffers.length === 0) {
    const otros = metaAdjuntos.map((a) => a.filename).filter(Boolean) as string[]
    await deps.registrar({
      ...base,
      clienteId: cliente.clienteId,
      resultado: 'SIN_ADJUNTO',
      detalle: otros.length
        ? `Sin PDF (adjuntos: ${otros.join(', ')}). Revisar a mano`
        : 'Sin adjunto PDF. Revisar a mano (puede ser un link al portal del proveedor o a ARCA)',
      adjuntos: metaAdjuntos.length,
      extra: { ...extraBase, adjuntos: otros },
    })
    return { status: 200, body: { received: true, processed: 0, attachments: metaAdjuntos.length, emailId: emailId ?? null } }
  }

  // ---- 5. Subir PDFs a inbox/ para el worker OCR ----
  // El worker ya deduplica por sha256 contra documentos.hashSha256; acá
  // consultamos lo mismo solo para no subir de nuevo y mostrar DUPLICADO.
  const bucket = `axp-client-${cliente.cuit}`
  let uploaded = 0
  const duplicados: string[] = []
  const errores: string[] = []
  const subidos: string[] = []
  for (const pdf of pdfBuffers) {
    try {
      const sha256 = crypto.createHash('sha256').update(pdf.buffer).digest('hex')
      if (await deps.existeDocumentoConHash(cliente.clienteId, sha256)) {
        duplicados.push(pdf.filename)
        continue
      }
      const timestamp = (deps.ahora?.() ?? new Date()).toISOString().replace(/[:.]/g, '-')
      const key = `inbox/${timestamp}_${sha256.slice(0, 8)}_${nombreSeguroPdf(pdf.filename)}`
      const metadata: Record<string, string> = { source: 'EMAIL', forwardedBy: remitente.replace(/[^\x20-\x7e]/g, '') }
      if (cliente.userId) metadata.userId = cliente.userId
      if (emailId) metadata.emailId = emailId
      await deps.subirAInbox(bucket, key, pdf.buffer, metadata)
      uploaded++
      subidos.push(pdf.filename)
    } catch (err) {
      console.error(`Failed to upload attachment ${pdf.filename}:`, err)
      errores.push(pdf.filename)
    }
  }

  const resultado: ResultadoEmail =
    uploaded > 0 ? 'PROCESADO' : duplicados.length > 0 && errores.length === 0 ? 'DUPLICADO' : 'ERROR'
  const partes: string[] = []
  if (uploaded) partes.push(`${uploaded} PDF${uploaded > 1 ? 's' : ''} enviado${uploaded > 1 ? 's' : ''} a procesar`)
  if (duplicados.length) partes.push(`ya cargado${duplicados.length > 1 ? 's' : ''}: ${duplicados.join(', ')}`)
  if (errores.length) partes.push(`error al subir: ${errores.join(', ')}`)

  await deps.logProcesamiento({
    clienteId: cliente.clienteId,
    level: errores.length ? 'WARN' : 'INFO',
    source: 'EMAIL_INBOUND',
    message: `Email inbound procesado: ${uploaded} PDFs de ${remitente}`,
    details: {
      forwardedBy: remitente,
      subject,
      emailId: emailId ?? null,
      userId: cliente.userId ?? null,
      via: cliente.via,
      casilla: cliente.casilla ?? null,
      uploaded,
      duplicados: duplicados.length,
      total: pdfBuffers.length,
    },
  })
  await deps.registrar({
    ...base,
    clienteId: cliente.clienteId,
    resultado,
    detalle: partes.join('; '),
    adjuntos: pdfBuffers.length,
    extra: { ...extraBase, subidos, duplicados, errores },
  })

  return {
    status: 200,
    body: { received: true, processed: uploaded, duplicados: duplicados.length, flow: 'INVOICE', via: cliente.via },
  }
}
