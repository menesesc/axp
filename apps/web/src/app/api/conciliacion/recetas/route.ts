import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId, requireAdmin } from '@/lib/auth'
import { UNIDADES, sameDimension } from '@/lib/conciliacion/units'

export const dynamic = 'force-dynamic'

/** Receta activa de un producto (?productMasterId=) con sus ingredientes. */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const productMasterId = request.nextUrl.searchParams.get('productMasterId')
  if (!productMasterId) return NextResponse.json({ error: 'Falta productMasterId' }, { status: 400 })

  const producto = await prisma.sales_product_master.findFirst({
    where: { id: productMasterId, clienteId: clienteId! },
    select: { id: true, nombre: true },
  })
  if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const receta = await prisma.sales_recipes.findFirst({
    where: { productMasterId, activa: true },
    include: {
      ingredients: {
        include: { insumo: { select: { id: true, nombre: true, unidadBase: true } } },
      },
    },
  })

  return NextResponse.json({
    producto,
    receta: receta
      ? {
          id: receta.id,
          version: receta.version,
          notas: receta.notas,
          items: receta.ingredients.map((ri) => ({
            id: ri.id,
            insumoId: ri.insumoId,
            insumoNombre: ri.insumo?.nombre ?? null,
            insumoUnidadBase: ri.insumo?.unidadBase ?? null,
            itemDescripcion: ri.itemDescripcion,
            cantidad: Number(ri.cantidad),
            unidad: ri.unidad,
            mermaPct: Number(ri.mermaPct),
            notas: ri.notas,
          })),
        }
      : null,
  })
}

interface ItemInput {
  insumoId?: string | null
  itemDescripcion: string
  cantidad: number
  unidad: string
  mermaPct?: number
  notas?: string | null
}

/**
 * Crea/reemplaza la receta de un producto. Si ya hay una activa, la desactiva y
 * crea una versión nueva (versionado). Valida que la unidad de cada ingrediente
 * sea compatible con la unidadBase de su insumo. Solo admin.
 */
export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const productMasterId = String(body.productMasterId || '')
  const notas = body.notas ? String(body.notas).trim() : null
  const items: ItemInput[] = Array.isArray(body.items) ? body.items : []

  const producto = await prisma.sales_product_master.findFirst({
    where: { id: productMasterId, clienteId },
    select: { id: true },
  })
  if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  // Validación de items + carga de insumos referenciados (deben ser del cliente).
  const insumoIds = [...new Set(items.map((i) => i.insumoId).filter(Boolean) as string[])]
  const insumos = insumoIds.length
    ? await prisma.insumos.findMany({
        where: { id: { in: insumoIds }, clienteId },
        select: { id: true, nombre: true, unidadBase: true },
      })
    : []
  const insumoMap = new Map(insumos.map((i) => [i.id, i]))

  for (const it of items) {
    const desc = String(it.itemDescripcion || '').trim()
    if (!desc) return NextResponse.json({ error: 'Cada ingrediente necesita una descripción' }, { status: 400 })
    if (!Number.isFinite(it.cantidad) || it.cantidad <= 0) {
      return NextResponse.json({ error: `Cantidad inválida en "${desc}"` }, { status: 400 })
    }
    if (!UNIDADES.includes(it.unidad as never)) {
      return NextResponse.json({ error: `Unidad inválida en "${desc}": ${it.unidad}` }, { status: 400 })
    }
    const merma = it.mermaPct ?? 0
    if (!Number.isFinite(merma) || merma < 0 || merma > 100) {
      return NextResponse.json({ error: `Merma inválida en "${desc}" (0-100)` }, { status: 400 })
    }
    if (it.insumoId) {
      const ins = insumoMap.get(it.insumoId)
      if (!ins) return NextResponse.json({ error: `Insumo no encontrado para "${desc}"` }, { status: 400 })
      if (!sameDimension(it.unidad, ins.unidadBase)) {
        return NextResponse.json(
          { error: `La unidad "${it.unidad}" de "${desc}" no es compatible con la unidad base "${ins.unidadBase}" del insumo ${ins.nombre}` },
          { status: 400 }
        )
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const agg = await tx.sales_recipes.aggregate({
      where: { productMasterId },
      _max: { version: true },
    })
    const nextVersion = (agg._max.version ?? 0) + 1

    await tx.sales_recipes.updateMany({
      where: { productMasterId, activa: true },
      data: { activa: false },
    })

    return tx.sales_recipes.create({
      data: {
        productMasterId,
        version: nextVersion,
        activa: true,
        notas,
        ingredients: {
          create: items.map((it) => ({
            insumoId: it.insumoId || null,
            itemDescripcion: String(it.itemDescripcion).trim(),
            cantidad: it.cantidad,
            unidad: it.unidad,
            mermaPct: it.mermaPct ?? 0,
            notas: it.notas ? String(it.notas).trim() : null,
          })),
        },
      },
      include: { ingredients: true },
    })
  })

  return NextResponse.json({ receta: result }, { status: 201 })
}
