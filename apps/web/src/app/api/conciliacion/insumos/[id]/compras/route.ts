import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'
import { defaultRange, ESTADOS_COMPRA } from '../../../_range'

export const dynamic = 'force-dynamic'

/**
 * Líneas de factura (compras) que matchean los alias del insumo en el período,
 * con proveedor, precio y cantidad. Compras confirmadas o pagadas.
 *
 * Query: ?from=&to=
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const insumo = await prisma.insumos.findFirst({
    where: { id: params.id, clienteId: clienteId! },
    select: { id: true, nombre: true, unidadBase: true },
  })
  if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const sp = request.nextUrl.searchParams
  const def = defaultRange()
  const from = sp.get('from') || def.from
  const to = sp.get('to') || def.to

  const rows = await prisma.$queryRawUnsafe<Array<{
    fecha: string | null
    numero: string | null
    proveedor: string | null
    descripcion: string
    cantidad: number | null
    unidad: string | null
    precio_unitario: number | null
    subtotal: number | null
    factor: number | null
  }>>(`
    SELECT to_char(d."fechaEmision", 'YYYY-MM-DD') AS fecha,
           d."numeroCompleto" AS numero,
           p."razonSocial" AS proveedor,
           di.descripcion,
           di.cantidad,
           di.unidad,
           di."precioUnitario" AS precio_unitario,
           di.subtotal,
           (SELECT a."factorBase" FROM insumo_alias a
             WHERE a."insumoId" = $5::uuid AND di.descripcion ILIKE '%' || a.patron || '%'
             ORDER BY a."factorBase" DESC LIMIT 1) AS factor
    FROM documento_items di
    JOIN documentos d ON d.id = di."documentoId"
    LEFT JOIN proveedores p ON p.id = d."proveedorId"
    WHERE d."clienteId" = $1::uuid
      AND d."fechaEmision" >= $2::date AND d."fechaEmision" <= $3::date
      AND d."estadoRevision"::text = ANY($4::text[])
      AND EXISTS (SELECT 1 FROM insumo_alias a
                   WHERE a."insumoId" = $5::uuid AND di.descripcion ILIKE '%' || a.patron || '%')
    ORDER BY d."fechaEmision" DESC, di.subtotal DESC NULLS LAST
  `, clienteId, from, to, [...ESTADOS_COMPRA], insumo.id)

  const compras = rows.map((r) => {
    const cantidad = r.cantidad != null ? Number(r.cantidad) : null
    const factor = r.factor != null ? Number(r.factor) : 1
    const subtotal = r.subtotal != null ? Number(r.subtotal) : null
    const cantidadBase = cantidad != null ? cantidad * factor : null
    return {
      fecha: r.fecha,
      numero: r.numero,
      proveedor: r.proveedor,
      descripcion: r.descripcion,
      cantidad,
      unidad: r.unidad,
      precioUnitario: r.precio_unitario != null ? Number(r.precio_unitario) : null,
      subtotal,
      cantidadBase,
      // Precio por unidad base (neto): subtotal / cantidad en unidadBase.
      precioBase: cantidadBase && cantidadBase > 0 && subtotal != null ? subtotal / cantidadBase : null,
    }
  })

  const totalCantidadBase = compras.reduce((s, c) => s + (c.cantidadBase ?? 0), 0)
  const totalCosto = compras.reduce((s, c) => s + (c.subtotal ?? 0), 0)

  return NextResponse.json({
    insumo,
    periodo: { from, to },
    compras,
    totales: { cantidadBase: totalCantidadBase, costo: totalCosto },
  })
}
