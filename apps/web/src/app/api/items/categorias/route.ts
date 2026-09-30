import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { importesJson } from '@/lib/importes'
import { contarPendientes, descNormSql, getCategorias } from '@/lib/compras/categorias'

export const dynamic = 'force-dynamic'

/**
 * Categorías de compra con el resumen del período: líneas, cantidad de
 * descripciones y subtotal por categoría. Acepta los mismos filtros de
 * proveedor/fecha que /api/items. `pendientes` = descripciones sin categoría.
 */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.DOC_ITEMS)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
  const json = importesJson(verImportes)

  const sp = request.nextUrl.searchParams
  const params: unknown[] = [clienteId]
  let filters = ''
  const proveedorId = sp.get('proveedorId')
  const fechaDesde = sp.get('fechaDesde')
  const fechaHasta = sp.get('fechaHasta')
  if (proveedorId) {
    params.push(proveedorId)
    filters += ` AND d."proveedorId" = $${params.length}::uuid`
  }
  if (fechaDesde) {
    params.push(fechaDesde)
    filters += ` AND d."fechaEmision" >= $${params.length}::date`
  }
  if (fechaHasta) {
    params.push(fechaHasta)
    filters += ` AND d."fechaEmision" <= $${params.length}::date`
  }

  const [cats, resumen, pendientes] = await Promise.all([
    getCategorias(clienteId),
    prisma.$queryRawUnsafe<Array<{ categoria_id: string | null; lineas: bigint; descripciones: bigint; subtotal: number | null }>>(
      `SELECT c."categoriaId" AS categoria_id,
              COUNT(*)::bigint AS lineas,
              COUNT(DISTINCT ${descNormSql('di.descripcion')})::bigint AS descripciones,
              SUM(di.subtotal)::float8 AS subtotal
         FROM documento_items di
         JOIN documentos d ON d.id = di."documentoId"
         LEFT JOIN compra_item_categoria c
                ON c."clienteId" = d."clienteId" AND c."descripcionNorm" = ${descNormSql('di.descripcion')}
        WHERE d."clienteId" = $1::uuid ${filters}
        GROUP BY c."categoriaId"`,
      ...params
    ),
    contarPendientes(clienteId),
  ])

  const porCat = new Map(resumen.map((r) => [r.categoria_id, r]))
  const sinCat = porCat.get(null)

  return json({
    categorias: cats.map((c) => {
      const r = porCat.get(c.id)
      return {
        id: c.id,
        nombre: c.nombre,
        orden: c.orden,
        lineas: Number(r?.lineas ?? 0),
        descripciones: Number(r?.descripciones ?? 0),
        subtotal: Number(r?.subtotal ?? 0),
      }
    }),
    sinCategoria: {
      lineas: Number(sinCat?.lineas ?? 0),
      descripciones: Number(sinCat?.descripciones ?? 0),
      subtotal: Number(sinCat?.subtotal ?? 0),
    },
    pendientes,
  })
}

/** Crea una categoría. */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const nombre = String(body?.nombre || '').trim().slice(0, 60)
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const max = await prisma.compra_categorias.aggregate({ where: { clienteId, orden: { lt: 999 } }, _max: { orden: true } })
  try {
    const categoria = await prisma.compra_categorias.create({
      data: { clienteId, nombre, orden: (max._max.orden ?? 0) + 10 },
    })
    return NextResponse.json({ categoria }, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    throw e
  }
}
