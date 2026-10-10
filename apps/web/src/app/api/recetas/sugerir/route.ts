import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { AI_MODEL_CRITERIO, getAnthropicClient, textoRespuesta, parseAIResponse } from '@/lib/ai/anthropic-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Borrador de receta a partir del nombre y las porciones.
 *
 * No inventa el recetario de la casa: propone un punto de partida para no
 * arrancar de una hoja en blanco, y el cocinero corrige. Por eso devuelve
 * todo junto —ingredientes, pasos, tiempos y dispositivos— y nada se guarda
 * hasta que se aprieta guardar.
 *
 * Los dispositivos salen de los que tiene cargados la casa, no de una lista
 * genérica: si hay Rational y abatidor, los pasos tienen que usarlos; si no
 * los hay, no sirve proponer "abatir a 3°C".
 */

interface Cuerpo {
  titulo?: string
  porciones?: number
  /** Dispositivos que el usuario ya eligió: la receta se arma alrededor. */
  dispositivoIds?: string[]
  /** Para rehacer la sugerencia pidiendo algo distinto. */
  indicaciones?: string
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as Cuerpo | null
  const titulo = String(b?.titulo || '').trim()
  if (!titulo) return NextResponse.json({ error: 'Poné el nombre de la receta' }, { status: 400 })
  const porciones = Math.min(500, Math.max(1, Number(b?.porciones) || 4))

  const dispositivos = await prisma.$queryRaw<Array<{ id: string; nombre: string }>>`
    SELECT id, nombre FROM dispositivos WHERE "clienteId" = ${clienteId}::uuid ORDER BY orden, nombre
  `
  const elegidos = (b?.dispositivoIds ?? []).filter((id) => dispositivos.some((d) => d.id === id))
  const nombresElegidos = dispositivos.filter((d) => elegidos.includes(d.id)).map((d) => d.nombre)

  // El catálogo de insumos ayuda a que los ingredientes salgan con los
  // nombres que después se van a poder vincular, en vez de genéricos.
  const insumos = await prisma.$queryRaw<Array<{ nombre: string; unidadBase: string }>>`
    SELECT nombre, "unidadBase" FROM insumos
     WHERE "clienteId" = ${clienteId}::uuid AND activo = true AND "productMasterId" IS NULL
     ORDER BY nombre LIMIT 200
  `

  const system = `Sos un cocinero profesional que escribe recetas para la cocina de un restaurante argentino.

Escribís para que otro cocinero la ejecute: cantidades concretas, pasos cortos y en orden, sin palabrería.

DISPOSITIVOS DE ESTA COCINA (los únicos que podés usar):
${dispositivos.map((d) => `- ${d.nombre}`).join('\n') || '- (no hay ninguno cargado)'}

${
  nombresElegidos.length > 0
    ? `El cocinero ya eligió: ${nombresElegidos.join(', ')}. Armá la receta alrededor de esos, y agregá otro sólo si es imprescindible.`
    : 'Elegí los que correspondan de la lista de arriba.'
}

INSUMOS DEL CATÁLOGO (usá estos nombres cuando el ingrediente sea uno de ellos, así se puede costear):
${insumos.map((i) => `- ${i.nombre} (${i.unidadBase})`).join('\n') || '- (catálogo vacío)'}

Reglas:
- Las cantidades son para ${porciones} porciones y son las que van al plato (netas, sin contar la merma).
- Unidades en kg, g, l, ml o u. Nada de "una pizca" ni "a gusto" en la cantidad: eso va en la nota.
- prepMin es la preparación activa; totalMin incluye cocción, reposos y enfriados.
- Si no estás seguro de algo, es preferible un paso de menos que uno inventado.`

  const usuario = `Receta: ${titulo}
Porciones: ${porciones}
${b?.indicaciones?.trim() ? `Indicaciones: ${b.indicaciones.trim()}` : ''}

Respondé SOLO este JSON:
{
  "descripcion": "una línea de qué es el plato",
  "prepMin": number,
  "totalMin": number,
  "dificultad": "facil" | "media" | "dificil",
  "dispositivos": ["nombre exacto de la lista"],
  "ingredientes": [{"nombre":"string","cantidad":number|null,"unidad":"kg|g|l|ml|u|null","nota":"string|null","seccion":"string|null"}],
  "pasos": [{"texto":"string","seccion":"string|null"}],
  "sugerencias": ["tip de servicio o conservación"]
}`

  try {
    const res = await getAnthropicClient().messages.create({
      model: AI_MODEL_CRITERIO,
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: usuario }],
    })

    const texto = textoRespuesta(res.content as Array<{ type: string; text?: string }>)
    const r = parseAIResponse<{
      descripcion?: string
      prepMin?: number
      totalMin?: number
      dificultad?: string
      dispositivos?: string[]
      ingredientes?: Array<Record<string, unknown>>
      pasos?: Array<{ texto?: string; seccion?: string | null }>
      sugerencias?: string[]
    }>(texto)

    // Los dispositivos vuelven por nombre; acá se resuelven a id y se
    // descarta cualquiera que no exista en esta cocina.
    const porNombre = new Map(dispositivos.map((d) => [d.nombre.toLowerCase(), d.id]))
    const dispositivoIds = [
      ...new Set([
        ...elegidos,
        ...(r.dispositivos ?? []).map((n) => porNombre.get(String(n).toLowerCase())).filter((x): x is string => !!x),
      ]),
    ]

    return NextResponse.json({
      sugerencia: {
        descripcion: r.descripcion ?? '',
        prepMin: Number(r.prepMin) || null,
        totalMin: Number(r.totalMin) || null,
        dificultad: ['facil', 'media', 'dificil'].includes(String(r.dificultad)) ? r.dificultad : null,
        dispositivoIds,
        ingredientes: (r.ingredientes ?? []).slice(0, 60).map((i) => ({
          nombre: String(i.nombre ?? '').trim().slice(0, 200),
          cantidad: i.cantidad == null || Number.isNaN(Number(i.cantidad)) ? null : Number(i.cantidad),
          unidad: typeof i.unidad === 'string' ? i.unidad.slice(0, 20) : null,
          nota: typeof i.nota === 'string' && i.nota.trim() ? i.nota.trim().slice(0, 200) : null,
          seccion: typeof i.seccion === 'string' && i.seccion.trim() ? i.seccion.trim().slice(0, 80) : null,
        })).filter((i) => i.nombre),
        pasos: (r.pasos ?? []).slice(0, 40).map((p) => ({
          texto: String(p?.texto ?? '').trim(),
          seccion: typeof p?.seccion === 'string' && p.seccion.trim() ? p.seccion.trim().slice(0, 80) : null,
        })).filter((p) => p.texto),
        sugerencias: (r.sugerencias ?? []).slice(0, 10).map((x) => String(x).trim()).filter(Boolean),
      },
    })
  } catch (e) {
    console.error('[recetas/sugerir]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo generar la sugerencia' },
      { status: 502 }
    )
  }
}
