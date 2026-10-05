import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { existeReceta, guardarNota } from '@/lib/recetas/db'

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

  if (!(await existeReceta(id, clienteId!))) {
    return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })
  }

  const texto = String((await request.json().catch(() => ({})))?.texto || '').trim()
  await guardarNota(id, user.id, texto)
  return NextResponse.json({ ok: true, texto: texto || null })
}
