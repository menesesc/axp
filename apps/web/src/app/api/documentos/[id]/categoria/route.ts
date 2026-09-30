import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { normDesc } from '@/lib/compras/categorias'

export const dynamic = 'force-dynamic'

/**
 * Cambia la categoría de compra de una línea del documento. Como la
 * categoría es por descripción, aplica a todas las líneas con ese texto.
 * Queda como asignación manual (la IA no la pisa).
 * Body: { itemId, categoriaId }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_COMPROBANTES, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
  const { id } = await params

  const body = await request.json().catch(() => null)
  const item = await prisma.documento_items.findFirst({
    where: { id: String(body?.itemId || ''), documentoId: id, documentos: { clienteId } },
    select: { descripcion: true },
  })
  if (!item) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
  const cat = await prisma.compra_categorias.findFirst({ where: { id: String(body?.categoriaId || ''), clienteId } })
  if (!cat) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

  const descripcionNorm = normDesc(item.descripcion).slice(0, 500)
  await prisma.compra_item_categoria.upsert({
    where: { clienteId_descripcionNorm: { clienteId, descripcionNorm } },
    create: { clienteId, descripcionNorm, categoriaId: cat.id, fuente: 'manual' },
    update: { categoriaId: cat.id, fuente: 'manual', updatedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
