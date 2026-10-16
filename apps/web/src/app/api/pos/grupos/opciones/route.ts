import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/** Las opciones de cada grupo: los sabores, las salsas, los puntos. */

interface Cuerpo {
  id?: string
  grupoId?: string
  nombre?: string
  precioExtra?: number
  activa?: boolean
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.grupoId || !b.nombre?.trim()) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const [o] = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO pos_opciones ("grupoId", nombre, "precioExtra", orden)
    SELECT g.id, ${b.nombre.trim().slice(0, 80)}, ${b.precioExtra ?? 0},
           COALESCE((SELECT max(o.orden) FROM pos_opciones o WHERE o."grupoId" = g.id), 0) + 10
      FROM pos_opcion_grupos g
     WHERE g.id = ${b.grupoId}::uuid AND g."clienteId" = ${clienteId}::uuid
    ON CONFLICT ("grupoId", nombre) DO NOTHING
    RETURNING id
  `
  if (!o) return NextResponse.json({ error: 'Ya existe esa opción' }, { status: 409 })
  return NextResponse.json({ id: o.id })
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  await prisma.$executeRaw`
    UPDATE pos_opciones o SET
      nombre        = COALESCE(${b.nombre?.trim()?.slice(0, 80) ?? null}, o.nombre),
      "precioExtra" = COALESCE(${b.precioExtra ?? null}, o."precioExtra"),
      activa        = COALESCE(${b.activa ?? null}, o.activa)
    FROM pos_opcion_grupos g
    WHERE o.id = ${b.id}::uuid AND g.id = o."grupoId" AND g."clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}

/**
 * Borra la opción del catálogo.
 *
 * Lo ya vendido no se toca: en la línea del pedido quedó copiado el nombre y
 * el extra, justamente para esto.
 */
export async function DELETE(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  await prisma.$executeRaw`
    DELETE FROM pos_opciones o
     USING pos_opcion_grupos g
     WHERE o.id = ${id}::uuid AND g.id = o."grupoId" AND g."clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}
