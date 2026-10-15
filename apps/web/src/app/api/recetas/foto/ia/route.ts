import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { downloadFromR2, uploadToR2 } from '@/lib/r2/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BUCKET = process.env.R2_BUCKET_NAME || ''
const MODELO = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
// gpt-image-1 pide organización verificada en OpenAI. Si todavía no lo está,
// la foto sale igual con el modelo anterior en vez de dejar al usuario con un
// error que no puede resolver desde la pantalla.
const MODELO_ALTERNATIVO = 'dall-e-3'

/**
 * Foto del plato generada por IA.
 *
 * Es una foto de referencia, no la del plato de la casa: sirve para que la
 * ficha no quede gris y para que el cocinero vea el emplatado propuesto. La
 * de verdad, cuando el plato existe, se sube con el botón de al lado y pisa
 * a esta.
 *
 * Lo que más cambia el resultado es la vajilla: un guiso en cazuela de
 * cerámica y el mismo guiso en plato playo no son la misma foto. Por eso la
 * vajilla es un dato de la receta y acá se usa la que tenga cargada, con su
 * descripción, en vez de dejar que el modelo invente una.
 *
 * Con `base` la foto no se hace de cero: se retoca la que ya está. Es la
 * diferencia entre "otra foto a ver si sale mejor" y "esta misma, pero con
 * perejil y desde arriba".
 *
 * Claude no genera imágenes, así que esto va contra un modelo de imagen
 * aparte. Sin la clave configurada la ruta avisa y no pasa nada más.
 */

interface Cuerpo {
  titulo?: string
  descripcion?: string
  /** Los ingredientes principales, para que la foto se parezca al plato. */
  ingredientes?: string[]
  /** Los pasos, resumidos: el gratinado o la parrilla se ven en el plato. */
  pasos?: string[]
  /** La pieza en la que se presenta, de la vajilla cargada. */
  vajillaId?: string | null
  /** Lo que pide el usuario esta vez: decoración, ángulo, lo que sea. */
  indicaciones?: string
  /** Foto actual, para retocarla en vez de empezar de cero. */
  base?: string | null
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

  const cliente = await prisma.clientes.findUnique({ where: { id: clienteId! }, select: { r2Prefix: true } })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // La vajilla se lee de la base y no del body: así el prompt usa la
  // descripción que cargó la casa y nadie puede mandar cualquier cosa.
  let vajilla: { nombre: string; descripcion: string | null } | null = null
  if (b?.vajillaId) {
    const [v] = await prisma.$queryRaw<Array<{ nombre: string; descripcion: string | null }>>`
      SELECT nombre, descripcion FROM vajillas
       WHERE id = ${b.vajillaId}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    vajilla = v ?? null
  }

  const prompt = armarPrompt({
    titulo,
    descripcion: b?.descripcion ?? '',
    ingredientes: b?.ingredientes ?? [],
    pasos: b?.pasos ?? [],
    vajilla,
    indicaciones: b?.indicaciones ?? '',
    retoque: !!b?.base,
  })

  let b64: string | undefined
  try {
    const r = b?.base
      ? await retocar(apiKey, prompt, await leerBase(b.base, cliente.r2Prefix))
      : await generar(apiKey, prompt)
    b64 = r
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'No se pudo generar la foto' }, { status: 502 })
  }
  if (!b64) return NextResponse.json({ error: 'El modelo no devolvió ninguna imagen' }, { status: 502 })

  const key = `${cliente.r2Prefix}/recetas/${crypto.randomUUID()}.png`
  await uploadToR2(BUCKET, key, Buffer.from(b64, 'base64'), undefined, 'image/png')

  return NextResponse.json({ fotoKey: key })
}

/**
 * El prompt.
 *
 * Fondo sutil y plato protagonista: es una foto de carta, no una producción
 * de revista con veinte props alrededor. Y nada de texto: un cartelito
 * inventado en el plato arruina la foto y no se puede sacar.
 */
function armarPrompt(d: {
  titulo: string
  descripcion: string
  ingredientes: string[]
  pasos: string[]
  vajilla: { nombre: string; descripcion: string | null } | null
  indicaciones: string
  retoque: boolean
}): string {
  const ingredientes = d.ingredientes.filter(Boolean).slice(0, 12).join(', ')
  // Los pasos entran recortados: lo que importa es la técnica que se ve
  // (gratinado, grillado, fritura), no el detalle de la preparación.
  const proceso = d.pasos.filter(Boolean).slice(0, 8).join(' ').slice(0, 600)

  const vajilla = d.vajilla
    ? `Servido en ${d.vajilla.descripcion || d.vajilla.nombre}.`
    : 'Elegí la vajilla que mejor le quede al plato: sobria, de restaurante, sin decoración.'

  return [
    d.retoque
      ? `Mejorá esta fotografía del plato "${d.titulo}" manteniendo el plato, la vajilla y el emplatado.`
      : `Fotografía gastronómica profesional de "${d.titulo}", plato terminado y listo para servir en un restaurante.`,
    d.descripcion ? `El plato es: ${d.descripcion.slice(0, 400)}.` : '',
    ingredientes ? `Se ven estos ingredientes: ${ingredientes}.` : '',
    proceso ? `Cómo se prepara, para que se vea la técnica: ${proceso}.` : '',
    vajilla,
    'Fondo muy sutil y neutro, apenas desenfocado, sin objetos que distraigan: el plato es el protagonista.',
    'Luz natural suave y lateral, colores reales, aspecto apetitoso y realista de carta de restaurante.',
    d.indicaciones ? `Indicaciones de la casa: ${d.indicaciones.slice(0, 400)}.` : 'Ángulo de 45 grados.',
    'Sin ningún texto, letras, números, logos ni marcas de agua. Sin personas ni manos.',
  ]
    .filter(Boolean)
    .join(' ')
}

async function generar(apiKey: string, prompt: string): Promise<string | undefined> {
  const pedir = (cuerpo: Record<string, unknown>) =>
    fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(cuerpo),
    })

  let r = await pedir({ model: MODELO, prompt, n: 1, size: '1536x1024', quality: 'medium' })
  let j = (await r.json()) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } }

  if (!r.ok && MODELO === 'gpt-image-1' && (r.status === 403 || r.status === 404)) {
    r = await pedir({
      model: MODELO_ALTERNATIVO,
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'hd',
      response_format: 'b64_json',
    })
    j = (await r.json()) as typeof j
  }

  if (!r.ok) throw new Error(j.error?.message || `El modelo de imagen respondió ${r.status}`)
  return j.data?.[0]?.b64_json
}

async function retocar(apiKey: string, prompt: string, imagen: Blob): Promise<string | undefined> {
  const fd = new FormData()
  fd.append('model', MODELO)
  fd.append('prompt', prompt)
  fd.append('size', '1536x1024')
  fd.append('quality', 'medium')
  fd.append('image', imagen, 'actual.png')

  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  })
  const j = (await r.json()) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } }
  if (!r.ok) throw new Error(j.error?.message || `El modelo de imagen respondió ${r.status}`)
  return j.data?.[0]?.b64_json
}

/** La foto actual, validando que la key sea del prefijo de esta empresa. */
async function leerBase(key: string, prefijo: string): Promise<Blob> {
  if (!key.startsWith(`${prefijo}/`)) throw new Error('Esa foto no es de esta empresa')
  const buf = await downloadFromR2(BUCKET, key)
  const ext = key.split('.').pop()?.toLowerCase()
  const tipo = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
  return new Blob([new Uint8Array(buf)], { type: tipo })
}
