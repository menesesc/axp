import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Acceso a las tablas del recetario, con SQL crudo.
 *
 * El cliente Prisma de producción no se regenera en el build, así que no
 * conoce estos modelos: todo lo nuevo se lee y se escribe con $queryRaw /
 * $executeRaw, igual que `usuarios.permisos`. Concentrar las consultas acá
 * deja las rutas legibles y en un solo lugar si algún día se puede volver al
 * cliente tipado.
 */

export interface RecetaRow {
  id: string
  titulo: string
  descripcion: string | null
  estado: string
  prepMin: number | null
  totalMin: number | null
  porciones: number
  dificultad: string | null
  autor: string | null
  fotoKey: string | null
  youtubeUrl: string | null
  destacada: boolean
  categoriaId: string | null
  categoriaNombre: string | null
  categoriaEmoji: string | null
  categoriaColor: string | null
}

export interface IngredienteRow {
  id: string
  recetaId: string
  seccion: string | null
  orden: number
  nombre: string
  cantidad: number | null
  unidad: string | null
  nota: string | null
  insumoId: string | null
  insumoNombre: string | null
  insumoUnidad: string | null
}

const SELECT_RECETA = Prisma.sql`
  SELECT r.id, r.titulo, r.descripcion, r.estado, r."prepMin", r."totalMin",
         r.porciones, r.dificultad, r.autor, r."fotoKey", r."youtubeUrl",
         r.destacada, r."categoriaId",
         c.nombre AS "categoriaNombre", c.emoji AS "categoriaEmoji", c.color AS "categoriaColor"
    FROM recetas r
    LEFT JOIN receta_categorias c ON c.id = r."categoriaId"
`

export async function listarRecetas(clienteId: string, incluirBorradores: boolean): Promise<RecetaRow[]> {
  return prisma.$queryRaw<RecetaRow[]>`
    ${SELECT_RECETA}
    WHERE r."clienteId" = ${clienteId}::uuid
      AND (${incluirBorradores} OR r.estado = 'publicada')
    ORDER BY r.destacada DESC, r."updatedAt" DESC
  `
}

export async function obtenerReceta(id: string, clienteId: string): Promise<RecetaRow | null> {
  const filas = await prisma.$queryRaw<RecetaRow[]>`
    ${SELECT_RECETA}
    WHERE r.id = ${id}::uuid AND r."clienteId" = ${clienteId}::uuid
    LIMIT 1
  `
  return filas[0] ?? null
}

/** Ingredientes de una o varias recetas, con el insumo vinculado si lo tiene. */
export async function ingredientesDe(recetaIds: string[]): Promise<IngredienteRow[]> {
  if (recetaIds.length === 0) return []
  return prisma.$queryRaw<IngredienteRow[]>`
    SELECT ri.id, ri."recetaId", ri.seccion, ri.orden, ri.nombre,
           ri.cantidad::float8 AS cantidad, ri.unidad, ri.nota, ri."insumoId",
           i.nombre AS "insumoNombre", i."unidadBase" AS "insumoUnidad"
      FROM receta_ingredientes ri
      LEFT JOIN insumos i ON i.id = ri."insumoId"
     WHERE ri."recetaId" = ANY(${recetaIds}::uuid[])
     ORDER BY ri."recetaId", ri.orden
  `
}

export async function pasosDe(recetaId: string) {
  return prisma.$queryRaw<Array<{ id: string; seccion: string | null; orden: number; texto: string }>>`
    SELECT id, seccion, orden, texto FROM receta_pasos
     WHERE "recetaId" = ${recetaId}::uuid ORDER BY orden
  `
}

export async function sugerenciasDe(recetaId: string) {
  return prisma.$queryRaw<Array<{ id: string; texto: string }>>`
    SELECT id, texto FROM receta_sugerencias WHERE "recetaId" = ${recetaId}::uuid ORDER BY orden
  `
}

export async function dispositivosDe(recetaIds: string[]) {
  if (recetaIds.length === 0) return []
  return prisma.$queryRaw<Array<{ recetaId: string; id: string; nombre: string; emoji: string | null }>>`
    SELECT rd."recetaId", d.id, d.nombre, d.emoji
      FROM receta_dispositivos rd
      JOIN dispositivos d ON d.id = rd."dispositivoId"
     WHERE rd."recetaId" = ANY(${recetaIds}::uuid[])
     ORDER BY d.orden
  `
}

export async function pasosPorReceta(recetaIds: string[]) {
  if (recetaIds.length === 0) return new Map<string, number>()
  const filas = await prisma.$queryRaw<Array<{ recetaId: string; n: bigint }>>`
    SELECT "recetaId", COUNT(*)::bigint AS n FROM receta_pasos
     WHERE "recetaId" = ANY(${recetaIds}::uuid[]) GROUP BY "recetaId"
  `
  return new Map(filas.map((f) => [f.recetaId, Number(f.n)]))
}

export async function favoritasDe(usuarioId: string | null | undefined, recetaIds: string[]) {
  if (!usuarioId || recetaIds.length === 0) return new Set<string>()
  const filas = await prisma.$queryRaw<Array<{ recetaId: string }>>`
    SELECT "recetaId" FROM receta_favoritas
     WHERE "usuarioId" = ${usuarioId}::uuid AND "recetaId" = ANY(${recetaIds}::uuid[])
  `
  return new Set(filas.map((f) => f.recetaId))
}

export async function notaDe(recetaId: string, usuarioId: string | null | undefined) {
  if (!usuarioId) return null
  const filas = await prisma.$queryRaw<Array<{ texto: string }>>`
    SELECT texto FROM receta_notas WHERE "recetaId" = ${recetaId}::uuid AND "usuarioId" = ${usuarioId}::uuid
  `
  return filas[0]?.texto ?? null
}

export async function guardarNota(recetaId: string, usuarioId: string, texto: string) {
  if (!texto) {
    await prisma.$executeRaw`
      DELETE FROM receta_notas WHERE "recetaId" = ${recetaId}::uuid AND "usuarioId" = ${usuarioId}::uuid
    `
    return
  }
  await prisma.$executeRaw`
    INSERT INTO receta_notas ("recetaId","usuarioId",texto,"updatedAt")
    VALUES (${recetaId}::uuid, ${usuarioId}::uuid, ${texto}, NOW())
    ON CONFLICT ("recetaId","usuarioId") DO UPDATE SET texto = EXCLUDED.texto, "updatedAt" = NOW()
  `
}

/** Alterna la favorita y devuelve el estado nuevo. */
export async function alternarFavorita(recetaId: string, usuarioId: string): Promise<boolean> {
  const borradas = await prisma.$executeRaw`
    DELETE FROM receta_favoritas WHERE "recetaId" = ${recetaId}::uuid AND "usuarioId" = ${usuarioId}::uuid
  `
  if (borradas > 0) return false
  await prisma.$executeRaw`
    INSERT INTO receta_favoritas ("recetaId","usuarioId") VALUES (${recetaId}::uuid, ${usuarioId}::uuid)
  `
  return true
}

export async function existeReceta(id: string, clienteId: string): Promise<boolean> {
  const filas = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM recetas WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid LIMIT 1
  `
  return filas.length > 0
}

export async function crearReceta(
  clienteId: string,
  titulo: string,
  estado: string,
  porciones: number,
  createdById: string | null
): Promise<string> {
  const filas = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO recetas ("clienteId", titulo, estado, porciones, "createdById")
    VALUES (${clienteId}::uuid, ${titulo}, ${estado}, ${porciones}, ${createdById}::uuid)
    RETURNING id
  `
  return filas[0]!.id
}

export async function eliminarReceta(id: string, clienteId: string) {
  await prisma.$executeRaw`DELETE FROM recetas WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid`
}

export interface DatosReceta {
  titulo?: string
  descripcion?: string | null
  estado?: string
  categoriaId?: string | null
  prepMin?: number | null
  totalMin?: number | null
  porciones?: number
  dificultad?: string | null
  autor?: string | null
  fotoKey?: string | null
  youtubeUrl?: string | null
  destacada?: boolean
}

export interface IngredienteEntrada {
  seccion: string | null
  nombre: string
  cantidad: number | null
  unidad: string | null
  nota: string | null
  insumoId: string | null
}

/**
 * Guarda la receta y reemplaza sus listas en bloque, todo en una transacción:
 * borrar fuera de ella dejaría la receta vacía si el insert posterior falla.
 */
export async function actualizarReceta(
  id: string,
  clienteId: string,
  datos: DatosReceta,
  dispositivoIds: string[] | null,
  ingredientes: IngredienteEntrada[] | null,
  pasos: Array<{ seccion: string | null; texto: string }> | null,
  sugerencias: string[] | null
) {
  const sets: Prisma.Sql[] = []
  const campo = (col: string, valor: unknown) => sets.push(Prisma.sql`${Prisma.raw(`"${col}"`)} = ${valor}`)

  if (datos.titulo !== undefined) campo('titulo', datos.titulo)
  if (datos.descripcion !== undefined) campo('descripcion', datos.descripcion)
  if (datos.estado !== undefined) campo('estado', datos.estado)
  if (datos.prepMin !== undefined) campo('prepMin', datos.prepMin)
  if (datos.totalMin !== undefined) campo('totalMin', datos.totalMin)
  if (datos.porciones !== undefined) campo('porciones', datos.porciones)
  if (datos.dificultad !== undefined) campo('dificultad', datos.dificultad)
  if (datos.autor !== undefined) campo('autor', datos.autor)
  if (datos.fotoKey !== undefined) campo('fotoKey', datos.fotoKey)
  if (datos.youtubeUrl !== undefined) campo('youtubeUrl', datos.youtubeUrl)
  if (datos.destacada !== undefined) campo('destacada', datos.destacada)
  if (datos.categoriaId !== undefined) {
    sets.push(Prisma.sql`"categoriaId" = ${datos.categoriaId}::uuid`)
  }
  sets.push(Prisma.sql`"updatedAt" = NOW()`)

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.$executeRaw`
      UPDATE recetas SET ${Prisma.join(sets, ', ')}
       WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
    `,
  ]

  if (dispositivoIds) {
    ops.push(prisma.$executeRaw`DELETE FROM receta_dispositivos WHERE "recetaId" = ${id}::uuid`)
    if (dispositivoIds.length > 0) {
      // El filtro por clienteId evita que un id de otra empresa entre por el body.
      ops.push(prisma.$executeRaw`
        INSERT INTO receta_dispositivos ("recetaId","dispositivoId")
        SELECT ${id}::uuid, d.id FROM dispositivos d
         WHERE d.id = ANY(${dispositivoIds}::uuid[]) AND d."clienteId" = ${clienteId}::uuid
      `)
    }
  }

  if (ingredientes) {
    ops.push(prisma.$executeRaw`DELETE FROM receta_ingredientes WHERE "recetaId" = ${id}::uuid`)
    ingredientes.forEach((ing, orden) => {
      ops.push(prisma.$executeRaw`
        INSERT INTO receta_ingredientes ("recetaId",seccion,orden,nombre,cantidad,unidad,nota,"insumoId")
        VALUES (${id}::uuid, ${ing.seccion}, ${orden}, ${ing.nombre}, ${ing.cantidad},
                ${ing.unidad}, ${ing.nota}, ${ing.insumoId}::uuid)
      `)
    })
  }

  if (pasos) {
    ops.push(prisma.$executeRaw`DELETE FROM receta_pasos WHERE "recetaId" = ${id}::uuid`)
    pasos.forEach((p, orden) => {
      ops.push(prisma.$executeRaw`
        INSERT INTO receta_pasos ("recetaId",seccion,orden,texto)
        VALUES (${id}::uuid, ${p.seccion}, ${orden}, ${p.texto})
      `)
    })
  }

  if (sugerencias) {
    ops.push(prisma.$executeRaw`DELETE FROM receta_sugerencias WHERE "recetaId" = ${id}::uuid`)
    sugerencias.forEach((t, orden) => {
      ops.push(prisma.$executeRaw`
        INSERT INTO receta_sugerencias ("recetaId",orden,texto) VALUES (${id}::uuid, ${orden}, ${t})
      `)
    })
  }

  await prisma.$transaction(ops)
}

// --------------------------------------------------------------------------
// Categorías y dispositivos
// --------------------------------------------------------------------------

export interface CatalogoRow {
  id: string
  nombre: string
  emoji: string | null
  color?: string | null
  orden: number
  recetas: number
}

export async function listarCategorias(clienteId: string): Promise<CatalogoRow[]> {
  const filas = await prisma.$queryRaw<Array<CatalogoRow & { recetas: bigint }>>`
    SELECT c.id, c.nombre, c.emoji, c.color, c.orden,
           COUNT(r.id)::bigint AS recetas
      FROM receta_categorias c
      LEFT JOIN recetas r ON r."categoriaId" = c.id
     WHERE c."clienteId" = ${clienteId}::uuid AND c.activo = true
     GROUP BY c.id ORDER BY c.orden, c.nombre
  `
  return filas.map((f) => ({ ...f, recetas: Number(f.recetas) }))
}

export async function listarDispositivos(clienteId: string): Promise<CatalogoRow[]> {
  const filas = await prisma.$queryRaw<Array<CatalogoRow & { recetas: bigint }>>`
    SELECT d.id, d.nombre, d.emoji, d.orden,
           COUNT(rd."recetaId")::bigint AS recetas
      FROM dispositivos d
      LEFT JOIN receta_dispositivos rd ON rd."dispositivoId" = d.id
     WHERE d."clienteId" = ${clienteId}::uuid AND d.activo = true
     GROUP BY d.id ORDER BY d.orden, d.nombre
  `
  return filas.map((f) => ({ ...f, recetas: Number(f.recetas) }))
}

export async function crearEnCatalogo(
  tabla: 'receta_categorias' | 'dispositivos',
  clienteId: string,
  nombre: string,
  emoji: string | null,
  color: string | null
): Promise<{ ok: boolean; error?: string }> {
  const t = Prisma.raw(tabla)
  const dup = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM ${t} WHERE "clienteId" = ${clienteId}::uuid AND nombre = ${nombre} LIMIT 1
  `
  if (dup.length > 0) return { ok: false, error: 'Ya existe uno con ese nombre' }

  const [ult] = await prisma.$queryRaw<Array<{ orden: number | null }>>`
    SELECT MAX(orden) AS orden FROM ${t} WHERE "clienteId" = ${clienteId}::uuid
  `
  const orden = (ult?.orden ?? 0) + 10

  if (tabla === 'receta_categorias') {
    await prisma.$executeRaw`
      INSERT INTO receta_categorias ("clienteId",nombre,emoji,color,orden)
      VALUES (${clienteId}::uuid, ${nombre}, ${emoji}, ${color}, ${orden})
    `
  } else {
    await prisma.$executeRaw`
      INSERT INTO dispositivos ("clienteId",nombre,emoji,orden)
      VALUES (${clienteId}::uuid, ${nombre}, ${emoji}, ${orden})
    `
  }
  return { ok: true }
}

export async function actualizarCatalogo(
  tabla: 'receta_categorias' | 'dispositivos',
  clienteId: string,
  id: string,
  cambios: { nombre?: string; emoji?: string | null; color?: string | null; orden?: number; activo?: boolean }
): Promise<boolean> {
  const sets: Prisma.Sql[] = []
  if (cambios.nombre !== undefined) sets.push(Prisma.sql`nombre = ${cambios.nombre}`)
  if (cambios.emoji !== undefined) sets.push(Prisma.sql`emoji = ${cambios.emoji}`)
  if (cambios.color !== undefined && tabla === 'receta_categorias') sets.push(Prisma.sql`color = ${cambios.color}`)
  if (cambios.orden !== undefined) sets.push(Prisma.sql`orden = ${cambios.orden}`)
  if (cambios.activo !== undefined) sets.push(Prisma.sql`activo = ${cambios.activo}`)
  if (sets.length === 0) return true
  sets.push(Prisma.sql`"updatedAt" = NOW()`)

  const n = await prisma.$executeRaw`
    UPDATE ${Prisma.raw(tabla)} SET ${Prisma.join(sets, ', ')}
     WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return n > 0
}
