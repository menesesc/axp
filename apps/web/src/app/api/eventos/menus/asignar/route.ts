import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { REGIMENES, REGIMEN_TEXTO, type Regimen } from '@/lib/eventos/constantes'
import { auditar, esUuid, limpiarCopiasMenu, mensajeError, texto, type Tx } from '@/lib/eventos/db'
import { actualizarDesdePlantilla, copiarMenu } from '@/lib/eventos/menus'

export const dynamic = 'force-dynamic'

/**
 * Asigna un menú a un evento, a una reserva o a un régimen de cualquiera de
 * los dos. Asignar es copiar: el evento se queda con su propia copia y la
 * plantilla puede cambiar sin tocar lo que ya se presupuestó.
 *
 *   accion "asignar"     origenId = plantilla (o cualquier menú: así una
 *                        reserva "personaliza" el menú de su evento); null
 *                        lo quita (la reserva vuelve al del evento).
 *   accion "actualizar"  vuelve a copiar la plantilla de origen en la copia
 *                        actual. Es explícito: nunca pasa solo.
 *   accion "nota"        sólo la indicación de un régimen del evento.
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const reservaId = esUuid(b?.reservaId) ? b.reservaId : null
  const eventoIdBody = esUuid(b?.eventoId) ? b.eventoId : null
  const regimen = b?.regimen ? (b.regimen as Regimen) : null
  const accion = b?.accion === 'actualizar' ? 'actualizar' : b?.accion === 'nota' ? 'nota' : 'asignar'
  const origenId = esUuid(b?.origenId) ? b.origenId : null
  if (!reservaId && !eventoIdBody) return NextResponse.json({ error: 'Falta el evento o la reserva' }, { status: 400 })
  if (regimen && !REGIMENES.some((r) => r.valor === regimen)) return NextResponse.json({ error: 'Régimen desconocido' }, { status: 400 })
  if (accion === 'nota' && (!regimen || reservaId)) return NextResponse.json({ error: 'La nota es de un régimen del evento' }, { status: 400 })

  try {
    const r = await prisma.$transaction(async (tx) => {
      // Dueño y menú actual, bloqueando la fila.
      let eventoId = eventoIdBody
      if (reservaId) {
        const [res] = await tx.$queryRaw<Array<{ eventoId: string | null }>>`
          SELECT "eventoId" FROM reservas WHERE id = ${reservaId}::uuid AND "clienteId" = ${clienteId}::uuid FOR UPDATE
        `
        if (!res) return { error: 'No existe', status: 404 }
        eventoId = res.eventoId
      } else {
        const [ev] = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM eventos WHERE id = ${eventoId}::uuid AND "clienteId" = ${clienteId}::uuid FOR UPDATE
        `
        if (!ev) return { error: 'No existe', status: 404 }
      }
      const actual = await menuActual(tx, { reservaId, eventoId, regimen })
      if (actual === undefined) return { error: 'La reserva no tiene ese régimen cargado', status: 400 }
      const base = { clienteId: clienteId!, eventoId, reservaId, user }
      const que = regimen ? `Menú ${REGIMEN_TEXTO[regimen].toLowerCase()}` : 'Menú'

      if (accion === 'nota') {
        const nota = texto(b?.nota, 300)
        const [previa] = await tx.$queryRaw<Array<{ nota: string | null }>>`
          SELECT nota FROM evento_regimen_menus WHERE "eventoId" = ${eventoId}::uuid AND tipo = ${regimen}
        `
        await tx.$executeRaw`
          INSERT INTO evento_regimen_menus ("eventoId", tipo, nota) VALUES (${eventoId}::uuid, ${regimen}, ${nota})
          ON CONFLICT ("eventoId", tipo) DO UPDATE SET nota = EXCLUDED.nota
        `
        await tx.$executeRaw`
          DELETE FROM evento_regimen_menus WHERE "eventoId" = ${eventoId}::uuid AND tipo = ${regimen} AND "menuId" IS NULL AND nota IS NULL
        `
        if ((previa?.nota ?? null) !== nota) {
          await auditar(tx, {
            ...base,
            accion: 'regimenes',
            descripcion: `Indicación ${REGIMEN_TEXTO[regimen!].toLowerCase()}: ${previa?.nota ?? '—'} → ${nota ?? '—'}`,
            antes: { nota: previa?.nota ?? null },
            despues: { nota },
          })
        }
        return { ok: true }
      }

      if (accion === 'actualizar') {
        if (!actual?.id) return { error: 'No hay menú asignado', status: 400 }
        const plantilla = await actualizarDesdePlantilla(tx, clienteId!, actual.id, user)
        if (!plantilla) return { error: 'Este menú no viene de una plantilla (o la plantilla se borró)', status: 400 }
        await auditar(tx, { ...base, accion: 'menu', descripcion: `${que} actualizado desde la plantilla «${plantilla}»` })
        return { ok: true, menuId: actual.id }
      }

      let nuevo: { id: string; nombre: string } | null = null
      if (origenId) {
        nuevo = await copiarMenu(tx, clienteId!, origenId, reservaId ? { reservaId } : { eventoId }, user)
        if (!nuevo) return { error: 'El menú elegido no existe', status: 404 }
      }
      await apuntar(tx, { reservaId, eventoId, regimen }, nuevo?.id ?? null)
      await limpiarCopiasMenu(tx, reservaId ? { reservaId } : { eventoId })
      await auditar(tx, {
        ...base,
        accion: 'menu',
        descripcion: `${que}: ${actual?.nombre ?? (reservaId && !regimen ? 'el del evento' : '—')} → ${nuevo?.nombre ?? (reservaId && !regimen ? 'el del evento' : '—')}`,
        antes: { menu: actual?.nombre ?? null },
        despues: { menu: nuevo?.nombre ?? null, origenId },
      })
      return { ok: true, menuId: nuevo?.id ?? null }
    })
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[eventos/menus] asignar', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

type Destino = { reservaId: string | null; eventoId: string | null; regimen: Regimen | null }

/** El menú que tiene hoy el destino. `undefined` = el régimen no existe en la reserva. */
async function menuActual(tx: Tx, d: Destino): Promise<{ id: string; nombre: string } | null | undefined> {
  if (d.reservaId && d.regimen) {
    const filas = await tx.$queryRaw<Array<{ id: string | null; nombre: string | null }>>`
      SELECT m.id, m.nombre FROM reserva_regimenes g LEFT JOIN evento_menus m ON m.id = g."menuId"
       WHERE g."reservaId" = ${d.reservaId}::uuid AND g.tipo = ${d.regimen}
    `
    if (filas.length === 0) return undefined
    const f = filas.find((x) => x.id)
    return f?.id ? { id: f.id, nombre: f.nombre! } : null
  }
  const [f] = d.reservaId
    ? await tx.$queryRaw<Array<{ id: string; nombre: string }>>`
        SELECT m.id, m.nombre FROM reservas r JOIN evento_menus m ON m.id = r."menuId" WHERE r.id = ${d.reservaId}::uuid
      `
    : d.regimen
      ? await tx.$queryRaw<Array<{ id: string; nombre: string }>>`
          SELECT m.id, m.nombre FROM evento_regimen_menus g JOIN evento_menus m ON m.id = g."menuId"
           WHERE g."eventoId" = ${d.eventoId}::uuid AND g.tipo = ${d.regimen}
        `
      : await tx.$queryRaw<Array<{ id: string; nombre: string }>>`
          SELECT m.id, m.nombre FROM eventos e JOIN evento_menus m ON m.id = e."menuId" WHERE e.id = ${d.eventoId}::uuid
        `
  return f ?? null
}

async function apuntar(tx: Tx, d: Destino, menuId: string | null) {
  if (d.reservaId && d.regimen) {
    await tx.$executeRaw`UPDATE reserva_regimenes SET "menuId" = ${menuId}::uuid WHERE "reservaId" = ${d.reservaId}::uuid AND tipo = ${d.regimen}`
  } else if (d.reservaId) {
    await tx.$executeRaw`UPDATE reservas SET "menuId" = ${menuId}::uuid, "updatedAt" = now() WHERE id = ${d.reservaId}::uuid`
  } else if (d.regimen) {
    await tx.$executeRaw`
      INSERT INTO evento_regimen_menus ("eventoId", tipo, "menuId") VALUES (${d.eventoId}::uuid, ${d.regimen}, ${menuId}::uuid)
      ON CONFLICT ("eventoId", tipo) DO UPDATE SET "menuId" = EXCLUDED."menuId"
    `
    await tx.$executeRaw`
      DELETE FROM evento_regimen_menus WHERE "eventoId" = ${d.eventoId}::uuid AND tipo = ${d.regimen} AND "menuId" IS NULL AND nota IS NULL
    `
  } else {
    await tx.$executeRaw`UPDATE eventos SET "menuId" = ${menuId}::uuid, "updatedAt" = now() WHERE id = ${d.eventoId}::uuid`
  }
}
