import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Cómo aparece este insumo en las facturas.
 *
 * Los nombres que vienen de Maxirest llegan cortados a lo que entra en la
 * comanda ("ALAMOS CABERNET S"), y así son ilegibles para contar stock. El
 * nombre completo suele estar en las compras, que no tienen ese límite:
 * "CZ ALAMOS CABERNET SAUVIGNON 750CC 2024".
 *
 * Se busca por palabras y no por prefijo: la factura antepone el código del
 * proveedor ("CZ ", "B CH ") y pega los números ("LATITUD33"), con lo cual un
 * prefijo encuentra 20 de 133 y las palabras, 45.
 *
 * Nada se aplica solo: "ALAMBRADO MALBEC" encuentra "GRAN ALAMBRADO MALBEC",
 * que es otro vino. Son candidatos para que elija alguien que los conoce.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_INSUMOS, 'edit')
  if (error) return error

  const [insumo] = await prisma.$queryRaw<Array<{ nombre: string }>>`
    SELECT nombre FROM insumos WHERE id = ${params.id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const palabras = insumo.nombre
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3)
  if (palabras.length === 0) return NextResponse.json({ candidatos: [] })

  const candidatos = await prisma.$queryRaw<Array<{
    descripcion: string
    veces: bigint
    ultima: string | null
    proveedor: string | null
    yaUsada: string | null
  }>>`
    SELECT di.descripcion,
           COUNT(*)::bigint AS veces,
           to_char(MAX(d."fechaEmision"), 'YYYY-MM-DD') AS ultima,
           (ARRAY_AGG(p."razonSocial" ORDER BY d."fechaEmision" DESC NULLS LAST))[1] AS proveedor,
           (SELECT i2.nombre FROM insumo_alias a JOIN insumos i2 ON i2.id = a."insumoId"
             WHERE i2."clienteId" = ${clienteId}::uuid
               AND i2.id <> ${params.id}::uuid
               AND di.descripcion ILIKE '%' || a.patron || '%' LIMIT 1) AS "yaUsada"
      FROM documento_items di
      JOIN documentos d ON d.id = di."documentoId"
      LEFT JOIN proveedores p ON p.id = d."proveedorId"
     WHERE d."clienteId" = ${clienteId}::uuid
       AND d."estadoRevision"::text NOT IN ('ERROR', 'DUPLICADO')
       AND translate(upper(di.descripcion), 'ÁÉÍÓÚÑ', 'AEIOUN') ILIKE ALL(${palabras.map((p) => `%${p}%`)}::text[])
     GROUP BY di.descripcion
     ORDER BY COUNT(*) DESC
     LIMIT 10
  `

  return NextResponse.json({
    candidatos: candidatos.map((c) => ({
      descripcion: c.descripcion,
      veces: Number(c.veces),
      ultima: c.ultima,
      proveedor: c.proveedor,
      yaUsada: c.yaUsada,
    })),
  })
}
