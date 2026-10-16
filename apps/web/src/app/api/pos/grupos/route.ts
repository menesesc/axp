import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { gruposDe } from '@/lib/pos/db'

export const dynamic = 'force-dynamic'

/**
 * Grupos de opciones.
 *
 * Dos cosas que parecen distintas y son la misma: la salsa que hay que
 * elegir sí o sí (mínimo 1, máximo 1) y los dos sabores del helado (mínimo
 * 0, máximo 2). El punto de la carne además admite escribir, porque siempre
 * hay alguien que pide algo que no está en la lista.
 */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  return NextResponse.json({ grupos: await gruposDe(clienteId!) })
}

interface Cuerpo {
  id?: string
  nombre?: string
  minimo?: number
  maximo?: number
  permiteTexto?: boolean
  activo?: boolean
}

const rango = (n: number) => Math.min(99, Math.max(0, Math.round(n)))

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.nombre?.trim()) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })

  const minimo = rango(b.minimo ?? 0)
  const maximo = Math.max(minimo, rango(b.maximo ?? 1))
  try {
    const [g] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_opcion_grupos ("clienteId", nombre, minimo, maximo, "permiteTexto")
      VALUES (${clienteId}::uuid, ${b.nombre.trim().slice(0, 80)}, ${minimo}, ${maximo}, ${b.permiteTexto ?? false})
      RETURNING id
    `
    return NextResponse.json({ id: g!.id })
  } catch {
    return NextResponse.json({ error: 'Ya existe un grupo con ese nombre' }, { status: 409 })
  }
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  await prisma.$executeRaw`
    UPDATE pos_opcion_grupos SET
      nombre         = COALESCE(${b.nombre?.trim()?.slice(0, 80) ?? null}, nombre),
      minimo         = COALESCE(${b.minimo != null ? rango(b.minimo) : null}, minimo),
      maximo         = COALESCE(${b.maximo != null ? rango(b.maximo) : null}, maximo),
      "permiteTexto" = COALESCE(${b.permiteTexto ?? null}, "permiteTexto"),
      activo         = COALESCE(${b.activo ?? null}, activo)
    WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
      AND maximo >= minimo
  `
  return NextResponse.json({ ok: true })
}
