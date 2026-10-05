import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { downloadFromR2, uploadToR2 } from '@/lib/r2/client'

export const dynamic = 'force-dynamic'

const BUCKET = process.env.R2_BUCKET_NAME || ''
const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Sube la foto de una receta a R2, bajo el prefijo del cliente.
 *
 * Devuelve la key, que se guarda en `recetas.fotoKey`. La imagen no se sirve
 * directo desde R2 (el bucket es privado): se lee por GET de esta misma ruta.
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const ext = TIPOS[file.type]
  if (!ext) return NextResponse.json({ error: 'Formato no soportado. Usá JPG, PNG o WEBP.' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'La imagen supera los 8 MB' }, { status: 400 })
  }

  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId! }, select: { r2Prefix: true } })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const key = `${cliente.r2Prefix}/recetas/${crypto.randomUUID()}.${ext}`
  await uploadToR2(BUCKET, key, Buffer.from(await file.arrayBuffer()), undefined, file.type)

  return NextResponse.json({ fotoKey: key })
}

/**
 * Sirve una foto. Se valida que la key pertenezca al prefijo del cliente: sin
 * eso, cualquiera con sesión podría leer el bucket de otra empresa cambiando
 * el querystring.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })

  const key = request.nextUrl.searchParams.get('key') || ''
  if (!key) return NextResponse.json({ error: 'Falta la key' }, { status: 400 })

  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId! }, select: { r2Prefix: true } })
  if (!cliente || !key.startsWith(`${cliente.r2Prefix}/`)) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  try {
    const buf = await downloadFromR2(BUCKET, key)
    const ext = key.split('.').pop()?.toLowerCase()
    const tipo = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': tipo,
        // Las fotos no cambian: la key es única por subida.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }
}
