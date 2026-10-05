import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { costoDeReceta, costoPorInsumo } from '@/lib/recetas/costo'
import { puedeEditarRecetario } from '@/lib/recetas/permisos'

export const dynamic = 'force-dynamic'

const INCLUDE = {
  categoria: { select: { id: true, nombre: true, emoji: true, color: true } },
  dispositivos: { include: { dispositivo: { select: { id: true, nombre: true, emoji: true } } } },
  ingredientes: {
    orderBy: { orden: 'asc' as const },
    include: { insumo: { select: { id: true, nombre: true, unidadBase: true } } },
  },
  pasos: { orderBy: { orden: 'asc' as const } },
  sugerencias: { orderBy: { orden: 'asc' as const } },
}

/** Una receta con todo lo necesario para la ficha. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  const { id } = await params

  const r = await prisma.recetas.findFirst({ where: { id, clienteId: clienteId! }, include: INCLUDE })
  if (!r) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

  const editable = puedeEditarRecetario(user)
  // Un borrador no existe para quien no puede editar.
  if (r.estado !== 'publicada' && !editable) {
    return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })
  }

  const [nota, favorita] = await Promise.all([
    user?.id
      ? prisma.receta_notas.findUnique({ where: { recetaId_usuarioId: { recetaId: id, usuarioId: user.id } } })
      : null,
    user?.id
      ? prisma.receta_favoritas.findUnique({ where: { recetaId_usuarioId: { recetaId: id, usuarioId: user.id } } })
      : null,
  ])

  const costo = verImportes ? costoDeReceta(r.ingredientes, await costoPorInsumo(clienteId!)) : null

  return NextResponse.json({
    puedeEditar: editable,
    receta: {
      ...r,
      dispositivos: r.dispositivos.map((d) => d.dispositivo),
      ingredientes: r.ingredientes.map((i) => ({
        ...i,
        cantidad: i.cantidad == null ? null : Number(i.cantidad),
      })),
      nota: nota?.texto ?? null,
      favorita: !!favorita,
      costo,
    },
  })
}

/**
 * Actualiza la receta. Ingredientes, pasos y sugerencias se reemplazan en
 * bloque dentro de una transacción: son listas ordenadas y hacer un diff fila
 * por fila no aporta nada, pero borrarlas fuera de la transacción dejaría la
 * receta vacía si el insert posterior falla.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const { id } = await params
  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const existe = await prisma.recetas.findFirst({ where: { id, clienteId: clienteId! }, select: { id: true } })
  if (!existe) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

  const data: Record<string, unknown> = {}
  const txt = (k: string, max: number) => {
    if (typeof b[k] === 'string') data[k] = b[k].trim().slice(0, max) || null
  }
  if (typeof b.titulo === 'string' && b.titulo.trim()) data.titulo = b.titulo.trim().slice(0, 200)
  txt('descripcion', 4000)
  txt('autor', 80)
  txt('youtubeUrl', 500)
  txt('fotoKey', 500)
  txt('dificultad', 20)
  if (b.estado === 'borrador' || b.estado === 'publicada') data.estado = b.estado
  if (b.categoriaId === null || typeof b.categoriaId === 'string') data.categoriaId = b.categoriaId || null
  for (const k of ['prepMin', 'totalMin', 'porciones'] as const) {
    if (b[k] != null && !Number.isNaN(Number(b[k]))) {
      data[k] = Math.max(k === 'porciones' ? 1 : 0, Math.round(Number(b[k])))
    }
  }
  if (typeof b.destacada === 'boolean') data.destacada = b.destacada

  await prisma.$transaction(async (tx) => {
    await tx.recetas.update({ where: { id }, data })

    if (Array.isArray(b.dispositivoIds)) {
      await tx.receta_dispositivos.deleteMany({ where: { recetaId: id } })
      const ids: string[] = b.dispositivoIds.filter((x: unknown) => typeof x === 'string')
      if (ids.length) {
        // Solo dispositivos del mismo cliente: el id llega del navegador.
        const validos = await tx.dispositivos.findMany({
          where: { id: { in: ids }, clienteId: clienteId! },
          select: { id: true },
        })
        if (validos.length) {
          await tx.receta_dispositivos.createMany({
            data: validos.map((d) => ({ recetaId: id, dispositivoId: d.id })),
          })
        }
      }
    }

    if (Array.isArray(b.ingredientes)) {
      await tx.receta_ingredientes.deleteMany({ where: { recetaId: id } })
      const filas = b.ingredientes
        .filter((i: { nombre?: string }) => typeof i?.nombre === 'string' && i.nombre.trim())
        .map((i: Record<string, unknown>, orden: number) => ({
          recetaId: id,
          orden,
          seccion: typeof i.seccion === 'string' && i.seccion.trim() ? i.seccion.trim().slice(0, 80) : null,
          nombre: String(i.nombre).trim().slice(0, 200),
          cantidad: i.cantidad == null || Number.isNaN(Number(i.cantidad)) ? null : Number(i.cantidad),
          unidad: typeof i.unidad === 'string' ? i.unidad.trim().slice(0, 20) : null,
          nota: typeof i.nota === 'string' && i.nota.trim() ? i.nota.trim().slice(0, 200) : null,
          insumoId: typeof i.insumoId === 'string' && i.insumoId ? i.insumoId : null,
        }))
      if (filas.length) await tx.receta_ingredientes.createMany({ data: filas })
    }

    if (Array.isArray(b.pasos)) {
      await tx.receta_pasos.deleteMany({ where: { recetaId: id } })
      const filas = b.pasos
        .filter((p: { texto?: string }) => typeof p?.texto === 'string' && p.texto.trim())
        .map((p: Record<string, unknown>, orden: number) => ({
          recetaId: id,
          orden,
          seccion: typeof p.seccion === 'string' && p.seccion.trim() ? p.seccion.trim().slice(0, 80) : null,
          texto: String(p.texto).trim(),
        }))
      if (filas.length) await tx.receta_pasos.createMany({ data: filas })
    }

    if (Array.isArray(b.sugerencias)) {
      await tx.receta_sugerencias.deleteMany({ where: { recetaId: id } })
      const filas = b.sugerencias
        .filter((t: unknown) => typeof t === 'string' && t.trim())
        .map((t: string, orden: number) => ({ recetaId: id, orden, texto: t.trim() }))
      if (filas.length) await tx.receta_sugerencias.createMany({ data: filas })
    }
  })

  return NextResponse.json({ ok: true })
}

/** Elimina la receta. El cascade se lleva pasos, ingredientes, notas y favoritas. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const { id } = await params

  const existe = await prisma.recetas.findFirst({ where: { id, clienteId: clienteId! }, select: { id: true } })
  if (!existe) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

  await prisma.recetas.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
