import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { UNIDADES } from '@/lib/conciliacion/units'

export const dynamic = 'force-dynamic'

/**
 * Alta rápida de insumo desde el costeo de una receta.
 *
 * Cuando se está vinculando ingredientes y falta uno, mandar al usuario a
 * otra pantalla a crearlo y volver rompe el hilo. Acá se crea con lo mínimo
 * —nombre, unidad, merma— y de paso se deja el alias de compra, que es lo
 * que después hace entrar el stock y da el precio.
 *
 * GET sugiere el alias: busca en las facturas ya cargadas las descripciones
 * que se parecen al nombre, para no tener que adivinar cómo lo escribe el
 * proveedor.
 */

export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error

  const nombre = (request.nextUrl.searchParams.get('nombre') || '').trim()
  if (nombre.length < 3) return NextResponse.json({ sugerencias: [] })

  // Se busca por cada palabra de tres letras o más: "crema de leche" encuentra
  // "CREMA 42% X 1 LT" aunque no coincida la frase entera.
  const palabras = nombre
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !['de', 'del', 'con', 'sin', 'para'].includes(p))
    .slice(0, 4)
  if (palabras.length === 0) return NextResponse.json({ sugerencias: [] })

  const sugerencias = await prisma.$queryRaw<Array<{
    descripcion: string
    veces: bigint
    unidad: string | null
    ultimo: number | null
    fecha: string | null
    yaUsada: string | null
  }>>`
    SELECT di.descripcion,
           COUNT(*)::bigint AS veces,
           (ARRAY_AGG(di.unidad ORDER BY d."fechaEmision" DESC NULLS LAST))[1] AS unidad,
           (ARRAY_AGG(di."precioUnitario"::float8 ORDER BY d."fechaEmision" DESC NULLS LAST))[1] AS ultimo,
           to_char(MAX(d."fechaEmision"), 'YYYY-MM-DD') AS fecha,
           -- Si ya hay un alias que la captura, este insumo estaría robándole
           -- las compras a otro: hay que decirlo antes y no después.
           (SELECT i.nombre FROM insumo_alias a JOIN insumos i ON i.id = a."insumoId"
             WHERE i."clienteId" = ${clienteId}::uuid
               AND di.descripcion ILIKE '%' || a.patron || '%' LIMIT 1) AS "yaUsada"
      FROM documento_items di
      JOIN documentos d ON d.id = di."documentoId"
     WHERE d."clienteId" = ${clienteId}::uuid
       AND d."estadoRevision"::text NOT IN ('ERROR', 'DUPLICADO')
       AND di.descripcion ILIKE ALL(${palabras.map((p) => `%${p}%`)}::text[])
     GROUP BY di.descripcion
     ORDER BY COUNT(*) DESC
     LIMIT 8
  `

  return NextResponse.json({
    sugerencias: sugerencias.map((s) => ({
      descripcion: s.descripcion,
      veces: Number(s.veces),
      unidad: s.unidad,
      ultimoPrecio: s.ultimo,
      fecha: s.fecha,
      yaUsada: s.yaUsada,
    })),
  })
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as {
    nombre?: string
    unidadBase?: string
    categoria?: string | null
    mermaPct?: number | null
    alias?: string | null
    factorBase?: number | null
  } | null
  if (!b) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const nombre = String(b.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })
  if (!UNIDADES.includes(String(b.unidadBase) as never)) {
    return NextResponse.json({ error: `La unidad tiene que ser una de: ${UNIDADES.join(', ')}` }, { status: 400 })
  }
  const merma = Math.min(99.99, Math.max(0, Number(b.mermaPct ?? 0) || 0))

  try {
    const [insumo] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO insumos ("clienteId", nombre, "unidadBase", categoria, "mermaPct", "updatedAt")
      VALUES (${clienteId}::uuid, ${nombre}, ${String(b.unidadBase)},
              ${b.categoria?.trim() || null}, ${merma}, now())
      RETURNING id
    `
    const id = insumo!.id

    const alias = String(b.alias || '').trim()
    if (alias) {
      const factor = Number(b.factorBase ?? 1)
      await prisma.$executeRaw`
        INSERT INTO insumo_alias ("insumoId", patron, "factorBase")
        VALUES (${id}::uuid, ${alias}, ${factor > 0 ? factor : 1})
      `
    }

    return NextResponse.json({ insumo: { id, nombre, unidadBase: String(b.unidadBase), mermaPct: merma } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('insumos_clienteId_nombre_key') || msg.includes('duplicate key')) {
      return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 409 })
    }
    throw e
  }
}
