import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { esUuid, mensajeError, texto } from '@/lib/eventos/db'
import { copiarMenu, listarPlantillas } from '@/lib/eventos/menus'

export const dynamic = 'force-dynamic'

/** La biblioteca de menús fijos de la casa. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  return NextResponse.json({ plantillas: await listarPlantillas(clienteId!) })
}

/**
 * Plantilla nueva: vacía, o copiando otro menú (duplicar una plantilla o
 * "guardar como plantilla" el menú retocado de un evento).
 *
 * Las plantillas no tienen evento ni reserva, así que no dejan línea en la
 * auditoría (que exige uno de los dos); queda quién la creó y la tocó último.
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const nombre = texto(b?.nombre, 120)
  const desdeId = esUuid(b?.desdeId) ? b.desdeId : null
  if (!nombre && !desdeId) return NextResponse.json({ error: 'Poné un nombre al menú' }, { status: 400 })
  try {
    const m = await prisma.$transaction(async (tx) => {
      if (desdeId) return copiarMenu(tx, clienteId!, desdeId, {}, user, nombre)
      const [f] = await tx.$queryRaw<Array<{ id: string; nombre: string }>>`
        INSERT INTO evento_menus ("clienteId", nombre, descripcion, plantilla, "createdById", "updatedById")
        VALUES (${clienteId}::uuid, ${nombre!}, ${texto(b?.descripcion, 2000)}, true, ${user?.id ?? null}::uuid, ${user?.id ?? null}::uuid)
        RETURNING id, nombre
      `
      return f ?? null
    })
    if (!m) return NextResponse.json({ error: 'El menú de origen no existe' }, { status: 404 })
    return NextResponse.json(m)
  } catch (e) {
    console.error('[eventos/menus] alta', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
