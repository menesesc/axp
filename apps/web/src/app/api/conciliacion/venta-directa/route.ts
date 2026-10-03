import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Venta directa: productos que se compran y se venden en la misma unidad (un
 * vino embotellado, una lata de gaseosa, una botella de agua). En vez de pedir
 * un insumo a mano y una receta de 1 unidad, se crea el insumo atado al
 * producto y el consumo sale de las unidades vendidas.
 *
 * POST { rubroCodigo }            marca todo un rubro
 * POST { productMasterIds: [] }   marca productos sueltos
 * POST { ..., desmarcar: true }   da de baja el vínculo
 *
 * Un producto con receta activa nunca se marca: la receta describe algo que la
 * venta directa no puede expresar (el bag in box que se sirve por copa). Si
 * igual se marcara, la vista `insumo_consumo_linea` le da precedencia a la
 * receta, así que no habría doble conteo — pero no tiene sentido crear el
 * insumo, así que se saltean y se informan.
 */
export async function POST(request: NextRequest) {
  try {
    const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_INSUMOS, 'edit')
    if (error) return error

    const body = await request.json()
    const rubroCodigo: string | undefined =
      typeof body.rubroCodigo === 'string' && body.rubroCodigo ? body.rubroCodigo : undefined
    const ids: string[] = Array.isArray(body.productMasterIds)
      ? body.productMasterIds.filter((x: unknown) => typeof x === 'string')
      : []
    const desmarcar = body.desmarcar === true

    if (!rubroCodigo && ids.length === 0) {
      return NextResponse.json(
        { error: 'Indicá un rubro o al menos un producto' },
        { status: 400 }
      )
    }

    const where = {
      clienteId: clienteId!,
      activo: true,
      ...(rubroCodigo ? { rubroCodigo } : { id: { in: ids } }),
    }

    const productos = await prisma.sales_product_master.findMany({
      where,
      select: {
        id: true,
        nombre: true,
        recipes: { where: { activa: true }, select: { id: true }, take: 1 },
        insumoDirecto: { select: { id: true, activo: true } },
      },
    })

    if (productos.length === 0) {
      return NextResponse.json({ error: 'No se encontraron productos' }, { status: 404 })
    }

    // --- Desmarcar: se desactiva el insumo, no se borra ni se suelta el vínculo.
    //
    // Borrarlo se llevaría puestos los conteos de stock, los alias de compra y
    // el histórico de pedidos. Y soltar el productMasterId haría que al volver
    // a marcarlo se cree un insumo nuevo, dejando el anterior huérfano con todo
    // ese historial colgado. Con activo = false la vista de consumo ya lo
    // ignora, que es lo único que hace falta.
    if (desmarcar) {
      const insumoIds = productos
        .map((p) => p.insumoDirecto)
        .filter((x): x is { id: string; activo: boolean } => !!x && x.activo)
        .map((x) => x.id)
      if (insumoIds.length === 0) {
        return NextResponse.json({ desmarcados: 0, mensaje: 'No había productos de venta directa' })
      }
      await prisma.insumos.updateMany({
        where: { id: { in: insumoIds } },
        data: { activo: false },
      })
      return NextResponse.json({ desmarcados: insumoIds.length })
    }

    // --- Marcar
    const conReceta = productos.filter((p) => p.recipes.length > 0)
    const yaMarcados = productos.filter((p) => p.insumoDirecto && p.recipes.length === 0)
    const aCrear = productos.filter((p) => p.recipes.length === 0 && !p.insumoDirecto)

    // Reactivar los que ya tenían insumo pero estaban dados de baja.
    const aReactivar = yaMarcados.filter((p) => p.insumoDirecto && !p.insumoDirecto.activo)
    if (aReactivar.length > 0) {
      await prisma.insumos.updateMany({
        where: { id: { in: aReactivar.map((p) => p.insumoDirecto!.id) } },
        data: { activo: true },
      })
    }

    if (aCrear.length > 0) {
      await prisma.insumos.createMany({
        data: aCrear.map((p) => ({
          clienteId: clienteId!,
          nombre: p.nombre,
          // Venta directa = una unidad vendida consume una unidad comprada.
          // Tiene que ser dimensión conteo o el consumo no cierra.
          unidadBase: 'u',
          productMasterId: p.id,
          activo: true,
        })),
      })
    }

    return NextResponse.json({
      creados: aCrear.length,
      reactivados: aReactivar.length,
      yaEstaban: yaMarcados.length - aReactivar.length,
      saltadosPorReceta: conReceta.length,
      detalleSaltados: conReceta.slice(0, 20).map((p) => p.nombre),
    })
  } catch (e) {
    console.error('Error en venta-directa:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
