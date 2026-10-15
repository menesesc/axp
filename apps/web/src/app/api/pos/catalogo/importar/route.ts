import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Siembra el catálogo de venta con lo que ya se vende.
 *
 * Cargar 271 productos a mano no es razonable cuando el sistema ya sabe
 * cuáles son, de qué rubro y a qué precio: el precio sale del último cierre
 * en que se vendió (importe / unidades), que es exactamente lo que cobró la
 * caja ese día.
 *
 * El nombre sale del insumo cuando el producto está vinculado, porque ahí
 * está el nombre completo; el de Maxirest viene recortado a lo que entra en
 * la comanda.
 *
 * Es re-ejecutable: no pisa lo que ya existe. Sirve durante la convivencia
 * con Maxirest para traer los productos nuevos que vayan apareciendo, sin
 * tocar precios ni categorías ya ajustados a mano.
 */

interface Fila {
  productMasterId: string
  nombre: string
  nombreMaxirest: string
  rubro: string | null
  precio: number | null
  ultimaVenta: string | null
  yaExiste: boolean
}

async function candidatos(clienteId: string): Promise<Fila[]> {
  return prisma.$queryRaw<Fila[]>`
    WITH ultimo AS (
      SELECT DISTINCT ON (ci."productMasterId")
             ci."productMasterId" AS pm,
             c.fecha,
             round(ci.importe / NULLIF(ci.unidades, 0), 2) AS precio
        FROM sales_closure_items ci
        JOIN sales_closures c ON c.id = ci."closureId"
       WHERE c."clienteId" = ${clienteId}::uuid AND ci.unidades > 0 AND ci.importe > 0
       ORDER BY ci."productMasterId", c.fecha DESC
    )
    SELECT pm.id AS "productMasterId",
           -- El insumo tiene el nombre completo; el de Maxirest viene cortado.
           COALESCE(i.nombre, pm.nombre) AS nombre,
           pm.nombre AS "nombreMaxirest",
           pm."rubroNombre" AS rubro,
           u.precio::float8 AS precio,
           to_char(u.fecha, 'YYYY-MM-DD') AS "ultimaVenta",
           EXISTS (SELECT 1 FROM pos_productos p WHERE p."productMasterId" = pm.id) AS "yaExiste"
      FROM sales_product_master pm
      LEFT JOIN ultimo u ON u.pm = pm.id
      LEFT JOIN insumos i ON i."productMasterId" = pm.id
     WHERE pm."clienteId" = ${clienteId}::uuid AND pm.activo = true
     ORDER BY pm."rubroNombre" NULLS LAST, COALESCE(i.nombre, pm.nombre)
  `
}

/** Vista previa: qué se crearía, sin tocar nada. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const filas = await candidatos(clienteId!)
  const nuevos = filas.filter((f) => !f.yaExiste)
  return NextResponse.json({
    productos: filas,
    resumen: {
      total: filas.length,
      nuevos: nuevos.length,
      yaExisten: filas.length - nuevos.length,
      sinPrecio: nuevos.filter((f) => f.precio == null).length,
      rubros: [...new Set(filas.map((f) => f.rubro).filter(Boolean))].length,
    },
  })
}

export async function POST(request: NextRequest) {
  const { clienteId, user, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const body = (await request.json().catch(() => ({}))) as { soloConPrecio?: boolean }
  const soloConPrecio = body.soloConPrecio !== false

  const filas = (await candidatos(clienteId!)).filter((f) => !f.yaExiste)
  const aCrear = soloConPrecio ? filas.filter((f) => f.precio != null) : filas
  if (aCrear.length === 0) return NextResponse.json({ categorias: 0, productos: 0 })

  // Las categorías salen de los rubros de Maxirest, que es con lo que el local
  // ya piensa la carta. Después se renombran y reordenan a gusto.
  const rubros = [...new Set(aCrear.map((f) => f.rubro).filter((r): r is string => !!r))]
  let categorias = 0
  for (const [i, rubro] of rubros.entries()) {
    const r = await prisma.$executeRaw`
      INSERT INTO pos_categorias ("clienteId", nombre, orden)
      VALUES (${clienteId}::uuid, ${rubro}, ${i * 10})
      ON CONFLICT ("clienteId", nombre) DO NOTHING
    `
    categorias += r
  }

  const catIds = new Map(
    (
      await prisma.$queryRaw<Array<{ id: string; nombre: string }>>`
        SELECT id, nombre FROM pos_categorias WHERE "clienteId" = ${clienteId}::uuid
      `
    ).map((c) => [c.nombre, c.id])
  )

  let productos = 0
  for (const f of aCrear) {
    const [p] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_productos
        ("clienteId", "categoriaId", "productMasterId", nombre, "nombreTicket", precio)
      VALUES (${clienteId}::uuid, ${f.rubro ? (catIds.get(f.rubro) ?? null) : null}::uuid,
              ${f.productMasterId}::uuid, ${f.nombre}, ${f.nombreMaxirest.slice(0, 40)},
              ${f.precio ?? 0})
      ON CONFLICT ("clienteId", nombre) DO NOTHING
      RETURNING id
    `
    if (!p) continue
    productos++
    // El precio inicial queda en el historial con su origen, para que después
    // se entienda de dónde salió ese número.
    await prisma.$executeRaw`
      INSERT INTO pos_precios ("productoId", precio, "usuarioId", motivo)
      VALUES (${p.id}::uuid, ${f.precio ?? 0}, ${user?.id ?? null}::uuid,
              ${`Importado del cierre del ${f.ultimaVenta ?? 's/f'}`})
    `
  }

  return NextResponse.json({ categorias, productos })
}
