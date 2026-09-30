import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/** Edita nombre y/o abreviatura de una categoría. Body: { nombre?, abreviatura? } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS, 'edit')
  if (error) return error
  const { id } = await params

  const body = await request.json().catch(() => null)
  const data: { nombre?: string; abreviatura?: string | null } = {}
  if (body?.nombre !== undefined) {
    const nombre = String(body.nombre).trim().slice(0, 60)
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    data.nombre = nombre
  }
  if (body?.abreviatura !== undefined) {
    data.abreviatura = String(body.abreviatura || '').trim().toUpperCase().slice(0, 6) || null
  }

  const cat = await prisma.compra_categorias.findFirst({ where: { id, clienteId: clienteId! } })
  if (!cat) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
  try {
    const categoria = await prisma.compra_categorias.update({ where: { id }, data })
    return NextResponse.json({ categoria })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    throw e
  }
}

/**
 * Elimina una categoría. Sus descripciones pasan a "Otros" (manteniendo si la
 * asignación era manual), así no vuelven a la cola de la IA.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS, 'edit')
  if (error) return error
  const { id } = await params

  const cat = await prisma.compra_categorias.findFirst({ where: { id, clienteId: clienteId! } })
  if (!cat) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
  const otros = await prisma.compra_categorias.findFirst({
    where: { clienteId: clienteId!, nombre: { equals: 'Otros', mode: 'insensitive' }, NOT: { id } },
  })

  await prisma.$transaction([
    ...(otros
      ? [prisma.compra_item_categoria.updateMany({ where: { categoriaId: id }, data: { categoriaId: otros.id } })]
      : []),
    prisma.compra_categorias.delete({ where: { id } }),
  ])
  return NextResponse.json({ ok: true })
}
