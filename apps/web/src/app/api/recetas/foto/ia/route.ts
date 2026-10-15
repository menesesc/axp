import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { uploadToR2 } from '@/lib/r2/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BUCKET = process.env.R2_BUCKET_NAME || ''

/**
 * Foto del plato generada por IA.
 *
 * Es una foto de referencia, no la del plato de la casa: sirve para que la
 * ficha no quede gris y para que el cocinero vea el emplatado propuesto. La
 * de verdad, cuando el plato existe, se sube con el botón de al lado y pisa
 * a esta.
 *
 * Claude no genera imágenes, así que esto va contra un modelo de imagen
 * aparte. Sin la clave configurada la ruta avisa y no pasa nada más: el
 * resto del recetario funciona igual.
 */

interface Cuerpo {
  titulo?: string
  descripcion?: string
  /** Los ingredientes principales, para que la foto se parezca al plato. */
  ingredientes?: string[]
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  if (!BUCKET) return NextResponse.json({ error: 'R2 no está configurado' }, { status: 503 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Para sugerir fotos falta configurar OPENAI_API_KEY en el servidor' },
      { status: 503 }
    )
  }

  const b = (await request.json().catch(() => null)) as Cuerpo | null
  const titulo = String(b?.titulo || '').trim()
  if (!titulo) return NextResponse.json({ error: 'Poné primero el nombre del plato' }, { status: 400 })

  const ingredientes = (b?.ingredientes ?? []).slice(0, 12).join(', ')
  const prompt = [
    `Fotografía gastronómica profesional de "${titulo}", plato terminado y emplatado para servir en un restaurante.`,
    b?.descripcion ? `El plato es: ${b.descripcion.slice(0, 400)}.` : '',
    ingredientes ? `Se ven estos ingredientes: ${ingredientes}.` : '',
    'Vajilla sobria sobre mesa de madera o mármol, luz natural suave y lateral, foco en el plato y fondo apenas desenfocado,',
    'ángulo de 45 grados, aspecto realista de carta de restaurante.',
    'Sin texto, sin logos, sin marcas de agua, sin manos ni personas.',
  ]
    .filter(Boolean)
    .join(' ')

  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId! }, select: { r2Prefix: true } })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  let b64: string | undefined
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1536x1024',
        quality: 'medium',
      }),
    })
    const j = (await r.json()) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } }
    if (!r.ok) throw new Error(j.error?.message || `El modelo de imagen respondió ${r.status}`)
    b64 = j.data?.[0]?.b64_json
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo generar la foto' }, { status: 502 })
  }
  if (!b64) return NextResponse.json({ error: 'El modelo no devolvió ninguna imagen' }, { status: 502 })

  const key = `${cliente.r2Prefix}/recetas/${crypto.randomUUID()}.png`
  await uploadToR2(BUCKET, key, Buffer.from(b64, 'base64'), undefined, 'image/png')

  return NextResponse.json({ fotoKey: key })
}
