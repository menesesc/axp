import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { auditar, entero, esUuid, mensajeError, texto } from '@/lib/eventos/db'
import { cambiosItems, guardarItems, leerItems, menuDetalle, menuSinImportes } from '@/lib/eventos/menus'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Un menú con sus ítems, el precio de carta resuelto y, con importes, el costo. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const m = await menuDetalle(clienteId!, id, verImportes)
  if (!m) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json({ menu: verImportes ? m : menuSinImportes(m), verImportes })
}

/**
 * Edición de una plantilla o de una copia. La lista de ítems viaja entera y
 * se reemplaza. Si el menú es de un evento o una reserva, el cambio queda en
 * su línea de tiempo ("agregó Picada para 4; quitó Flan").
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Faltan los datos' }, { status: 400 })
  const leidos = 'items' in b ? leerItems(b.items) : null
  if (leidos && 'error' in leidos) return NextResponse.json({ error: leidos.error }, { status: 400 })
  if ('nombre' in b && !texto(b.nombre, 120)) return NextResponse.json({ error: 'Poné un nombre al menú' }, { status: 400 })

  try {
    const ok = await prisma.$transaction(async (tx) => {
      const [m] = await tx.$queryRaw<Array<{ eventoId: string | null; reservaId: string | null; eventoDeReserva: string | null }>>`
        SELECT m."eventoId", m."reservaId", r."eventoId" AS "eventoDeReserva"
          FROM evento_menus m LEFT JOIN reservas r ON r.id = m."reservaId"
         WHERE m.id = ${id}::uuid AND m."clienteId" = ${clienteId}::uuid
         FOR UPDATE OF m
      `
      if (!m) return false
      const antes = (await menuDetalle(clienteId!, id, false, tx))!
      let items = leidos && 'items' in leidos ? leidos.items : null
      // Quien no ve importes no manda precios: se conservan los que había.
      if (items && !verImportes) {
        const previo = new Map(antes.items.map((i) => [i.id, i.precioManual]))
        items = items.map((i) => ({ ...i, precioManual: (i.id ? previo.get(i.id) : null) ?? null }))
      }
      const nombre = 'nombre' in b ? texto(b.nombre, 120) : null
      const ref = 'personasReferencia' in b ? Math.min(entero(b.personasReferencia) || 10, 1000) : null
      await tx.$executeRaw`
        UPDATE evento_menus SET
          nombre               = COALESCE(${nombre}, nombre),
          descripcion          = CASE WHEN ${'descripcion' in b} THEN ${texto(b.descripcion, 2000)} ELSE descripcion END,
          "personasReferencia" = COALESCE(${ref}::smallint, "personasReferencia"),
          activo               = COALESCE(${typeof b.activo === 'boolean' ? b.activo : null}::boolean, activo),
          "updatedAt"          = now(),
          "updatedById"        = ${user?.id ?? null}::uuid
        WHERE id = ${id}::uuid
      `
      if (items) await guardarItems(tx, clienteId!, id, items)

      const dueno = m.reservaId ? { eventoId: m.eventoDeReserva, reservaId: m.reservaId } : m.eventoId ? { eventoId: m.eventoId } : null
      if (dueno) {
        const partes = [
          nombre && nombre !== antes.nombre ? `nombre: ${antes.nombre} → ${nombre}` : null,
          items ? cambiosItems(antes.items, items) : null,
        ].filter(Boolean)
        if (partes.length) {
          await auditar(tx, {
            clienteId: clienteId!,
            ...dueno,
            accion: 'menu',
            descripcion: `Menú «${nombre ?? antes.nombre}»: ${partes.join('; ')}`,
            antes: { nombre: antes.nombre, items: antes.items.map((i) => ({ paso: i.paso, nombre: i.nombre, modo: i.modo, cantidad: i.cantidad, personasPorUnidad: i.personasPorUnidad, aplica: i.aplica })) },
            despues: items ? { nombre: nombre ?? antes.nombre, items: items.map((i) => ({ paso: i.paso, nombre: i.nombre, modo: i.modo, cantidad: i.cantidad, personasPorUnidad: i.personasPorUnidad, aplica: i.aplica })) } : { nombre },
            user,
          })
        }
      }
      return true
    })
    if (!ok) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[eventos/menus] edición', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

/**
 * Borra una plantilla. Las copias que se hicieron de ella siguen igual (son
 * copias): sólo pierden el "actualizar desde plantilla". Las copias no se
 * borran por acá: se cambian o se quitan desde el evento o la reserva.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const n = await prisma.$executeRaw`
    DELETE FROM evento_menus WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid AND plantilla
  `
  if (!n) return NextResponse.json({ error: 'No existe o no es una plantilla' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
