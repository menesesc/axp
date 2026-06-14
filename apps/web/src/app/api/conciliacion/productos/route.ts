import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Productos de venta (sales_product_master) con estado de receta y total de
 * unidades vendidas histórico, para que el usuario sepa qué productos recetar
 * primero. Soporta ?q= y ?conReceta=true|false.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const conReceta = sp.get('conReceta') // 'true' | 'false' | null

  const productos = await prisma.sales_product_master.findMany({
    where: {
      clienteId: clienteId!,
      ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      codigoMaxirest: true,
      nombre: true,
      rubroNombre: true,
      activo: true,
      recipes: { where: { activa: true }, select: { id: true, _count: { select: { ingredients: true } } } },
    },
    orderBy: { nombre: 'asc' },
  })

  // Unidades vendidas histórico por producto (para priorizar).
  const ventas = await prisma.$queryRawUnsafe<Array<{ pid: string; unidades: number }>>(`
    SELECT ci."productMasterId" AS pid, SUM(ci.unidades)::float AS unidades
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    WHERE c."clienteId" = $1::uuid AND ci."productMasterId" IS NOT NULL
    GROUP BY ci."productMasterId"
  `, clienteId)
  const ventasMap = new Map(ventas.map((v) => [v.pid, Number(v.unidades)]))

  let rows = productos.map((p) => {
    const receta = p.recipes[0]
    return {
      id: p.id,
      codigoMaxirest: p.codigoMaxirest,
      nombre: p.nombre,
      rubroNombre: p.rubroNombre,
      activo: p.activo,
      tieneReceta: !!receta,
      recetaId: receta?.id ?? null,
      ingredientesCount: receta?._count.ingredients ?? 0,
      unidadesVendidas: ventasMap.get(p.id) ?? 0,
    }
  })

  if (conReceta === 'true') rows = rows.filter((r) => r.tieneReceta)
  if (conReceta === 'false') rows = rows.filter((r) => !r.tieneReceta)

  // Orden: primero los más vendidos (prioridad de recetado).
  rows.sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)

  return NextResponse.json({ productos: rows })
}
