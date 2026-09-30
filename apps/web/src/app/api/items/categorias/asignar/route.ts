import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { normDesc } from '@/lib/compras/categorias'

export const dynamic = 'force-dynamic'

/**
 * Asigna a mano la categoría de una descripción (afecta a todas las líneas con
 * ese mismo texto). Queda con fuente 'manual': la IA no la vuelve a tocar.
 * Body: { descripcion: string, categoriaId: string }
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const descripcionNorm = normDesc(String(body?.descripcion || '')).slice(0, 500)
  const categoriaId = String(body?.categoriaId || '')
  if (!descripcionNorm || !categoriaId) {
    return NextResponse.json({ error: 'Faltan descripción o categoría' }, { status: 400 })
  }
  const cat = await prisma.compra_categorias.findFirst({ where: { id: categoriaId, clienteId } })
  if (!cat) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })

  await prisma.compra_item_categoria.upsert({
    where: { clienteId_descripcionNorm: { clienteId, descripcionNorm } },
    create: { clienteId, descripcionNorm, categoriaId, fuente: 'manual' },
    update: { categoriaId, fuente: 'manual', updatedAt: new Date() },
  })
  return NextResponse.json({ ok: true, categoria: { id: cat.id, nombre: cat.nombre } })
}
