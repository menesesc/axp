import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Nota privada del usuario sobre una receta.
 *
 * Alcanza con permiso de VER: la nota es del cocinero, no de la receta, y no
 * hace falta poder editar el recetario para anotarse un recordatorio.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  if (!user?.id) return NextResponse.json({ error: 'Sesión inválida' }, { status: 403 })
  const { id } = await params

  const receta = await prisma.recetas.findFirst({ where: { id, clienteId: clienteId! }, select: { id: true } })
  if (!receta) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

  const texto = String((await request.json().catch(() => ({})))?.texto || '').trim()

  if (!texto) {
    await prisma.receta_notas.deleteMany({ where: { recetaId: id, usuarioId: user.id } })
    return NextResponse.json({ ok: true, texto: null })
  }
  await prisma.receta_notas.upsert({
    where: { recetaId_usuarioId: { recetaId: id, usuarioId: user.id } },
    create: { recetaId: id, usuarioId: user.id, texto },
    update: { texto },
  })
  return NextResponse.json({ ok: true, texto })
}
