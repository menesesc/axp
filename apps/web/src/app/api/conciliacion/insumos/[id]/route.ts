import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { UNIDADES } from '@/lib/conciliacion/units'

export const dynamic = 'force-dynamic'

/** Edita un insumo. Solo admin. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_INSUMOS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const existing = await prisma.insumos.findFirst({ where: { id: params.id, clienteId } })
  if (!existing) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim()
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    data.nombre = nombre
  }
  if (body.unidadBase !== undefined) {
    if (!UNIDADES.includes(String(body.unidadBase) as never)) {
      return NextResponse.json({ error: `unidadBase debe ser una de: ${UNIDADES.join(', ')}` }, { status: 400 })
    }
    data.unidadBase = String(body.unidadBase)
  }
  if (body.categoria !== undefined) data.categoria = body.categoria ? String(body.categoria).trim() : null
  if (body.subcategoria !== undefined)
    data.subcategoria = body.subcategoria ? String(body.subcategoria).trim() : null
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas).trim() : null
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  /*
   * Venta directa: vincular el insumo con el producto que se vende.
   *
   * Tres condiciones, porque un vínculo mal puesto descuenta stock de lo que
   * no es: el producto tiene que ser del mismo cliente, no puede estar ya
   * tomado por otro insumo (la columna es única) y la unidad base tiene que
   * ser 'u', porque el consumo son unidades vendidas.
   */
  if (body.productMasterId !== undefined) {
    const pmId = body.productMasterId ? String(body.productMasterId) : null
    if (pmId) {
      const unidad = (data.unidadBase as string) ?? existing.unidadBase
      if (unidad !== 'u') {
        return NextResponse.json(
          { error: 'La venta directa exige unidad base "u": el consumo son unidades vendidas' },
          { status: 400 }
        )
      }
      const [ok] = await prisma.$queryRaw<Array<{ tomado_por: string | null }>>`
        SELECT (SELECT i.nombre FROM insumos i
                 WHERE i."productMasterId" = ${pmId}::uuid AND i.id <> ${params.id}::uuid) AS tomado_por
          FROM sales_product_master pm
         WHERE pm.id = ${pmId}::uuid AND pm."clienteId" = ${clienteId}::uuid
      `
      if (!ok) return NextResponse.json({ error: 'Ese producto de venta no existe' }, { status: 400 })
      if (ok.tomado_por) {
        return NextResponse.json(
          { error: `Ese producto ya está vinculado al insumo "${ok.tomado_por}"` },
          { status: 409 }
        )
      }
    }
    await prisma.$executeRaw`
      UPDATE insumos SET "productMasterId" = ${pmId}::uuid, "updatedAt" = now()
       WHERE id = ${params.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
  }

  try {
    const insumo =
      Object.keys(data).length > 0
        ? await prisma.insumos.update({ where: { id: params.id }, data })
        : existing
    return NextResponse.json({ insumo })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 409 })
    }
    throw e
  }
}

/** Borra un insumo (alias en cascade; recipe_items quedan con insumoId=null). Solo admin. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_INSUMOS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const existing = await prisma.insumos.findFirst({ where: { id: params.id, clienteId } })
  if (!existing) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  await prisma.insumos.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
