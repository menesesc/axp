import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { downloadFromR2 } from '@/lib/r2/client'

export const dynamic = 'force-dynamic'

const BUCKET = process.env.R2_BUCKET_NAME || ''

/**
 * El logo de la empresa para el encabezado del presupuesto. El de
 * Configuración (/api/configuracion/empresa/logo) pide el permiso del
 * recetario; quien arma presupuestos no tiene por qué tenerlo.
 */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })
  const [c] = await prisma.$queryRaw<Array<{ r2Prefix: string; logoKey: string | null }>>`
    SELECT "r2Prefix", "logoKey" FROM clientes WHERE id = ${clienteId!}::uuid
  `
  if (!c?.logoKey || !c.logoKey.startsWith(`${c.r2Prefix}/`)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  try {
    const buf = await downloadFromR2(BUCKET, c.logoKey)
    const ext = c.logoKey.split('.').pop()?.toLowerCase()
    const tipo = ext === 'webp' ? 'image/webp' : ext === 'jpg' ? 'image/jpeg' : 'image/png'
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=3600' } })
  } catch {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
}
