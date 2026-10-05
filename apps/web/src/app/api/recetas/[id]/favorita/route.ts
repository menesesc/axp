import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { alternarFavorita, existeReceta } from '@/lib/recetas/db'

export const dynamic = 'force-dynamic'

/** Marca o desmarca la receta como favorita del usuario. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  if (!user?.id) return NextResponse.json({ error: 'Sesión inválida' }, { status: 403 })
  const { id } = await params

  if (!(await existeReceta(id, clienteId!))) {
    return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })
  }
  return NextResponse.json({ favorita: await alternarFavorita(id, user.id) })
}
