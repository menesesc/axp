import { NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { productosCarta } from '@/lib/eventos/menus'

export const dynamic = 'force-dynamic'

/**
 * Productos activos del POS con su precio de carta vigente, para armar
 * menús. El costo (receta o venta directa) y los precios sólo viajan con el
 * flag de importes.
 */
export async function GET() {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const productos = await productosCarta(clienteId!, verImportes)
  return NextResponse.json({
    productos: verImportes ? productos : productos.map((p) => ({ ...p, precio: 0, costo: null, costoCompleto: false })),
    verImportes,
  })
}
