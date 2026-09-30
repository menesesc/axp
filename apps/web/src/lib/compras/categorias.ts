import { prisma } from '@/lib/prisma'
import { getAnthropicClient, parseAIResponse } from '@/lib/ai/anthropic-client'

/**
 * Categorías de compra de los items de factura.
 *
 * La categoría se asigna por descripción normalizada (no por línea): todas las
 * líneas con el mismo texto comparten categoría, así 5000 líneas son ~1400
 * clasificaciones. La IA solo completa las descripciones sin categoría; las
 * asignadas a mano (fuente 'manual') nunca se pisan.
 */

/** Expresión SQL que normaliza una descripción. Debe coincidir con `normDesc`. */
export function descNormSql(col: string): string {
  return `lower(btrim(regexp_replace(${col}, '\\s+', ' ', 'g')))`
}

export function normDesc(descripcion: string): string {
  return descripcion.replace(/\s+/g, ' ').trim().toLowerCase()
}

export const CATEGORIAS_DEFAULT: Array<{ nombre: string; abreviatura: string; orden: number }> = [
  { nombre: 'Carnes', abreviatura: 'CAR', orden: 10 },
  { nombre: 'Aves', abreviatura: 'AVE', orden: 20 },
  { nombre: 'Pescados y mariscos', abreviatura: 'PES', orden: 30 },
  { nombre: 'Fiambres', abreviatura: 'FIA', orden: 40 },
  { nombre: 'Lácteos y quesos', abreviatura: 'LAC', orden: 50 },
  { nombre: 'Verduras y frutas', abreviatura: 'VER', orden: 60 },
  { nombre: 'Almacén', abreviatura: 'ALM', orden: 70 },
  { nombre: 'Panificados y pastas', abreviatura: 'PAN', orden: 80 },
  { nombre: 'Congelados', abreviatura: 'CONG', orden: 90 },
  { nombre: 'Bebidas', abreviatura: 'BEB', orden: 100 },
  { nombre: 'Vinos', abreviatura: 'VIN', orden: 110 },
  { nombre: 'Cervezas', abreviatura: 'CERV', orden: 120 },
  { nombre: 'Limpieza', abreviatura: 'LIM', orden: 130 },
  { nombre: 'Descartables', abreviatura: 'DESC', orden: 140 },
  { nombre: 'Mantenimiento', abreviatura: 'MANT', orden: 150 },
  { nombre: 'Bazar y vajilla', abreviatura: 'BAZ', orden: 155 },
  { nombre: 'Indumentaria y blanquería', abreviatura: 'IND', orden: 160 },
  { nombre: 'Servicios', abreviatura: 'SERV', orden: 170 },
  { nombre: 'Otros', abreviatura: 'OTR', orden: 999 },
]

/** Devuelve las categorías del cliente, creando las iniciales si no tiene ninguna. */
export async function getCategorias(clienteId: string) {
  let cats = await prisma.compra_categorias.findMany({
    where: { clienteId },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  })
  if (cats.length === 0) {
    await prisma.compra_categorias.createMany({
      data: CATEGORIAS_DEFAULT.map((c) => ({ clienteId, ...c })),
      skipDuplicates: true,
    })
    cats = await prisma.compra_categorias.findMany({
      where: { clienteId },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    })
  }
  return cats
}

/** Cantidad de descripciones distintas todavía sin categoría. */
export async function contarPendientes(clienteId: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<[{ n: bigint }]>(
    `SELECT COUNT(DISTINCT ${descNormSql('di.descripcion')})::bigint AS n
       FROM documento_items di
       JOIN documentos d ON d.id = di."documentoId"
       LEFT JOIN compra_item_categoria c
              ON c."clienteId" = d."clienteId" AND c."descripcionNorm" = ${descNormSql('di.descripcion')}
      WHERE d."clienteId" = $1::uuid AND c.id IS NULL AND btrim(di.descripcion) <> ''`,
    clienteId
  )
  return Number(rows[0]?.n ?? 0)
}

interface Pendiente {
  norm: string
  descripcion: string
  proveedor: string | null
}

async function listarPendientes(clienteId: string, limit: number): Promise<Pendiente[]> {
  return prisma.$queryRawUnsafe<Pendiente[]>(
    `SELECT DISTINCT ON (${descNormSql('di.descripcion')})
            ${descNormSql('di.descripcion')} AS norm,
            di.descripcion,
            p."razonSocial" AS proveedor
       FROM documento_items di
       JOIN documentos d ON d.id = di."documentoId"
       LEFT JOIN proveedores p ON p.id = d."proveedorId"
       LEFT JOIN compra_item_categoria c
              ON c."clienteId" = d."clienteId" AND c."descripcionNorm" = ${descNormSql('di.descripcion')}
      WHERE d."clienteId" = $1::uuid AND c.id IS NULL AND btrim(di.descripcion) <> ''
      ORDER BY ${descNormSql('di.descripcion')}
      LIMIT ${Math.max(1, Math.floor(limit))}`,
    clienteId
  )
}

const MODELO = 'claude-opus-5'
const LOTE = 120

const SYSTEM = `Clasificás líneas de facturas de compra de un restaurante argentino en categorías de compra.
Cada línea es el texto libre de la factura (puede traer marcas, códigos, presentaciones y abreviaturas) y el proveedor que la emitió, que suele ser una buena pista (un frigorífico vende carnes, una distribuidora de bebidas vende bebidas).
Criterios:
- Carnes: vacuna, cerdo, cordero, achuras, embutidos frescos para parrilla (chorizo, morcilla).
- Aves: pollo, pavo, pato y sus cortes.
- Fiambres: jamón, salame, bondiola curada, mortadela y similares.
- Lácteos y quesos: leche, crema, manteca, yogur, quesos.
- Almacén: secos y envasados (harina, aceite, azúcar, arroz, conservas, especias, salsas, café, té).
- Panificados y pastas: pan, facturas, tapas, pastas frescas o secas.
- Congelados: productos vendidos congelados que no encajan mejor en otra categoría de alimento.
- Bebidas: gaseosas, aguas, jugos, sodas, bebidas espirituosas y aperitivos. Vinos y Cervezas van en sus propias categorías.
- Limpieza: productos químicos, detergentes, lavandina, alcohol, trapos, esponjas.
- Descartables: envases, bandejas, film, papel, bolsas, servilletas, vasos descartables.
- Mantenimiento: repuestos, ferretería, gas, reparaciones, electricidad.
- Bazar y vajilla: utensilios de cocina, ollas, cazos, coladores, vajilla, copas, vasos, cubiertos, equipamiento gastronómico.
- Indumentaria y blanquería: ropa de trabajo, uniformes, manteles, repasadores.
- Servicios: fletes, honorarios, abonos, alquileres, cargos no físicos.
- Otros: solo si ninguna otra aplica.
Usá exactamente uno de los nombres de categoría dados.`

/**
 * Clasifica con IA hasta `max` descripciones pendientes del cliente.
 * Devuelve cuántas clasificó y cuántas quedan.
 */
export async function categorizarPendientes(
  clienteId: string,
  max = 360
): Promise<{ clasificados: number; pendientes: number }> {
  const cats = await getCategorias(clienteId)
  const porNombre = new Map(cats.map((c) => [c.nombre.toLowerCase(), c.id]))
  const otrosId = porNombre.get('otros') ?? cats[cats.length - 1]?.id
  const nombres = cats.map((c) => c.nombre)

  let clasificados = 0
  while (clasificados < max) {
    const lote = await listarPendientes(clienteId, Math.min(LOTE, max - clasificados))
    if (lote.length === 0) break

    const asignaciones = await clasificarLote(lote, nombres)

    const data = lote.map((p, i) => {
      const nombre = asignaciones.get(i)
      const categoriaId = (nombre && porNombre.get(nombre.toLowerCase())) || otrosId
      return { clienteId, descripcionNorm: p.norm.slice(0, 500), categoriaId: categoriaId!, fuente: 'ia' }
    })
    await prisma.compra_item_categoria.createMany({ data, skipDuplicates: true })
    clasificados += lote.length
    if (lote.length < LOTE) break
  }

  return { clasificados, pendientes: await contarPendientes(clienteId) }
}

async function clasificarLote(lote: Pendiente[], categorias: string[]): Promise<Map<number, string>> {
  const client = getAnthropicClient()
  const lineas = lote
    .map((p, i) => `${i}\t${p.descripcion.replace(/\s+/g, ' ').trim()}\t${p.proveedor ?? '-'}`)
    .join('\n')

  const response = await client.messages.create({
    model: MODELO,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            asignaciones: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  i: { type: 'integer' },
                  categoria: { type: 'string', enum: categorias },
                },
                required: ['i', 'categoria'],
                additionalProperties: false,
              },
            },
          },
          required: ['asignaciones'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'user',
        content: `Categorías: ${categorias.join(' | ')}\n\nLíneas (índice, descripción, proveedor):\n${lineas}\n\nDevolvé una asignación por cada índice.`,
      },
    ],
  })

  if (response.stop_reason === 'refusal') throw new Error('La IA rechazó la clasificación')
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('La IA no devolvió texto')
  const parsed = parseAIResponse<{ asignaciones: Array<{ i: number; categoria: string }> }>(text.text)
  return new Map(parsed.asignaciones.map((a) => [a.i, a.categoria]))
}

let enCurso = false

/**
 * Clasifica en segundo plano lo pendiente de todos los clientes, una tanda
 * por cliente. Lo dispara el tick del scheduler (cada minuto), así las
 * facturas nuevas quedan categorizadas solas. Un lock en memoria evita que
 * dos ticks se pisen si la IA tarda más de un minuto.
 */
export function categorizarEnSegundoPlano(): void {
  if (enCurso || !process.env.ANTHROPIC_API_KEY) return
  enCurso = true
  ;(async () => {
    const clientes = await prisma.clientes.findMany({ where: { activo: true }, select: { id: true } })
    for (const c of clientes) {
      if ((await contarPendientes(c.id)) === 0) continue
      const r = await categorizarPendientes(c.id, LOTE)
      console.log(`[categorias] cliente ${c.id}: ${r.clasificados} clasificados, ${r.pendientes} pendientes`)
    }
  })()
    .catch((e) => console.error('[categorias] error en segundo plano:', e))
    .finally(() => {
      enCurso = false
    })
}
