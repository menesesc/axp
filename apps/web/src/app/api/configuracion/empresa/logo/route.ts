import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { downloadFromR2, uploadToR2 } from '@/lib/r2/client'

export const dynamic = 'force-dynamic'

const BUCKET = process.env.R2_BUCKET_NAME || ''
const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }
const MAX_BYTES = 2 * 1024 * 1024

/** Sube el logo de la empresa y lo deja guardado en `clientes.logoKey`. */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const ext = TIPOS[file.type]
  if (!ext) return NextResponse.json({ error: 'Usá PNG, WEBP o JPG' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El logo supera los 2 MB' }, { status: 400 })

  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId! }, select: { r2Prefix: true } })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Nombre único por subida: si se reusara la key, el navegador seguiría
  // mostrando el logo viejo por el cache.
  const key = `${cliente.r2Prefix}/marca/logo-${Date.now()}.${ext}`
  await uploadToR2(BUCKET, key, Buffer.from(await file.arrayBuffer()), undefined, file.type)
  await prisma.clientes.update({ where: { id: clienteId! }, data: { logoKey: key } })

  return NextResponse.json({ logoKey: key })
}

/**
 * Sirve el logo. Lo puede ver cualquiera con sesión en la empresa: aparece en
 * el encabezado del recetario, no solo en Configuración.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })

  const key = request.nextUrl.searchParams.get('key') || ''
  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId! }, select: { r2Prefix: true, logoKey: true } })
  const final = key || cliente?.logoKey || ''
  if (!cliente || !final || !final.startsWith(`${cliente.r2Prefix}/`)) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const buf = await downloadFromR2(BUCKET, final)
    const ext = final.split('.').pop()?.toLowerCase()
    const tipo = ext === 'webp' ? 'image/webp' : ext === 'jpg' ? 'image/jpeg' : 'image/png'
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=31536000, immutable' },
    })
  } catch {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
}
