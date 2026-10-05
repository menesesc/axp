import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { costoDeReceta, costoPorInsumo } from '@/lib/recetas/costo'
import { puedeEditarRecetario } from '@/lib/recetas/permisos'

export const dynamic = 'force-dynamic'

/**
 * Listado del recetario.
 *
 * Los borradores los ve únicamente quien puede editar: para el resto del
 * equipo una receta a medio cargar no existe.
 */
export async function GET(request: NextRequest) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const puedeEditar = puedeEditarRecetario(user)
  const sp = request.nextUrl.searchParams
  const categoriaId = sp.get('categoriaId') || undefined

  const recetas = await prisma.recetas.findMany({
    where: {
      clienteId,
      ...(puedeEditar ? {} : { estado: 'publicada' }),
      ...(categoriaId ? { categoriaId } : {}),
    },
    orderBy: [{ destacada: 'desc' }, { updatedAt: 'desc' }],
    include: {
      categoria: { select: { id: true, nombre: true, emoji: true, color: true } },
      dispositivos: { select: { dispositivoId: true } },
      favoritas: user?.id ? { where: { usuarioId: user.id }, select: { usuarioId: true } } : false,
      ingredientes: { select: { nombre: true, cantidad: true, unidad: true, insumoId: true, insumo: { select: { unidadBase: true } } } },
      _count: { select: { pasos: true } },
    },
  })

  // El costo es plata: sin el flag de importes se omite del payload entero,
  // no alcanza con no mostrarlo en la UI.
  const precios = verImportes ? await costoPorInsumo(clienteId) : null

  return NextResponse.json({
    puedeEditar,
    recetas: recetas.map((r) => {
      const costo = precios ? costoDeReceta(r.ingredientes, precios) : null
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
        categoria: r.categoria,
        dispositivoIds: r.dispositivos.map((d) => d.dispositivoId),
        favorita: Array.isArray(r.favoritas) && r.favoritas.length > 0,
        pasos: r._count.pasos,
        costoPorcion: costo && r.porciones > 0 ? costo.total / r.porciones : null,
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

  const receta = await prisma.recetas.create({
    data: {
      clienteId,
      titulo,
      estado: body?.estado === 'publicada' ? 'publicada' : 'borrador',
      porciones: Number(body?.porciones) > 0 ? Number(body.porciones) : 1,
      createdById: user?.id ?? null,
    },
    select: { id: true },
  })
  return NextResponse.json({ receta })
}
