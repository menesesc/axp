import { afterEach, describe, expect, test } from 'bun:test'
import {
  casillasCandidatas,
  direccionesDeHeaders,
  extraerConfirmacionGmail,
  extraerDirecciones,
  procesarEmailInbound,
  validarCasilla,
  type InboundDeps,
  type PdfAdjunto,
  type RegistroEmail,
  type ResendReceivedEmail,
} from '../inbound'
import { fetchReceivedEmail } from '../resend-attachments'

const WALPINA = { clienteId: '081c9039-9236-4f33-a29a-c63f88bc2e58', cuit: '30719238692', casilla: 'walpina' }
const PDF: PdfAdjunto = { filename: 'Factura A 0001-00001234.pdf', content_type: 'application/pdf', buffer: Buffer.from('%PDF-1.4 factura') }

interface Fake {
  deps: InboundDeps
  registros: RegistroEmail[]
  subidas: Array<{ bucket: string; key: string; metadata: Record<string, string> }>
  casillasBuscadas: string[][]
  obtenerEmailLlamadas: string[]
  maxirest: string[]
}

/** Deps en memoria: R2, Resend y la base mockeados. */
function fake(opts: {
  pdfs?: PdfAdjunto[]
  email?: ResendReceivedEmail
  hashesExistentes?: string[]
  usuarios?: Record<string, { clienteId: string; cuit: string; userId: string }>
  casillaRompe?: boolean
  descargaRompe?: boolean
} = {}): Fake {
  const f: Fake = { deps: null as unknown as InboundDeps, registros: [], subidas: [], casillasBuscadas: [], obtenerEmailLlamadas: [], maxirest: [] }
  f.deps = {
    async buscarClientePorCasilla(slugs) {
      f.casillasBuscadas.push(slugs)
      if (opts.casillaRompe) throw new Error('column "casillaEmail" does not exist')
      return slugs.includes('walpina') ? WALPINA : null
    },
    async resolverRemitente(email) {
      return opts.usuarios?.[email] ?? null
    },
    async obtenerEmail(id) {
      f.obtenerEmailLlamadas.push(id)
      if (!opts.email) throw new Error('404')
      return opts.email
    },
    async descargarPdfs() {
      if (opts.descargaRompe) throw new Error('Resend list attachments failed: 500')
      return opts.pdfs ?? []
    },
    async existeDocumentoConHash(_c, sha) {
      return (opts.hashesExistentes ?? []).includes(sha)
    },
    async subirAInbox(bucket, key, _b, metadata) {
      f.subidas.push({ bucket, key, metadata })
    },
    esMaxirest: ({ from, subject }) => from === 'fdtmaxisistemas@gmail.com' || /maxirest.*fin\s+de\s+turno/i.test(subject),
    async ingestMaxirest(_b, o) {
      f.maxirest.push(o.filename)
      return { status: 'OK', message: 'Cierre 123 guardado', clienteId: WALPINA.clienteId, nroCierre: 123 }
    },
    async logProcesamiento() {},
    async registrar(row) {
      f.registros.push(row)
    },
    ahora: () => new Date('2026-11-19T12:00:00Z'),
  }
  return f
}

function evento(data: Record<string, unknown>) {
  return {
    type: 'email.received',
    created_at: '2026-11-19T12:00:00.000Z',
    data: { email_id: 'em_1', created_at: '2026-11-19T11:59:59.000Z', bcc: [], cc: [], ...data },
  }
}

describe('direcciones y casillas', () => {
  test('extrae direcciones de strings con nombre, listas y objetos', () => {
    expect(extraerDirecciones(['Walpina <Walpina@AXP.com.ar>', 'a@b.com, c@d.com', { address: 'x@y.com' }])).toEqual([
      'walpina@axp.com.ar',
      'a@b.com',
      'c@d.com',
      'x@y.com',
    ])
  })

  test('casillas: solo @axp.com.ar, sin +etiqueta y sin reservadas', () => {
    expect(
      casillasCandidatas(['inbox@axp.com.ar', 'walpina+facturas@axp.com.ar', 'walpina@otro.com', 'pagos@axp.com.ar'])
    ).toEqual(['walpina'])
  })

  test('headers de reenvío como objeto o como lista', () => {
    expect(direccionesDeHeaders({ 'X-Forwarded-To': 'walpina@axp.com.ar', subject: 'x@y.com' })).toEqual([
      'walpina@axp.com.ar',
    ])
    expect(direccionesDeHeaders([{ name: 'Delivered-To', value: ['walpina@axp.com.ar'] }])).toEqual(['walpina@axp.com.ar'])
  })

  test('validarCasilla', () => {
    expect(validarCasilla('walpina')).toBeNull()
    expect(validarCasilla('walpina-norte.2')).toBeNull()
    expect(validarCasilla('inbox')).toContain('reservada')
    expect(validarCasilla('Walpina')).not.toBeNull()
    expect(validarCasilla('-walpina')).not.toBeNull()
    expect(validarCasilla('a..b')).not.toBeNull()
    expect(validarCasilla('')).not.toBeNull()
  })
})

describe('facturas por casilla', () => {
  test('directo a walpina@ con PDF: sube a inbox/ del bucket del cliente, cualquier remitente', async () => {
    const f = fake({ pdfs: [PDF] })
    const r = await procesarEmailInbound(
      evento({ from: 'Proveedor SA <facturacion@proveedor.com>', to: ['walpina@axp.com.ar'], subject: 'Factura 1234' }),
      f.deps
    )
    expect(r.status).toBe(200)
    expect(r.body.processed).toBe(1)
    expect(f.subidas).toHaveLength(1)
    expect(f.subidas[0]!.bucket).toBe('axp-client-30719238692')
    expect(f.subidas[0]!.key).toMatch(/^inbox\/.+\.pdf$/)
    expect(f.subidas[0]!.metadata).toMatchObject({ source: 'EMAIL', forwardedBy: 'facturacion@proveedor.com', emailId: 'em_1' })
    expect(f.registros).toHaveLength(1)
    expect(f.registros[0]).toMatchObject({ clienteId: WALPINA.clienteId, resultado: 'PROCESADO', remitente: 'facturacion@proveedor.com', adjuntos: 1 })
    // No hizo falta pedir headers.
    expect(f.obtenerEmailLlamadas).toHaveLength(0)
  })

  test('en cc también cuenta', async () => {
    const f = fake({ pdfs: [PDF] })
    await procesarEmailInbound(evento({ from: 'a@b.com', to: ['otro@cliente.com'], cc: ['walpina@axp.com.ar'] }), f.deps)
    expect(f.registros[0]!.resultado).toBe('PROCESADO')
  })

  test('auto-reenvío de Gmail: To es el original, la casilla viene en received_for (webhook)', async () => {
    const f = fake({ pdfs: [PDF] })
    await procesarEmailInbound(
      evento({
        from: 'facturacion@proveedor.com',
        to: ['administracion@walpina.com.ar'],
        received_for: ['walpina@axp.com.ar'],
        subject: 'Factura',
      }),
      f.deps
    )
    expect(f.registros[0]).toMatchObject({ resultado: 'PROCESADO', clienteId: WALPINA.clienteId })
    expect(f.obtenerEmailLlamadas).toHaveLength(0)
  })

  test('auto-reenvío de Gmail sin received_for: busca en headers vía API (X-Forwarded-To / Delivered-To)', async () => {
    const f = fake({
      pdfs: [PDF],
      email: {
        id: 'em_1',
        to: ['administracion@walpina.com.ar'],
        headers: {
          'delivered-to': 'walpina@axp.com.ar',
          'x-forwarded-to': 'walpina@axp.com.ar',
          'x-forwarded-for': 'administracion@walpina.com.ar walpina@axp.com.ar',
          from: 'Proveedor <facturacion@proveedor.com>',
        },
      },
    })
    await procesarEmailInbound(
      evento({ from: 'facturacion@proveedor.com', to: ['administracion@walpina.com.ar'], subject: 'Factura' }),
      f.deps
    )
    expect(f.obtenerEmailLlamadas).toEqual(['em_1'])
    expect(f.registros[0]).toMatchObject({ resultado: 'PROCESADO', clienteId: WALPINA.clienteId })
  })

  test('sin PDF (link al portal / ARCA): SIN_ADJUNTO con asunto y remitente', async () => {
    const f = fake({ pdfs: [] })
    await procesarEmailInbound(
      evento({
        from: 'no-reply@portalproveedor.com',
        to: ['walpina@axp.com.ar'],
        subject: 'Tu factura está disponible',
        attachments: [{ id: 'a1', filename: 'logo.png', content_type: 'image/png' }],
      }),
      f.deps
    )
    expect(f.subidas).toHaveLength(0)
    expect(f.registros[0]).toMatchObject({
      resultado: 'SIN_ADJUNTO',
      clienteId: WALPINA.clienteId,
      asunto: 'Tu factura está disponible',
      remitente: 'no-reply@portalproveedor.com',
    })
    expect(f.registros[0]!.detalle).toContain('logo.png')
  })

  test('mismo PDF ya cargado (sha256 en documentos): DUPLICADO y no se sube', async () => {
    const crypto = await import('crypto')
    const sha = crypto.createHash('sha256').update(PDF.buffer).digest('hex')
    const f = fake({ pdfs: [PDF], hashesExistentes: [sha] })
    await procesarEmailInbound(evento({ from: 'a@b.com', to: ['walpina@axp.com.ar'] }), f.deps)
    expect(f.subidas).toHaveLength(0)
    expect(f.registros[0]!.resultado).toBe('DUPLICADO')
  })

  test('PDF sin extensión en el nombre: la clave igual termina en .pdf (el worker filtra por eso)', async () => {
    const f = fake({ pdfs: [{ ...PDF, filename: 'factura' }] })
    await procesarEmailInbound(evento({ from: 'a@b.com', to: ['walpina@axp.com.ar'] }), f.deps)
    expect(f.subidas[0]!.key).toMatch(/_factura\.pdf$/)
  })
})

describe('fallback y no resueltos', () => {
  test('inbox@ con remitente usuario: flujo viejo por resolveSender', async () => {
    const f = fake({
      pdfs: [PDF],
      email: { id: 'em_1', headers: {} },
      usuarios: { 'admin@walpina.com.ar': { clienteId: WALPINA.clienteId, cuit: WALPINA.cuit, userId: 'u1' } },
    })
    const r = await procesarEmailInbound(evento({ from: 'Admin <admin@walpina.com.ar>', to: ['inbox@axp.com.ar'] }), f.deps)
    expect(r.body.via).toBe('REMITENTE')
    expect(f.subidas[0]!.metadata.userId).toBe('u1')
    expect(f.registros[0]!.resultado).toBe('PROCESADO')
  })

  test('si la búsqueda por casilla falla (columna sin migrar) sigue por remitente', async () => {
    const f = fake({
      pdfs: [PDF],
      casillaRompe: true,
      usuarios: { 'admin@walpina.com.ar': { clienteId: WALPINA.clienteId, cuit: WALPINA.cuit, userId: 'u1' } },
    })
    const r = await procesarEmailInbound(evento({ from: 'admin@walpina.com.ar', to: ['walpina@axp.com.ar'] }), f.deps)
    expect(r.status).toBe(200)
    expect(r.body.via).toBe('REMITENTE')
  })

  test('nada resuelve: NO_RESUELTO sin cliente, 200 (no se descarta en silencio)', async () => {
    const f = fake({ pdfs: [PDF], email: { id: 'em_1', headers: { 'delivered-to': 'cualquiera@axp.com.ar' } } })
    const r = await procesarEmailInbound(evento({ from: 'spam@x.com', to: ['cualquiera@axp.com.ar'] }), f.deps)
    expect(r.status).toBe(200)
    expect(r.body.unresolved).toBe(true)
    expect(f.subidas).toHaveLength(0)
    expect(f.registros[0]).toMatchObject({ resultado: 'NO_RESUELTO', clienteId: null })
  })

  test('falla la descarga de adjuntos: ERROR y 500 para que Resend reintente', async () => {
    const f = fake({ descargaRompe: true })
    const r = await procesarEmailInbound(evento({ from: 'a@b.com', to: ['walpina@axp.com.ar'] }), f.deps)
    expect(r.status).toBe(500)
    expect(f.registros[0]!.resultado).toBe('ERROR')
  })
})

describe('Maxirest sin cambios', () => {
  test('cierre Maxirest va por ingestMaxirest, sin mirar casillas', async () => {
    const f = fake({ pdfs: [{ ...PDF, filename: 'cierre.pdf' }] })
    const r = await procesarEmailInbound(
      evento({ from: 'fdtmaxisistemas@gmail.com', to: ['inbox@axp.com.ar'], subject: 'MaxiREST - Fin de turno - 18/11/2026 Noche' }),
      f.deps
    )
    expect(r.body.flow).toBe('MAXIREST')
    expect(r.body.processed).toBe(1)
    expect(f.maxirest).toEqual(['cierre.pdf'])
    expect(f.casillasBuscadas).toHaveLength(0)
    expect(f.subidas).toHaveLength(0)
    expect(f.registros[0]).toMatchObject({ resultado: 'MAXIREST', clienteId: WALPINA.clienteId })
  })
})

describe('confirmación de reenvío de Gmail', () => {
  const LINK = 'https://mail-settings.google.com/mail/vf-%5BANGjdJ_abc123%5D-XyZ_456'
  const textoEn = `juan.walpina@gmail.com has requested to automatically forward mail to your email
address walpina@axp.com.ar.
Confirmation code: 987654321

To allow juan.walpina@gmail.com to automatically forward mail to your address,
please click the link below to confirm the request:

${LINK}

If you click the link and it appears to be broken, please copy and paste it
into a new browser window.`

  test('inglés: guarda código, link y quién lo pidió', async () => {
    const f = fake({ email: { id: 'em_g', text: textoEn, html: null } })
    const r = await procesarEmailInbound(
      evento({
        email_id: 'em_g',
        from: 'Gmail Team <forwarding-noreply@google.com>',
        to: ['walpina@axp.com.ar'],
        subject: '(#987654321) Gmail Forwarding Confirmation - Receive Mail from juan.walpina@gmail.com',
      }),
      f.deps
    )
    expect(r.body.flow).toBe('CONFIRMACION_GMAIL')
    expect(f.registros[0]).toMatchObject({ resultado: 'CONFIRMACION_GMAIL', clienteId: WALPINA.clienteId })
    expect(f.registros[0]!.extra).toEqual({ codigo: '987654321', link: LINK, solicitante: 'juan.walpina@gmail.com' })
  })

  test('castellano y solo HTML', () => {
    const html = `<p>juan@gmail.com solicitó reenviar automáticamente correos a tu dirección walpina@axp.com.ar.</p>
<p>Código de confirmación: 123456789</p>
<p><a href="https://mail-settings.google.com/mail/vf-%5BAB%5D-cd?x=1&amp;y=2">https://mail-settings.google.com/mail/vf-%5BAB%5D-cd?x=1&amp;y=2</a></p>`
    const c = extraerConfirmacionGmail({
      subject: '(n.º 123456789) Confirmación de reenvío de Gmail: recibir correo de juan@gmail.com',
      html,
    })
    expect(c.codigo).toBe('123456789')
    expect(c.link).toBe('https://mail-settings.google.com/mail/vf-%5BAB%5D-cd?x=1&y=2')
    expect(c.solicitante).toBe('juan@gmail.com')
  })

  test('links que no son de google no se guardan', () => {
    const c = extraerConfirmacionGmail({
      subject: '(#111222333) Gmail Forwarding Confirmation',
      text: 'Confirmation code: 111222333\nhttps://evil.example.com/mail/vf-123\nhttps://google.com.evil.io/mail/vf-1',
    })
    expect(c.codigo).toBe('111222333')
    expect(c.link).toBeNull()
  })

  test('si Resend no devuelve el cuerpo igual se registra con el código del asunto', async () => {
    const f = fake({})
    await procesarEmailInbound(
      evento({
        from: 'forwarding-noreply@google.com',
        to: ['walpina@axp.com.ar'],
        subject: '(#555666777) Gmail Forwarding Confirmation - Receive Mail from x@gmail.com',
      }),
      f.deps
    )
    expect(f.registros[0]!.resultado).toBe('CONFIRMACION_GMAIL')
    expect(f.registros[0]!.extra.codigo).toBe('555666777')
  })
})

describe('fetchReceivedEmail (Resend API mockeada)', () => {
  const fetchOriginal = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = fetchOriginal
  })

  test('pega a /emails/receiving/{id} con la API key y devuelve headers/text', async () => {
    process.env.RESEND_API_KEY = 're_test'
    let url = ''
    let auth = ''
    globalThis.fetch = (async (u: string, init?: RequestInit) => {
      url = u
      auth = (init?.headers as Record<string, string>).Authorization!
      return new Response(
        JSON.stringify({ object: 'email', id: 'em_1', text: 'hola', headers: { 'delivered-to': 'walpina@axp.com.ar' }, received_for: ['walpina@axp.com.ar'] }),
        { status: 200 }
      )
    }) as typeof fetch
    const e = await fetchReceivedEmail('em_1')
    expect(url).toBe('https://api.resend.com/emails/receiving/em_1')
    expect(auth).toBe('Bearer re_test')
    expect(e.text).toBe('hola')
    expect(direccionesDeHeaders(e.headers)).toEqual(['walpina@axp.com.ar'])
  })
})
