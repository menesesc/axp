import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

interface Cuerpo {
  id?: string
  nombre?: string
  /** Dentro de qué categoría va. Null es de primer nivel. */
  padreId?: string | null
  orden?: number
  color?: string | null
  emoji?: string | null
  activa?: boolean
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.nombre?.trim()) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })

  try {
    const [c] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_categorias ("clienteId", nombre, orden, color, emoji, "padreId")
      VALUES (${clienteId}::uuid, ${b.nombre.trim()}, ${b.orden ?? 0}, ${b.color || null}, ${b.emoji || null},
              -- Sólo dos niveles: una subcategoría no puede tener hijas. En
              -- una pantalla táctil, tres toques para llegar al producto ya
              -- es demasiado.
              (SELECT p.id FROM pos_categorias p
                WHERE p.id = ${b.padreId || null}::uuid AND p."clienteId" = ${clienteId}::uuid
                  AND p."padreId" IS NULL))
      RETURNING id
    `
    return NextResponse.json({ id: c!.id })
  } catch {
    return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
  }
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  try {
    await prisma.$executeRaw`
      UPDATE pos_categorias SET
        nombre = COALESCE(${b.nombre?.trim() ?? null}, nombre),
        orden  = COALESCE(${b.orden ?? null}, orden),
        color  = COALESCE(${b.color ?? null}, color),
        emoji  = COALESCE(${b.emoji ?? null}, emoji),
        activa = COALESCE(${b.activa ?? null}, activa),
        "padreId" = CASE
          WHEN ${b.padreId === undefined} THEN "padreId"
          ELSE (SELECT p.id FROM pos_categorias p
                 WHERE p.id = ${b.padreId || null}::uuid AND p."clienteId" = ${clienteId}::uuid
                   AND p."padreId" IS NULL AND p.id <> ${b.id}::uuid)
        END,
        "updatedAt" = now()
      WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
  }
}

export async function DELETE(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  // Los productos quedan sin categoría, no se borran con ella.
  const [uso] = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pos_productos WHERE "categoriaId" = ${id}::uuid
  `
  if ((uso?.n ?? 0) > 0) {
    return NextResponse.json(
      { error: `La usan ${uso!.n} producto${uso!.n === 1 ? '' : 's'}. Movelos antes o desactivala.` },
      { status: 409 }
    )
  }
  await prisma.$executeRaw`
    DELETE FROM pos_categorias WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}
