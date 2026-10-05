import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/** Marca o desmarca la receta como favorita del usuario. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  if (!user?.id) return NextResponse.json({ error: 'Sesión inválida' }, { status: 403 })
  const { id } = await params

  const receta = await prisma.recetas.findFirst({ where: { id, clienteId: clienteId! }, select: { id: true } })
  if (!receta) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

  const clave = { recetaId_usuarioId: { recetaId: id, usuarioId: user.id } }
  const actual = await prisma.receta_favoritas.findUnique({ where: clave })
  if (actual) {
    await prisma.receta_favoritas.delete({ where: clave })
    return NextResponse.json({ favorita: false })
  }
  await prisma.receta_favoritas.create({ data: { recetaId: id, usuarioId: user.id } })
  return NextResponse.json({ favorita: true })
}
