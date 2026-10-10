import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { costoDeReceta, costoPorInsumo } from '@/lib/recetas/costo'
import { puedeEditarRecetario } from '@/lib/recetas/permisos'
import {
  crearReceta,
  dispositivosDe,
  favoritasDe,
  ingredientesDe,
  listarRecetas,
  pasosPorReceta,
} from '@/lib/recetas/db'

export const dynamic = 'force-dynamic'

/**
 * Listado del recetario.
 *
 * Los borradores los ve únicamente quien puede editar: para el resto del
 * equipo una receta a medio cargar no existe.
 */
export async function GET(_request: NextRequest) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const puedeEditar = puedeEditarRecetario(user)
  const filas = await listarRecetas(clienteId, puedeEditar)
  const ids = filas.map((r) => r.id)

  const [ingredientes, dispositivos, pasos, favoritas, precios] = await Promise.all([
    ingredientesDe(ids),
    dispositivosDe(ids),
    pasosPorReceta(ids),
    favoritasDe(user?.id, ids),
    // El costo es plata: sin el flag de importes no se calcula ni viaja.
    verImportes ? costoPorInsumo(clienteId) : Promise.resolve(null),
  ])

  const ingPorReceta = new Map<string, typeof ingredientes>()
  for (const i of ingredientes) {
    const arr = ingPorReceta.get(i.recetaId)
    if (arr) arr.push(i)
    else ingPorReceta.set(i.recetaId, [i])
  }
  const dispPorReceta = new Map<string, string[]>()
  for (const d of dispositivos) {
    const arr = dispPorReceta.get(d.recetaId)
    if (arr) arr.push(d.id)
    else dispPorReceta.set(d.recetaId, [d.id])
  }

  return NextResponse.json({
    puedeEditar,
    recetas: filas.map((r) => {
      const ings = ingPorReceta.get(r.id) ?? []
      const costo = precios
        ? costoDeReceta(
            ings.map((i) => ({
              nombre: i.nombre,
              cantidad: i.cantidad,
              unidad: i.unidad,
              insumoId: i.insumoId,
              insumo: i.insumoUnidad ? { unidadBase: i.insumoUnidad } : null,
              mermaPct: i.mermaPct,
            })),
            precios
          )
        : null
      return {
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
        categoria: r.categoriaId
          ? { id: r.categoriaId, nombre: r.categoriaNombre, emoji: r.categoriaEmoji, color: r.categoriaColor }
          : null,
        dispositivoIds: dispPorReceta.get(r.id) ?? [],
        favorita: favoritas.has(r.id),
        pasos: pasos.get(r.id) ?? 0,
        costoPorcion: costo && costo.costeados > 0 && r.porciones > 0 ? costo.total / r.porciones : null,
        costoParcial: costo ? costo.costeados < costo.ingredientes : false,
      }
    }),
  })
}

/** Crea una receta. Nace en borrador salvo que se diga lo contrario. */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const titulo = String(body?.titulo || '').trim()
  if (!titulo) return NextResponse.json({ error: 'La receta necesita un título' }, { status: 400 })

  const id = await crearReceta(
    clienteId,
    titulo.slice(0, 200),
    body?.estado === 'publicada' ? 'publicada' : 'borrador',
    Number(body?.porciones) > 0 ? Math.round(Number(body.porciones)) : 1,
    user?.id ?? null
  )
  return NextResponse.json({ receta: { id } })
}
