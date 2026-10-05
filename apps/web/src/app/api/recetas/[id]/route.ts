import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { costoDeReceta, costoPorInsumo } from '@/lib/recetas/costo'
import { puedeEditarRecetario } from '@/lib/recetas/permisos'
import {
  actualizarReceta,
  dispositivosDe,
  eliminarReceta,
  existeReceta,
  favoritasDe,
  ingredientesDe,
  notaDe,
  obtenerReceta,
  pasosDe,
  sugerenciasDe,
  type DatosReceta,
  type IngredienteEntrada,
} from '@/lib/recetas/db'

export const dynamic = 'force-dynamic'

/** Una receta con todo lo necesario para la ficha. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  const { id } = await params

  const r = await obtenerReceta(id, clienteId!)
  if (!r) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

  const editable = puedeEditarRecetario(user)
  // Un borrador no existe para quien no puede editar: 404, no 403.
  if (r.estado !== 'publicada' && !editable) {
    return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })
  }

  const [ingredientes, pasos, sugerencias, dispositivos, nota, favoritas] = await Promise.all([
    ingredientesDe([id]),
    pasosDe(id),
    sugerenciasDe(id),
    dispositivosDe([id]),
    notaDe(id, user?.id),
    favoritasDe(user?.id, [id]),
  ])

  const costo = verImportes
    ? costoDeReceta(
        ingredientes.map((i) => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          unidad: i.unidad,
          insumoId: i.insumoId,
          insumo: i.insumoUnidad ? { unidadBase: i.insumoUnidad } : null,
        })),
        await costoPorInsumo(clienteId!)
      )
    : null

  return NextResponse.json({
    puedeEditar: editable,
    receta: {
      id: r.id,
      titulo: r.titulo,
      descripcion: r.descripcion,
      estado: r.estado,
      prepMin: r.prepMin,
      totalMin: r.totalMin,
      porciones: r.porciones,
      dificultad: r.dificultad,
      autor: r.autor,
      fotoKey: r.fotoKey,
      youtubeUrl: r.youtubeUrl,
      destacada: r.destacada,
      categoriaId: r.categoriaId,
      categoria: r.categoriaId
        ? { id: r.categoriaId, nombre: r.categoriaNombre, emoji: r.categoriaEmoji, color: r.categoriaColor }
        : null,
      dispositivos: dispositivos.map((d) => ({ id: d.id, nombre: d.nombre, emoji: d.emoji })),
      ingredientes: ingredientes.map((i) => ({
        id: i.id,
        seccion: i.seccion,
        nombre: i.nombre,
        cantidad: i.cantidad,
        unidad: i.unidad,
        nota: i.nota,
        insumoId: i.insumoId,
        insumo: i.insumoId ? { id: i.insumoId, nombre: i.insumoNombre!, unidadBase: i.insumoUnidad! } : null,
      })),
      pasos: pasos.map((p) => ({ id: p.id, seccion: p.seccion, texto: p.texto })),
      sugerencias,
      nota,
      favorita: favoritas.has(id),
      costo,
    },
  })
}

/** Actualiza la receta y reemplaza sus listas. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const { id } = await params
  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (!(await existeReceta(id, clienteId!))) {
    return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })
  }

  const datos: DatosReceta = {}
  const txt = (k: 'descripcion' | 'autor' | 'youtubeUrl' | 'fotoKey' | 'dificultad', max: number) => {
    if (typeof b[k] === 'string') datos[k] = b[k].trim().slice(0, max) || null
  }
  if (typeof b.titulo === 'string' && b.titulo.trim()) datos.titulo = b.titulo.trim().slice(0, 200)
  txt('descripcion', 4000)
  txt('autor', 80)
  txt('youtubeUrl', 500)
  txt('fotoKey', 500)
  txt('dificultad', 20)
  if (b.estado === 'borrador' || b.estado === 'publicada') datos.estado = b.estado
  if (b.categoriaId === null || typeof b.categoriaId === 'string') datos.categoriaId = b.categoriaId || null
  for (const k of ['prepMin', 'totalMin', 'porciones'] as const) {
    if (b[k] != null && !Number.isNaN(Number(b[k]))) {
      datos[k] = Math.max(k === 'porciones' ? 1 : 0, Math.round(Number(b[k])))
    }
  }
  if (typeof b.destacada === 'boolean') datos.destacada = b.destacada

  const ingredientes: IngredienteEntrada[] | null = Array.isArray(b.ingredientes)
    ? b.ingredientes
        .filter((i: { nombre?: string }) => typeof i?.nombre === 'string' && i.nombre.trim())
        .map((i: Record<string, unknown>) => ({
          seccion: typeof i.seccion === 'string' && i.seccion.trim() ? i.seccion.trim().slice(0, 80) : null,
          nombre: String(i.nombre).trim().slice(0, 200),
          cantidad: i.cantidad == null || Number.isNaN(Number(i.cantidad)) ? null : Number(i.cantidad),
          unidad: typeof i.unidad === 'string' && i.unidad ? i.unidad.trim().slice(0, 20) : null,
          nota: typeof i.nota === 'string' && i.nota.trim() ? i.nota.trim().slice(0, 200) : null,
          insumoId: typeof i.insumoId === 'string' && i.insumoId ? i.insumoId : null,
        }))
    : null

  const pasos = Array.isArray(b.pasos)
    ? b.pasos
        .filter((p: { texto?: string }) => typeof p?.texto === 'string' && p.texto.trim())
        .map((p: Record<string, unknown>) => ({
          seccion: typeof p.seccion === 'string' && p.seccion.trim() ? p.seccion.trim().slice(0, 80) : null,
          texto: String(p.texto).trim(),
        }))
    : null

  const sugerencias = Array.isArray(b.sugerencias)
    ? b.sugerencias.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim())
    : null

  const dispositivoIds = Array.isArray(b.dispositivoIds)
    ? b.dispositivoIds.filter((x: unknown) => typeof x === 'string')
    : null

  await actualizarReceta(id, clienteId!, datos, dispositivoIds, ingredientes, pasos, sugerencias)
  return NextResponse.json({ ok: true })
}

/** Elimina la receta. El cascade se lleva pasos, ingredientes, notas y favoritas. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const { id } = await params

  if (!(await existeReceta(id, clienteId!))) {
    return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })
  }
  await eliminarReceta(id, clienteId!)
  return NextResponse.json({ ok: true })
}
