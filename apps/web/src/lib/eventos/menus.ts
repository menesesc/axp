import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { costoDeReceta, costoPorInsumo } from '@/lib/recetas/costo'
import { esUuid, limpiarCopiasMenu, numero, texto, type Tx } from './db'
import {
  APLICA,
  PASOS,
  itemTexto,
  modalidadTexto,
  type Adicional,
  type Aplica,
  type ItemMenu,
  type Modalidad,
  type ModoItem,
  type Paga,
  type Paso,
} from './menu'

/**
 * Menús y adicionales de eventos: lectura, copias y validación.
 *
 * Como el resto del módulo, con SQL crudo. El cálculo (rendimiento, valor de
 * carta, comparación) vive en `menu.ts`, que no toca la base.
 */

// ---------------------------------------------------------------------------
// Precio de carta y costo de los productos del POS
// ---------------------------------------------------------------------------

export interface ProductoCarta {
  id: string
  nombre: string
  categoria: string | null
  precio: number
  activo: boolean
  costo: number | null
  costoCompleto: boolean
}

/**
 * Costo estimado de una unidad de cada producto del POS.
 *
 * El producto del POS apunta al producto de venta (`sales_product_master`),
 * y de ahí sale el costo igual que en el descuento de stock: la receta
 * activa, o el insumo de venta directa (una botella de vino es un insumo que
 * se vende 1 a 1). La receta tiene precedencia. El precio de cada insumo es
 * el de su última compra, como en el recetario.
 */
export async function costosDeProductos(clienteId: string, productoIds: string[]): Promise<Map<string, { costo: number | null; completo: boolean }>> {
  const out = new Map<string, { costo: number | null; completo: boolean }>()
  if (productoIds.length === 0) return out
  const filas = await prisma.$queryRaw<
    Array<{
      id: string
      receta: Array<{ nombre: string; cantidad: number | null; unidad: string | null; insumoId: string | null; unidadBase: string | null; merma: number | null }> | null
      directo: string | null
    }>
  >`
    SELECT p.id,
           (SELECT json_agg(json_build_object(
                     'nombre', ri."itemDescripcion", 'cantidad', ri.cantidad::float8, 'unidad', ri.unidad,
                     'insumoId', ri."insumoId", 'unidadBase', i."unidadBase",
                     -- La merma de la línea, o la habitual del insumo.
                     'merma', COALESCE(NULLIF(ri."mermaPct", 0), i."mermaPct", 0)::float8))
              FROM sales_recipe_items ri
              LEFT JOIN insumos i ON i.id = ri."insumoId"
             WHERE ri."recipeId" = (SELECT sr.id FROM sales_recipes sr
                                     WHERE sr."productMasterId" = p."productMasterId" AND sr.activa
                                     ORDER BY sr.version DESC LIMIT 1)) AS receta,
           (SELECT i.id::text FROM insumos i
             WHERE i."productMasterId" = p."productMasterId" AND i.activo LIMIT 1) AS directo
      FROM pos_productos p
     WHERE p."clienteId" = ${clienteId}::uuid AND p.id = ANY(${productoIds}::uuid[])
       AND p."productMasterId" IS NOT NULL
  `
  if (filas.length === 0) return out
  const precios = await costoPorInsumo(clienteId)
  for (const f of filas) {
    if (f.receta?.length) {
      const c = costoDeReceta(
        f.receta.map((r) => ({
          nombre: r.nombre,
          cantidad: r.cantidad,
          unidad: r.unidad,
          insumoId: r.insumoId,
          insumo: r.unidadBase ? { unidadBase: r.unidadBase } : null,
          mermaPct: r.merma,
        })),
        precios
      )
      out.set(f.id, { costo: c.costeados > 0 ? c.total : null, completo: c.costeados > 0 && c.faltantes.length === 0 })
    } else if (f.directo) {
      const c = precios.get(f.directo)
      out.set(f.id, { costo: c ?? null, completo: c != null })
    }
  }
  return out
}

/** Productos del POS para elegir en el editor de menús. */
export async function productosCarta(clienteId: string, conCosto: boolean): Promise<ProductoCarta[]> {
  const filas = await prisma.$queryRaw<Array<Omit<ProductoCarta, 'costo' | 'costoCompleto'>>>`
    SELECT p.id, p.nombre, c.nombre AS categoria, p.precio::float8 AS precio, p.activo
      FROM pos_productos p
      LEFT JOIN pos_categorias c ON c.id = p."categoriaId"
     WHERE p."clienteId" = ${clienteId}::uuid AND p.activo
     ORDER BY c.orden NULLS LAST, c.nombre, p.orden, p.nombre
  `
  const costos = conCosto ? await costosDeProductos(clienteId, filas.map((f) => f.id)) : new Map()
  return filas.map((f) => ({ ...f, costo: costos.get(f.id)?.costo ?? null, costoCompleto: costos.get(f.id)?.completo ?? false }))
}

// ---------------------------------------------------------------------------
// Menús
// ---------------------------------------------------------------------------

export interface MenuDetalle {
  id: string
  nombre: string
  descripcion: string | null
  plantilla: boolean
  plantillaId: string | null
  plantillaNombre: string | null
  /** La plantilla se tocó después de copiarla: conviene ofrecer actualizar. */
  plantillaCambio: boolean
  eventoId: string | null
  reservaId: string | null
  personasReferencia: number
  activo: boolean
  updatedAt: Date
  items: ItemMenu[]
}

const ORDEN_PASO = Prisma.sql`array_position(ARRAY['RECEPCION','ENTRADA','PRINCIPAL','POSTRE','BEBIDA','OTRO']::text[], it.paso::text)`

/**
 * Menús con sus ítems, el precio de carta ya resuelto (el manual o el del
 * POS vigente) y, si se pide, el costo de cada uno.
 */
export async function menusDetalle(clienteId: string, ids: string[], conCosto: boolean, db: Tx | typeof prisma = prisma): Promise<Map<string, MenuDetalle>> {
  const out = new Map<string, MenuDetalle>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return out
  const menus = await db.$queryRaw<Array<Omit<MenuDetalle, 'items'>>>`
    SELECT m.id, m.nombre, m.descripcion, m.plantilla, m."plantillaId", pl.nombre AS "plantillaNombre",
           COALESCE(pl."updatedAt" > COALESCE(m."copiadoAt", m."createdAt"), false) AS "plantillaCambio",
           m."eventoId", m."reservaId", m."personasReferencia", m.activo, m."updatedAt"
      FROM evento_menus m
      LEFT JOIN evento_menus pl ON pl.id = m."plantillaId"
     WHERE m."clienteId" = ${clienteId}::uuid AND m.id = ANY(${unicos}::uuid[])
  `
  if (menus.length === 0) return out
  const items = await db.$queryRaw<
    Array<Omit<ItemMenu, 'precio' | 'costo' | 'costoCompleto'> & { menuId: string; precioPos: number | null }>
  >`
    SELECT it.id, it."menuId", it.paso, it.orden, it."productoId", it.nombre, it.descripcion, it.modo,
           it.cantidad::float8 AS cantidad, it."personasPorUnidad", it.unidad, it.aplica,
           it."precioCarta"::float8 AS "precioManual", p.precio::float8 AS "precioPos", p.nombre AS "productoNombre"
      FROM evento_menu_items it
      LEFT JOIN pos_productos p ON p.id = it."productoId"
     WHERE it."menuId" = ANY(${menus.map((m) => m.id)}::uuid[])
     ORDER BY ${ORDEN_PASO}, it.orden
  `
  const costos = conCosto
    ? await costosDeProductos(clienteId, [...new Set(items.map((i) => i.productoId).filter((x): x is string => !!x))])
    : new Map<string, { costo: number | null; completo: boolean }>()
  for (const m of menus) out.set(m.id, { ...m, items: [] })
  for (const { menuId, precioPos, ...it } of items) {
    const c = it.productoId ? costos.get(it.productoId) : undefined
    out.get(menuId)?.items.push({
      ...it,
      precio: it.precioManual ?? precioPos ?? null,
      costo: c?.costo ?? null,
      costoCompleto: c?.completo ?? false,
    })
  }
  return out
}

export async function menuDetalle(clienteId: string, id: string | null, conCosto: boolean, db: Tx | typeof prisma = prisma) {
  if (!id) return null
  return (await menusDetalle(clienteId, [id], conCosto, db)).get(id) ?? null
}

/** Sin el flag de importes, ni precios ni costos viajan al navegador. */
export function menuSinImportes(m: MenuDetalle | null): MenuDetalle | null {
  if (!m) return null
  return { ...m, items: m.items.map((i) => ({ ...i, precio: null, precioManual: null, costo: null, costoCompleto: false })) }
}

export interface PlantillaFila {
  id: string
  nombre: string
  descripcion: string | null
  personasReferencia: number
  activo: boolean
  items: number
  /** Cuántos eventos y reservas tienen una copia de esta plantilla. */
  copias: number
  updatedAt: Date
}

export async function listarPlantillas(clienteId: string): Promise<PlantillaFila[]> {
  return prisma.$queryRaw<PlantillaFila[]>`
    SELECT m.id, m.nombre, m.descripcion, m."personasReferencia", m.activo, m."updatedAt",
           (SELECT count(*)::int FROM evento_menu_items it WHERE it."menuId" = m.id) AS items,
           (SELECT count(*)::int FROM evento_menus c WHERE c."plantillaId" = m.id AND NOT c.plantilla) AS copias
      FROM evento_menus m
     WHERE m."clienteId" = ${clienteId}::uuid AND m.plantilla
     ORDER BY m.activo DESC, m.nombre
  `
}

/**
 * Copia un menú (plantilla o copia) con todos sus ítems. Es lo que pasa al
 * asignar: la copia es del evento o de la reserva, y lo que se haga después
 * con la plantilla no la toca. Sin dueño, la copia es una plantilla nueva
 * ("guardar como plantilla", "duplicar").
 */
export async function copiarMenu(
  tx: Tx,
  clienteId: string,
  origenId: string,
  dueno: { eventoId?: string | null | undefined; reservaId?: string | null | undefined },
  user: AuthUser | null,
  nombre?: string | null
): Promise<{ id: string; nombre: string } | null> {
  const plantilla = !dueno.eventoId && !dueno.reservaId
  const [m] = await tx.$queryRaw<Array<{ id: string; nombre: string }>>`
    INSERT INTO evento_menus ("clienteId", nombre, descripcion, plantilla, "plantillaId", "eventoId", "reservaId",
                              "personasReferencia", "copiadoAt", "createdById", "updatedById")
    SELECT o."clienteId", COALESCE(${nombre ?? null}, o.nombre), o.descripcion, ${plantilla},
           CASE WHEN ${plantilla} THEN NULL WHEN o.plantilla THEN o.id ELSE o."plantillaId" END,
           ${dueno.eventoId ?? null}::uuid, ${dueno.reservaId ?? null}::uuid,
           o."personasReferencia", now(), ${user?.id ?? null}::uuid, ${user?.id ?? null}::uuid
      FROM evento_menus o
     WHERE o.id = ${origenId}::uuid AND o."clienteId" = ${clienteId}::uuid
    RETURNING id, nombre
  `
  if (!m) return null
  await tx.$executeRaw`
    INSERT INTO evento_menu_items ("menuId", paso, orden, "productoId", nombre, descripcion, modo, cantidad,
                                   "personasPorUnidad", unidad, aplica, "precioCarta")
    SELECT ${m.id}::uuid, paso, orden, "productoId", nombre, descripcion, modo, cantidad,
           "personasPorUnidad", unidad, aplica, "precioCarta"
      FROM evento_menu_items WHERE "menuId" = ${origenId}::uuid
  `
  return m
}

/** Vuelve a copiar los ítems de la plantilla en una copia. Devuelve el nombre de la plantilla. */
export async function actualizarDesdePlantilla(tx: Tx, clienteId: string, menuId: string, user: AuthUser | null): Promise<string | null> {
  const [m] = await tx.$queryRaw<Array<{ plantillaId: string | null; nombre: string | null }>>`
    SELECT m."plantillaId", pl.nombre
      FROM evento_menus m JOIN evento_menus pl ON pl.id = m."plantillaId"
     WHERE m.id = ${menuId}::uuid AND m."clienteId" = ${clienteId}::uuid AND NOT m.plantilla
  `
  if (!m?.plantillaId) return null
  await tx.$executeRaw`DELETE FROM evento_menu_items WHERE "menuId" = ${menuId}::uuid`
  await tx.$executeRaw`
    INSERT INTO evento_menu_items ("menuId", paso, orden, "productoId", nombre, descripcion, modo, cantidad,
                                   "personasPorUnidad", unidad, aplica, "precioCarta")
    SELECT ${menuId}::uuid, paso, orden, "productoId", nombre, descripcion, modo, cantidad,
           "personasPorUnidad", unidad, aplica, "precioCarta"
      FROM evento_menu_items WHERE "menuId" = ${m.plantillaId}::uuid
  `
  await tx.$executeRaw`
    UPDATE evento_menus c SET nombre = pl.nombre, descripcion = pl.descripcion,
           "copiadoAt" = now(), "updatedAt" = now(), "updatedById" = ${user?.id ?? null}::uuid
      FROM evento_menus pl
     WHERE c.id = ${menuId}::uuid AND pl.id = c."plantillaId"
  `
  return m.nombre
}

/** Reemplaza los ítems de un menú. Los productos que no son de la empresa quedan como línea a mano. */
export async function guardarItems(tx: Tx, clienteId: string, menuId: string, items: ItemEntrada[]) {
  const ids = [...new Set(items.map((i) => i.productoId).filter((x): x is string => !!x))]
  const validos = new Set(
    ids.length
      ? (
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id::text FROM pos_productos WHERE "clienteId" = ${clienteId}::uuid AND id = ANY(${ids}::uuid[])
          `
        ).map((p) => p.id)
      : []
  )
  await tx.$executeRaw`DELETE FROM evento_menu_items WHERE "menuId" = ${menuId}::uuid`
  if (items.length === 0) return
  await tx.$executeRaw`
    INSERT INTO evento_menu_items ("menuId", paso, orden, "productoId", nombre, descripcion, modo, cantidad,
                                   "personasPorUnidad", unidad, aplica, "precioCarta")
    VALUES ${Prisma.join(
      items.map(
        (i, k) => Prisma.sql`(${menuId}::uuid, ${i.paso}, ${k}, ${i.productoId && validos.has(i.productoId) ? i.productoId : null}::uuid,
          ${i.nombre}, ${i.descripcion}, ${i.modo}, ${i.cantidad}::numeric, ${i.personasPorUnidad}::smallint, ${i.unidad},
          ${i.aplica}, ${i.precioManual}::numeric)`
      )
    )}
  `
}

/** Qué cambió entre dos listas de ítems, en palabras, para la línea de tiempo. */
export function cambiosItems(antes: ItemMenu[], despues: ItemEntrada[]): string | null {
  const clave = (i: { nombre: string; paso: string }) => `${i.paso}|${i.nombre.toLowerCase()}`
  const a = new Map(antes.map((i) => [clave(i), i]))
  const d = new Map(despues.map((i) => [clave(i), i]))
  const partes: string[] = []
  const agregados = despues.filter((i) => !a.has(clave(i))).map((i) => itemTexto(i))
  const quitados = antes.filter((i) => !d.has(clave(i))).map((i) => itemTexto(i))
  const cambiados: string[] = []
  for (const [k, x] of d) {
    const y = a.get(k)
    if (!y) continue
    const viejo = `${itemTexto(y)} · ${y.aplica}`
    const nuevo = `${itemTexto(x)} · ${x.aplica}`
    if (viejo !== nuevo) cambiados.push(`${itemTexto(y)} → ${itemTexto(x)}${x.aplica !== y.aplica ? ` (${APLICA.find((p) => p.valor === x.aplica)?.texto.toLowerCase()})` : ''}`)
    else if ((y.precioManual ?? null) !== (x.precioManual ?? null)) cambiados.push(`precio de carta de ${x.nombre}`)
  }
  if (agregados.length) partes.push(`agregó ${agregados.join(', ')}`)
  if (quitados.length) partes.push(`quitó ${quitados.join(', ')}`)
  if (cambiados.length) partes.push(`cambió ${cambiados.join(', ')}`)
  if (!partes.length && antes.map(clave).join() !== despues.map(clave).join()) partes.push('reordenó los ítems')
  return partes.length ? partes.join('; ') : null
}

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

export type ItemEntrada = Pick<
  ItemMenu,
  'paso' | 'productoId' | 'nombre' | 'descripcion' | 'modo' | 'cantidad' | 'personasPorUnidad' | 'unidad' | 'aplica' | 'precioManual'
> & { id?: string | undefined; orden: number }

const PASOS_OK = PASOS.map((p) => p.valor)
const APLICA_OK: Aplica[] = ['TODOS', 'ADULTOS', 'MENORES']

export function leerItems(v: unknown): { items: ItemEntrada[] } | { error: string } {
  if (!Array.isArray(v)) return { error: 'Ítems inválidos' }
  if (v.length > 200) return { error: 'Demasiados ítems' }
  const items: ItemEntrada[] = []
  for (const [k, raw] of (v as Array<Record<string, unknown>>).entries()) {
    const nombre = texto(raw?.nombre, 200)
    if (!nombre) return { error: 'Cada ítem necesita un nombre' }
    const paso = PASOS_OK.includes(raw.paso as Paso) ? (raw.paso as Paso) : 'PRINCIPAL'
    const modo: ModoItem = raw.modo === 'COMPARTIDO' ? 'COMPARTIDO' : 'PERSONA'
    const cantidad = numero(raw.cantidad) ?? 1
    if (cantidad <= 0 || cantidad > 1000) return { error: `Cantidad inválida en ${nombre}` }
    const n = Math.round(Number(raw.personasPorUnidad))
    if (modo === 'COMPARTIDO' && !(n >= 2 && n <= 1000)) return { error: `${nombre}: decí para cuántas personas rinde (2 o más)` }
    items.push({
      id: esUuid(raw.id) ? raw.id : undefined,
      orden: k,
      paso,
      productoId: esUuid(raw.productoId) ? raw.productoId : null,
      nombre,
      descripcion: texto(raw.descripcion, 300),
      modo,
      cantidad: Math.round(cantidad * 1000) / 1000,
      personasPorUnidad: modo === 'COMPARTIDO' ? n : null,
      unidad: texto(raw.unidad, 30),
      aplica: APLICA_OK.includes(raw.aplica as Aplica) ? (raw.aplica as Aplica) : 'TODOS',
      precioManual: numero(raw.precioManual),
    })
  }
  return { items }
}

// ---------------------------------------------------------------------------
// Adicionales
// ---------------------------------------------------------------------------

/**
 * Adicionales de un evento, o de una reserva junto con los que hereda de su
 * evento (marcados `delEvento`, primero: son los que valen para todos).
 */
export async function adicionalesDe(dueno: { eventoId?: string | null | undefined; reservaId?: string | null | undefined }): Promise<Adicional[]> {
  return prisma.$queryRaw<Adicional[]>`
    SELECT a.id, a.descripcion, a.modalidad, a.aplica, a.cantidad::float8 AS cantidad,
           a."precioUnitario"::float8 AS "precioUnitario", a.paga, a.nota, a.orden,
           (a."eventoId" IS NOT NULL AND ${dueno.reservaId ?? null}::uuid IS NOT NULL) AS "delEvento"
      FROM evento_adicionales a
     WHERE (${dueno.reservaId ?? null}::uuid IS NOT NULL AND (
              a."reservaId" = ${dueno.reservaId ?? null}::uuid
              OR a."eventoId" = (SELECT r."eventoId" FROM reservas r WHERE r.id = ${dueno.reservaId ?? null}::uuid)))
        OR (${dueno.reservaId ?? null}::uuid IS NULL AND a."eventoId" = ${dueno.eventoId ?? null}::uuid)
     ORDER BY (a."eventoId" IS NULL), a.orden, a."createdAt"
  `
}

export type AdicionalEntrada = Omit<Adicional, 'delEvento'>

export function leerAdicionales(v: unknown, deEvento: boolean): { adicionales: AdicionalEntrada[] } | { error: string } {
  if (!Array.isArray(v)) return { error: 'Adicionales inválidos' }
  if (v.length > 100) return { error: 'Demasiados adicionales' }
  const out: AdicionalEntrada[] = []
  for (const [k, raw] of (v as Array<Record<string, unknown>>).entries()) {
    const descripcion = texto(raw?.descripcion, 160)
    if (!descripcion) continue
    const modalidad: Modalidad = raw.modalidad === 'FIJO' ? 'FIJO' : 'PERSONA'
    const c = numero(raw.cantidad)
    out.push({
      id: esUuid(raw.id) ? raw.id : undefined,
      descripcion,
      modalidad,
      aplica: APLICA_OK.includes(raw.aplica as Aplica) ? (raw.aplica as Aplica) : 'TODOS',
      // En el evento, "por persona" es siempre por las personas de cada
      // reserva: una cantidad fija ahí se cobraría igual a todas.
      cantidad: c && c > 0 && !(deEvento && modalidad === 'PERSONA') ? c : null,
      precioUnitario: numero(raw.precioUnitario) ?? 0,
      paga: (raw.paga === 'PASAJERO' ? 'PASAJERO' : 'TITULAR') as Paga,
      nota: texto(raw.nota, 200),
      orden: k,
    })
  }
  return { adicionales: out }
}

/** Reemplaza los adicionales propios de un evento o una reserva (no toca los heredados). */
export async function guardarAdicionales(
  tx: Tx,
  clienteId: string,
  dueno: { eventoId?: string | null | undefined; reservaId?: string | null | undefined },
  xs: AdicionalEntrada[]
) {
  const previos = await tx.$queryRaw<Array<{ id: string; createdAt: Date }>>`
    DELETE FROM evento_adicionales
     WHERE "clienteId" = ${clienteId}::uuid
       AND ("eventoId" = ${dueno.eventoId ?? null}::uuid OR "reservaId" = ${dueno.reservaId ?? null}::uuid)
    RETURNING id::text, "createdAt"
  `
  if (xs.length === 0) return
  // Se conserva el id y la fecha de alta de lo que ya estaba: la fecha es la
  // que ordena las sugerencias.
  const alta = new Map(previos.map((p) => [p.id, p.createdAt]))
  await tx.$executeRaw`
    INSERT INTO evento_adicionales (id, "clienteId", "eventoId", "reservaId", descripcion, modalidad, aplica, cantidad,
                                    "precioUnitario", paga, nota, orden, "createdAt")
    VALUES ${Prisma.join(
      xs.map(
        (a, k) => Prisma.sql`(COALESCE(${a.id && alta.has(a.id) ? a.id : null}::uuid, gen_random_uuid()), ${clienteId}::uuid,
          ${dueno.eventoId ?? null}::uuid, ${dueno.reservaId ?? null}::uuid, ${a.descripcion}, ${a.modalidad}, ${a.aplica},
          ${a.cantidad}::numeric, ${a.precioUnitario}::numeric, ${a.paga}, ${a.nota}, ${k},
          COALESCE(${(a.id && alta.get(a.id)) || null}::timestamptz, now()))`
      )
    )}
  `
}

/** "Copa de bienvenida (por adulto, titular)" para la auditoría, sin importes. */
export function adicionalesTexto(xs: Array<Pick<Adicional, 'descripcion' | 'modalidad' | 'aplica' | 'cantidad' | 'paga'>>) {
  return (
    xs
      .map((a) => `${a.descripcion} (${a.cantidad ? `${a.cantidad} × ` : ''}${modalidadTexto(a)}, ${a.paga === 'TITULAR' ? 'titular' : 'cada pasajero'})`)
      .join(', ') || 'ninguno'
  )
}

/** Descripciones ya usadas, las más usadas primero, para sugerir al cargar. */
export async function sugerenciasAdicionales(clienteId: string) {
  const filas = await prisma.$queryRaw<
    Array<{ descripcion: string; modalidad: Modalidad; aplica: Aplica; paga: Paga; precioUnitario: number; usos: number }>
  >`
    SELECT DISTINCT ON (lower(a.descripcion)) a.descripcion, a.modalidad, a.aplica, a.paga,
           a."precioUnitario"::float8 AS "precioUnitario",
           count(*) OVER (PARTITION BY lower(a.descripcion))::int AS usos
      FROM evento_adicionales a
     WHERE a."clienteId" = ${clienteId}::uuid
     ORDER BY lower(a.descripcion), a."createdAt" DESC
  `
  return filas.sort((a, b) => b.usos - a.usos).slice(0, 60)
}

export { limpiarCopiasMenu }
