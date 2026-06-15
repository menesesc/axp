import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId, requireAdmin } from '@/lib/auth'
import { UNIDADES, sameDimension } from '@/lib/conciliacion/units'

export const dynamic = 'force-dynamic'

async function getInsumo(insumoId: string, clienteId: string) {
  return prisma.insumos.findFirst({
    where: { id: insumoId, clienteId },
    select: { id: true, nombre: true, unidadBase: true },
  })
}

/** Productos de venta cuya receta activa usa este insumo (con su cantidad/unidad/merma). */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const insumo = await getInsumo(params.id, clienteId!)
  if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const ingredientes = await prisma.sales_recipe_items.findMany({
    where: {
      insumoId: params.id,
      recipe: { activa: true, productMaster: { clienteId: clienteId! } },
    },
    select: {
      cantidad: true,
      unidad: true,
      mermaPct: true,
      recipe: {
        select: { id: true, productMaster: { select: { id: true, nombre: true, rubroNombre: true } } },
      },
    },
  })

  const productos = ingredientes
    .map((ri) => ({
      productMasterId: ri.recipe.productMaster.id,
      nombre: ri.recipe.productMaster.nombre,
      rubroNombre: ri.recipe.productMaster.rubroNombre,
      cantidad: Number(ri.cantidad),
      unidad: ri.unidad,
      mermaPct: Number(ri.mermaPct),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return NextResponse.json({ insumo, productos })
}

/**
 * Agrega (o actualiza) este insumo como ingrediente en la receta activa de un
 * producto. Si el producto no tiene receta activa, crea una. Si el insumo ya
 * está en la receta, actualiza cantidad/unidad/merma. Solo admin.
 *
 * Body: { productMasterId, cantidad, unidad, mermaPct? }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const insumo = await getInsumo(params.id, clienteId)
  if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const productMasterId = String(body.productMasterId || '')
  const cantidad = Number(body.cantidad)
  const unidad = String(body.unidad || '')
  const mermaPct = body.mermaPct != null ? Number(body.mermaPct) : 0

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }
  if (!UNIDADES.includes(unidad as never)) {
    return NextResponse.json({ error: `Unidad inválida: ${unidad}` }, { status: 400 })
  }
  if (!Number.isFinite(mermaPct) || mermaPct < 0 || mermaPct > 100) {
    return NextResponse.json({ error: 'Merma inválida (0-100)' }, { status: 400 })
  }
  if (!sameDimension(unidad, insumo.unidadBase)) {
    return NextResponse.json(
      { error: `La unidad "${unidad}" no es compatible con la unidad base "${insumo.unidadBase}" del insumo` },
      { status: 400 }
    )
  }

  const producto = await prisma.sales_product_master.findFirst({
    where: { id: productMasterId, clienteId },
    select: { id: true, nombre: true },
  })
  if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    let receta = await tx.sales_recipes.findFirst({
      where: { productMasterId, activa: true },
      select: { id: true },
    })
    if (!receta) {
      const agg = await tx.sales_recipes.aggregate({ where: { productMasterId }, _max: { version: true } })
      receta = await tx.sales_recipes.create({
        data: { productMasterId, version: (agg._max.version ?? 0) + 1, activa: true },
        select: { id: true },
      })
    }

    const existente = await tx.sales_recipe_items.findFirst({
      where: { recipeId: receta.id, insumoId: params.id },
      select: { id: true },
    })
    if (existente) {
      await tx.sales_recipe_items.update({
        where: { id: existente.id },
        data: { cantidad, unidad, mermaPct },
      })
    } else {
      await tx.sales_recipe_items.create({
        data: { recipeId: receta.id, insumoId: params.id, itemDescripcion: insumo.nombre, cantidad, unidad, mermaPct },
      })
    }
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}

/** Quita este insumo de la receta activa de un producto (?productMasterId=). Solo admin. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  if (!(await getInsumo(params.id, clienteId))) {
    return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })
  }

  const productMasterId = request.nextUrl.searchParams.get('productMasterId')
  if (!productMasterId) return NextResponse.json({ error: 'Falta productMasterId' }, { status: 400 })

  await prisma.sales_recipe_items.deleteMany({
    where: {
      insumoId: params.id,
      recipe: { productMasterId, activa: true, productMaster: { clienteId } },
    },
  })

  return NextResponse.json({ ok: true })
}
