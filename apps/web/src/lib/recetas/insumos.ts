import { prisma } from '@/lib/prisma'
import { getAnthropicClient, parseAIResponse } from '@/lib/ai/anthropic-client'
import { sugerirLocal, type InsumoLite, type SugerenciaInsumo } from './matching'

/**
 * Vincular un ingrediente de receta con un insumo del catálogo.
 *
 * Son dos pasadas, a propósito:
 *
 *  1. Local: compara palabras. Resuelve "Manteca" → "MANTECA" al instante,
 *     gratis y sin red. La mayoría de los ingredientes caen acá.
 *  2. IA: solo para lo que la primera no resolvió con confianza. "Ojo de bife"
 *     no comparte ninguna palabra con "BIFE ANGOSTO C/C" pero un humano sabe
 *     que no son lo mismo, y que "Crema de leche" sí es "CREMA 42%".
 *
 * Ninguna de las dos asigna sola: ambas proponen y el usuario confirma. Un
 * ingrediente mal vinculado ensucia el costo de la receta sin que se note.
 */

export { normalizar, parecido, sugerirLocal } from './matching'
export type { SugerenciaInsumo, InsumoLite } from './matching'

const MODELO = 'claude-sonnet-5'

const SYSTEM = `Vinculás ingredientes de recetas de un restaurante argentino con el insumo del catálogo de compras que les corresponde.

El nombre del insumo suele traer marca, presentación y abreviaturas de la factura ("MANTECA LA SERENISIMA X 200G", "BIFE ANGOSTO C/C ENT AV 5.0 KG"); el del ingrediente es como lo escribe el cocinero ("manteca", "bife de chorizo").

Reglas:
- Devolvé el índice del insumo, no su nombre.
- Si ninguno es el mismo producto, devolvé null. Es preferible dejarlo sin vincular a vincularlo mal: un insumo equivocado ensucia el costo de la receta.
- Un corte de carne no es intercambiable con otro: "ojo de bife" no es "bife angosto" ni "lomo".
- Ignorá la presentación y el tamaño: lo que importa es si es el mismo producto.`

/**
 * Segunda pasada, con IA, solo sobre los que quedaron sin resolver.
 * Si falla o no hay API key, devuelve lo que entró: el flujo sigue a mano.
 */
export async function sugerirConIA(
  pendientes: string[],
  insumos: InsumoLite[]
): Promise<Map<string, { insumoId: string; insumoNombre: string }>> {
  const out = new Map<string, { insumoId: string; insumoNombre: string }>()
  if (pendientes.length === 0 || insumos.length === 0) return out

  try {
    const lista = insumos.map((i, idx) => `${idx}. ${i.nombre}`).join('\n')
    const pide = pendientes.map((p, idx) => `${idx}. ${p}`).join('\n')

    const res = await getAnthropicClient().messages.create({
      model: MODELO,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `INSUMOS DISPONIBLES:\n${lista}\n\nINGREDIENTES A VINCULAR:\n${pide}\n\nRespondé solo un JSON: {"v":[{"i":<índice del ingrediente>,"n":<índice del insumo o null>}]}`,
        },
      ],
    })

    const texto = res.content.find((c) => c.type === 'text')
    if (!texto || texto.type !== 'text') return out
    const json = parseAIResponse<{ v: Array<{ i: number; n: number | null }> }>(texto.text)

    for (const { i, n } of json.v ?? []) {
      const nombre = pendientes[i]
      const insumo = n == null ? null : insumos[n]
      if (nombre && insumo) out.set(nombre, { insumoId: insumo.id, insumoNombre: insumo.nombre })
    }
  } catch {
    // Sin IA el usuario vincula a mano: no es un error que corte el flujo.
  }
  return out
}

/** Las dos pasadas juntas. `conIA` false deja solo la local. */
export async function sugerirInsumos(
  clienteId: string,
  nombres: string[],
  conIA = true
): Promise<SugerenciaInsumo[]> {
  const insumos = await prisma.insumos.findMany({
    where: { clienteId, activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  })

  const sugerencias = sugerirLocal(nombres, insumos)
  if (!conIA) return sugerencias

  const pendientes = sugerencias.filter((s) => !s.insumoId).map((s) => s.nombre)
  if (pendientes.length === 0) return sugerencias

  const ia = await sugerirConIA(pendientes, insumos)
  return sugerencias.map((s) => {
    const hit = s.insumoId ? null : ia.get(s.nombre)
    return hit ? { ...s, ...hit, confianza: 0.8, fuente: 'ia' as const } : s
  })
}
