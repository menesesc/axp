import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { NextResponse, NextRequest } from 'next/server'
import { requirePermiso } from '@/lib/auth'
import { PERMISO } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

const LIMIT = 8000

/**
 * Líneas de compra con PRECIO UNITARIO (no totales de gasto), para comparar
 * precios y detectar aumentos. Solo items, cantidades, precio unit y fecha.
 * El agrupado por item/proveedor y la búsqueda se resuelven en el cliente.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requirePermiso(PERMISO.COMPRAS)
  if (error) return error

  const sp = new URL(request.url).searchParams
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')
  const proveedorId = sp.get('proveedorId')

  if (!desde || !hasta) {
    return NextResponse.json({ error: 'Parámetros desde y hasta son requeridos' }, { status: 400 })
  }

  const fechaDesde = new Date(`${desde}T00:00:00-03:00`)
  const fechaHasta = new Date(`${hasta}T23:59:59-03:00`)
  const proveedorFilter = proveedorId
    ? Prisma.sql`AND d."proveedorId" = ${proveedorId}::uuid`
    : Prisma.empty

  const lines = await prisma.$queryRaw<
    Array<{
      fecha: string | null
      proveedorId: string | null
      proveedor: string | null
      codigo: string | null
      descripcion: string
      unidad: string | null
      cantidad: number | null
      precioUnitario: number | null
    }>
  >(Prisma.sql`
    SELECT
      to_char(d."fechaEmision", 'YYYY-MM-DD') as fecha,
      d."proveedorId" as "proveedorId",
      p."razonSocial" as proveedor,
      di.codigo,
      di.descripcion,
      di.unidad,
      di.cantidad::float as cantidad,
      di."precioUnitario"::float as "precioUnitario"
    FROM documento_items di
    JOIN documentos d ON d.id = di."documentoId"
    LEFT JOIN proveedores p ON p.id = d."proveedorId"
    WHERE d."clienteId" = ${clienteId}::uuid
      AND d."fechaEmision" >= ${fechaDesde}
      AND d."fechaEmision" <= ${fechaHasta}
      AND d.tipo = 'FACTURA'
      AND d."estadoRevision" NOT IN ('ERROR', 'DUPLICADO')
      AND di."precioUnitario" IS NOT NULL
      ${proveedorFilter}
    ORDER BY d."fechaEmision" DESC, di.descripcion ASC
    LIMIT ${LIMIT + 1}
  `)

  const capped = lines.length > LIMIT

  return NextResponse.json({ lines: capped ? lines.slice(0, LIMIT) : lines, capped })
}
