import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { downloadFromR2, uploadToR2 } from '@/lib/r2/client'

export const dynamic = 'force-dynamic'

const BUCKET = process.env.R2_BUCKET_NAME || ''
const TIPOS: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
}
const MAX_BYTES = 2 * 1024 * 1024

async function prefijo(clienteId: string) {
  const [c] = await prisma.$queryRaw<Array<{ r2Prefix: string }>>`
    SELECT "r2Prefix" FROM clientes WHERE id = ${clienteId}::uuid
  `
  return c?.r2Prefix ?? null
}

/**
 * Sube el logo de un proveedor. Acepta archivo o pegado desde el portapapeles
 * (el navegador manda un File igual en los dos casos).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_PROVEEDORES, 'edit')
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })
  const { id } = await params

  const [prov] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM proveedores WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const ext = TIPOS[file.type]
  if (!ext) return NextResponse.json({ error: 'Usá PNG, WEBP, JPG o SVG' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El logo supera los 2 MB' }, { status: 400 })

  const pre = await prefijo(clienteId!)
  if (!pre) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Key única por subida: si se reusara, el navegador seguiría mostrando el
  // logo viejo por el cache de un año.
  const key = `${pre}/proveedores/${id}-${Date.now()}.${ext}`
  await uploadToR2(BUCKET, key, Buffer.from(await file.arrayBuffer()), undefined, file.type)
  await prisma.$executeRaw`UPDATE proveedores SET "logoKey" = ${key}, "updatedAt" = NOW() WHERE id = ${id}::uuid`

  return NextResponse.json({ logoKey: key })
}

/** Quita el logo. El objeto queda en R2: borrarlo rompería un cache vigente. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_PROVEEDORES, 'edit')
  if (error) return error
  const { id } = await params
  await prisma.$executeRaw`
    UPDATE proveedores SET "logoKey" = NULL, "updatedAt" = NOW()
     WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}

/** Sirve el logo. El bucket es privado, así que pasa por acá. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_PROVEEDORES)
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })
  const { id } = await params

  const [prov] = await prisma.$queryRaw<Array<{ logoKey: string | null }>>`
    SELECT "logoKey" FROM proveedores WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  const pre = await prefijo(clienteId!)
  // Se valida el prefijo igual que en las otras rutas: sin eso, una key
  // manipulada leería el bucket de otra empresa.
  if (!prov?.logoKey || !pre || !prov.logoKey.startsWith(`${pre}/`)) {
    return NextResponse.json({ error: 'Sin logo' }, { status: 404 })
  }

  try {
    const buf = await downloadFromR2(BUCKET, prov.logoKey)
    const ext = prov.logoKey.split('.').pop()?.toLowerCase()
    const tipo =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg'
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=31536000, immutable' },
    })
  } catch {
    return NextResponse.json({ error: 'Sin logo' }, { status: 404 })
  }
}
