import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { CASILLA_DOMINIO, esLinkGoogleSeguro, validarCasilla } from '@/lib/email/inbound'

export const dynamic = 'force-dynamic'

interface EmailRecibidoRow {
  id: string
  fecha: Date
  remitente: string
  destinatario: string
  asunto: string
  resultado: string
  detalle: string | null
  adjuntos: number
  extra: Record<string, unknown> | null
}

export async function GET() {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const [cliente] = await prisma.$queryRaw<Array<{ r2Prefix: string; cuit: string; casillaEmail: string | null }>>`
      SELECT "r2Prefix", "cuit", "casillaEmail" FROM "clientes" WHERE "id" = ${clienteId}::uuid
    `

    if (!cliente) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    // Últimos emails que entraron a la casilla de la empresa.
    const recibidos = await prisma.$queryRaw<EmailRecibidoRow[]>`
      SELECT "id", "fecha", "remitente", "destinatario", "asunto", "resultado",
             "detalle", "adjuntos", "extra"
        FROM "email_recibidos"
       WHERE "clienteId" = ${clienteId}::uuid
       ORDER BY "fecha" DESC
       LIMIT 50
    `

    const emails = recibidos.map((r) => {
      const extra = r.extra ?? {}
      const link = typeof extra.link === 'string' && esLinkGoogleSeguro(extra.link) ? extra.link : null
      return {
        id: r.id,
        fecha: r.fecha,
        remitente: r.remitente,
        destinatario: r.destinatario,
        asunto: r.asunto,
        resultado: r.resultado,
        detalle: r.detalle,
        adjuntos: r.adjuntos,
        codigo: typeof extra.codigo === 'string' ? extra.codigo : null,
        link,
        solicitante: typeof extra.solicitante === 'string' ? extra.solicitante : null,
      }
    })

    const canales = {
      email: {
        casilla: cliente.casillaEmail,
        dominio: CASILLA_DOMINIO,
        direccion: cliente.casillaEmail ? `${cliente.casillaEmail}@${CASILLA_DOMINIO}` : null,
      },
      whatsapp: {
        habilitado: false,
        numero: null,
        webhook_url: null,
      },
      sftp: {
        habilitado: true,
        ruta: `/${cliente.r2Prefix}/incoming`,
      },
    }

    return NextResponse.json({ canales, emails })
  } catch (error) {
    console.error('Error fetching canales:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Cambia la casilla de email de la empresa (slug antes de @axp.com.ar). */
export async function PATCH(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as { casillaEmail?: unknown }
    if (typeof body.casillaEmail !== 'string') {
      return NextResponse.json({ error: 'Falta casillaEmail' }, { status: 400 })
    }

    const casilla = body.casillaEmail.trim().toLowerCase().replace(new RegExp(`@${CASILLA_DOMINIO}$`), '')
    const invalida = validarCasilla(casilla)
    if (invalida) {
      return NextResponse.json({ error: invalida }, { status: 400 })
    }

    const [ocupada] = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "clientes" WHERE "casillaEmail" = ${casilla} AND "id" <> ${clienteId}::uuid
    `
    if (ocupada) {
      return NextResponse.json({ error: 'Esa casilla ya está en uso' }, { status: 409 })
    }

    await prisma.$executeRaw`
      UPDATE "clientes" SET "casillaEmail" = ${casilla}, "updatedAt" = now()
       WHERE "id" = ${clienteId}::uuid
    `

    return NextResponse.json({ success: true, casilla, direccion: `${casilla}@${CASILLA_DOMINIO}` })
  } catch (error) {
    // Carrera con otra empresa tomando la misma casilla (índice único).
    if ((error as { code?: string; meta?: { code?: string } })?.meta?.code === '23505') {
      return NextResponse.json({ error: 'Esa casilla ya está en uso' }, { status: 409 })
    }
    console.error('Error updating canales:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
