import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { cifrar, hayClaveMaestra } from '@/lib/cripto'

export const dynamic = 'force-dynamic'

/**
 * Integraciones con otros sistemas.
 *
 * La clave de API nunca vuelve al navegador: se guarda cifrada y la pantalla
 * muestra los últimos cuatro caracteres, que alcanzan para reconocer cuál
 * está cargada.
 */

const SISTEMAS = ['presentia']

export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION)
  if (error) return error

  const filas = await prisma.$queryRaw<
    Array<{
      sistema: string
      baseUrl: string | null
      apiKeyCola: string | null
      activa: boolean
      config: unknown
      ultimaSync: string | null
      ultimoError: string | null
    }>
  >`
    SELECT sistema, "baseUrl", "apiKeyCola", activa, config,
           to_char("ultimaSync", 'YYYY-MM-DD"T"HH24:MI:SS') AS "ultimaSync", "ultimoError"
      FROM integraciones WHERE "clienteId" = ${clienteId}::uuid ORDER BY sistema
  `
  return NextResponse.json({ integraciones: filas, cifradoListo: hayClaveMaestra() })
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { sistema?: string; baseUrl?: string; apiKey?: string; activa?: boolean; config?: Record<string, unknown> }
    | null
  if (!b?.sistema || !SISTEMAS.includes(b.sistema)) {
    return NextResponse.json({ error: 'Sistema desconocido' }, { status: 400 })
  }

  let enc: string | null = null
  let cola: string | null = null
  if (b.apiKey) {
    enc = cifrar(b.apiKey.trim())
    if (!enc) {
      return NextResponse.json(
        { error: 'Falta APP_SECRET en el servidor: sin eso la clave quedaría guardada en claro' },
        { status: 503 }
      )
    }
    cola = b.apiKey.trim().slice(-4)
  }

  await prisma.$executeRaw`
    INSERT INTO integraciones ("clienteId", sistema, "baseUrl", "apiKeyEnc", "apiKeyCola", activa, config)
    VALUES (${clienteId}::uuid, ${b.sistema}, ${b.baseUrl?.trim() || null}, ${enc}, ${cola},
            ${b.activa ?? false}, ${JSON.stringify(b.config ?? {})}::jsonb)
    ON CONFLICT ("clienteId", sistema) DO UPDATE SET
      "baseUrl"    = COALESCE(EXCLUDED."baseUrl", integraciones."baseUrl"),
      "apiKeyEnc"  = COALESCE(EXCLUDED."apiKeyEnc", integraciones."apiKeyEnc"),
      "apiKeyCola" = COALESCE(EXCLUDED."apiKeyCola", integraciones."apiKeyCola"),
      activa       = EXCLUDED.activa,
      config       = EXCLUDED.config,
      "updatedAt"  = now()
  `
  return NextResponse.json({ ok: true })
}
