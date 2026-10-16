import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Lo del plano que no es mesa: la barra, la entrada, los baños, la escalera,
 * una pared, el árbol del patio.
 *
 * No tienen estado ni pedido. Están para que el plano se parezca al salón, y
 * eso es lo que hace que el mozo encuentre la mesa 14 sin pensarlo.
 */

const TIPOS = [
  'entrada', 'puerta', 'barra', 'bano', 'cocina', 'caja',
  'escalera', 'pared', 'columna', 'planta', 'arbol', 'texto',
]

interface Cuerpo {
  id?: string
  sucursalId?: string
  sectorId?: string | null
  tipo?: string
  etiqueta?: string | null
  x?: number
  y?: number
  ancho?: number
  alto?: number
  rotacion?: number
  color?: string | null
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.sucursalId) return NextResponse.json({ error: 'Falta el salón' }, { status: 400 })
  if (!b.tipo || !TIPOS.includes(b.tipo)) return NextResponse.json({ error: 'Tipo desconocido' }, { status: 400 })

  const [e] = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO pos_elementos ("clienteId", "sucursalId", "sectorId", tipo, etiqueta,
                               x, y, ancho, alto, rotacion, color)
    VALUES (${clienteId}::uuid, ${b.sucursalId}::uuid, ${b.sectorId || null}::uuid,
            ${b.tipo}, ${b.etiqueta?.trim()?.slice(0, 40) || null},
            ${b.x ?? 0}, ${b.y ?? 0}, ${b.ancho ?? 100}, ${b.alto ?? 60},
            ${b.rotacion ?? 0}, ${b.color || null})
    RETURNING id
  `
  return NextResponse.json({ id: e!.id })
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const body = (await request.json().catch(() => null)) as (Cuerpo & { elementos?: Cuerpo[] }) | null
  const cambios = body?.elementos ?? (body ? [body] : [])
  if (cambios.length === 0 || cambios.some((c) => !c.id)) {
    return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  }

  for (const c of cambios) {
    await prisma.$executeRaw`
      UPDATE pos_elementos SET
        etiqueta = COALESCE(${c.etiqueta?.trim()?.slice(0, 40) ?? null}, etiqueta),
        x        = COALESCE(${c.x ?? null}, x),
        y        = COALESCE(${c.y ?? null}, y),
        ancho    = COALESCE(${c.ancho ?? null}, ancho),
        alto     = COALESCE(${c.alto ?? null}, alto),
        rotacion = COALESCE(${c.rotacion ?? null}, rotacion),
        color    = COALESCE(${c.color ?? null}, color),
        "updatedAt" = now()
      WHERE id = ${c.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
  }
  return NextResponse.json({ ok: true })
}

/** Acá sí se borra: un elemento del plano no tiene histórico que cuidar. */
export async function DELETE(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  await prisma.$executeRaw`
    DELETE FROM pos_elementos WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}
