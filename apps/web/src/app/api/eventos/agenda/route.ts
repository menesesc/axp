import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { TIPO_AGENDA_TEXTO, type EstadoAgenda, type TipoAgenda } from '@/lib/eventos/constantes'
import { agendaDe, auditar, esFecha, esUuid, mensajeError, nombreDe, texto, type Tx } from '@/lib/eventos/db'

export const dynamic = 'force-dynamic'

/*
 * Agenda de seguimiento: lo que hace la gente alrededor de una reserva o un
 * evento (la visita previa, la degustación, el llamado para confirmar, el
 * recordatorio del saldo). Tiene responsable y se tacha cuando se hizo.
 *
 * Las fechas llegan como "YYYY-MM-DDTHH:MM" en hora argentina.
 */

const TIPOS = Object.keys(TIPO_AGENDA_TEXTO) as TipoAgenda[]
const ESTADOS: EstadoAgenda[] = ['PENDIENTE', 'HECHA', 'CANCELADA']
const RE_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

async function responsable(tx: Tx, clienteId: string, id: unknown) {
  if (!esUuid(id)) return { id: null, nombre: null }
  const [u] = await tx.$queryRaw<Array<{ id: string; nombre: string }>>`
    SELECT id, nombre FROM usuarios WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return u ?? { id: null, nombre: null }
}

export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const sp = request.nextUrl.searchParams
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')
  const eventoId = sp.get('eventoId')
  const reservaId = sp.get('reservaId')
  const agenda = await agendaDe(clienteId!, {
    ...(esFecha(desde) ? { desde } : {}),
    ...(esFecha(hasta) ? { hasta } : {}),
    ...(esUuid(eventoId) ? { eventoId } : {}),
    ...(esUuid(reservaId) ? { reservaId } : {}),
    soloPendientes: sp.get('pendientes') === '1',
  })
  return NextResponse.json({ agenda })
}

export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tipo = TIPOS.includes(b?.tipo as TipoAgenda) ? (b!.tipo as TipoAgenda) : 'OTRO'
  const titulo = texto(b?.titulo, 200) ?? TIPO_AGENDA_TEXTO[tipo]
  if (typeof b?.fechaHora !== 'string' || !RE_FECHA_HORA.test(b.fechaHora)) {
    return NextResponse.json({ error: 'Poné fecha y hora' }, { status: 400 })
  }
  const fechaHora = b.fechaHora
  const eventoId = esUuid(b.eventoId) ? b.eventoId : null
  const reservaId = esUuid(b.reservaId) ? b.reservaId : null
  if (!eventoId && !reservaId) return NextResponse.json({ error: 'Falta a qué evento o reserva corresponde' }, { status: 400 })

  try {
    const id = await prisma.$transaction(async (tx) => {
      // La referencia tiene que ser de esta empresa.
      const [ref] = await tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT (${eventoId}::uuid IS NULL
                OR EXISTS (SELECT 1 FROM eventos WHERE id = ${eventoId}::uuid AND "clienteId" = ${clienteId}::uuid))
           AND (${reservaId}::uuid IS NULL
                OR EXISTS (SELECT 1 FROM reservas WHERE id = ${reservaId}::uuid AND "clienteId" = ${clienteId}::uuid)) AS ok
      `
      if (!ref?.ok) throw new Error('REF')
      const resp = await responsable(tx, clienteId!, b.responsableId)
      const [g] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO evento_agenda ("clienteId", "eventoId", "reservaId", tipo, titulo, "fechaHora",
                                   "responsableId", "responsableNombre", resultado, "createdById")
        VALUES (${clienteId}::uuid, ${eventoId}::uuid, ${reservaId}::uuid, ${tipo}, ${titulo},
                ${fechaHora}::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires',
                ${resp.id}::uuid, ${resp.nombre}, ${texto(b.resultado, 2000)}, ${user?.id ?? null}::uuid)
        RETURNING id
      `
      const [evRes] = reservaId
        ? await tx.$queryRaw<Array<{ eventoId: string | null }>>`SELECT "eventoId" FROM reservas WHERE id = ${reservaId}::uuid`
        : [{ eventoId }]
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: evRes?.eventoId ?? eventoId,
        reservaId,
        accion: 'agenda',
        descripcion: `Agendado: ${TIPO_AGENDA_TEXTO[tipo]} · ${titulo} · ${fechaHora.replace('T', ' ')}${resp.nombre ? ` · a cargo de ${resp.nombre}` : ''}`,
        despues: { agendaId: g!.id, tipo, titulo, fechaHora, responsable: resp.nombre },
        user,
      })
      return g!.id
    })
    return NextResponse.json({ id })
  } catch (e) {
    if (e instanceof Error && e.message === 'REF') return NextResponse.json({ error: 'No existe' }, { status: 404 })
    console.error('[eventos] agenda alta', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

/** Tachar, cancelar, reprogramar o cambiar el responsable. */
export async function PATCH(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!esUuid(b?.id)) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  const id = b.id
  const estado = ESTADOS.includes(b.estado as EstadoAgenda) ? (b.estado as EstadoAgenda) : null
  const fechaHora = typeof b.fechaHora === 'string' && RE_FECHA_HORA.test(b.fechaHora) ? b.fechaHora : null
  const tiene = (k: string) => Object.prototype.hasOwnProperty.call(b, k)

  try {
    const r = await prisma.$transaction(async (tx) => {
      const [antes] = await tx.$queryRaw<
        Array<{ eventoId: string | null; reservaId: string | null; reservaEvento: string | null; titulo: string; estado: string; responsableNombre: string | null; fechaHora: string }>
      >`
        SELECT g."eventoId", g."reservaId", r."eventoId" AS "reservaEvento", g.titulo, g.estado, g."responsableNombre",
               to_char(g."fechaHora" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI') AS "fechaHora"
          FROM evento_agenda g LEFT JOIN reservas r ON r.id = g."reservaId"
         WHERE g.id = ${id}::uuid AND g."clienteId" = ${clienteId}::uuid
         FOR UPDATE OF g
      `
      if (!antes) return false
      const resp = tiene('responsableId') ? await responsable(tx, clienteId!, b.responsableId) : null
      await tx.$executeRaw`
        UPDATE evento_agenda SET
          estado              = COALESCE(${estado}, estado),
          "completadaAt"      = CASE WHEN ${estado}::text = 'HECHA' THEN now()
                                     WHEN ${estado}::text IS NOT NULL THEN NULL ELSE "completadaAt" END,
          resultado           = CASE WHEN ${tiene('resultado')} THEN ${texto(b.resultado, 2000)} ELSE resultado END,
          titulo              = COALESCE(${texto(b.titulo, 200)}, titulo),
          "fechaHora"         = COALESCE(${fechaHora}::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires', "fechaHora"),
          "responsableId"     = CASE WHEN ${resp !== null} THEN ${resp?.id ?? null}::uuid ELSE "responsableId" END,
          "responsableNombre" = CASE WHEN ${resp !== null} THEN ${resp?.nombre ?? null} ELSE "responsableNombre" END,
          "updatedAt"         = now()
        WHERE id = ${id}::uuid
      `
      const cambios = [
        estado && estado !== antes.estado ? `estado ${antes.estado.toLowerCase()} → ${estado.toLowerCase()}` : null,
        fechaHora && fechaHora.replace('T', ' ') !== antes.fechaHora ? `fecha ${antes.fechaHora} → ${fechaHora.replace('T', ' ')}` : null,
        resp && resp.nombre !== antes.responsableNombre ? `responsable ${antes.responsableNombre ?? '—'} → ${resp.nombre ?? '—'}` : null,
        tiene('resultado') && texto(b.resultado, 2000) ? `resultado: ${texto(b.resultado, 200)}` : null,
      ].filter(Boolean)
      if (cambios.length) {
        await auditar(tx, {
          clienteId: clienteId!,
          eventoId: antes.eventoId ?? antes.reservaEvento,
          reservaId: antes.reservaId,
          accion: 'agenda',
          descripcion: `Agenda «${antes.titulo}»: ${cambios.join(' · ')}`,
          despues: { agendaId: id, estado, fechaHora, responsable: resp?.nombre, por: nombreDe(user) },
          user,
        })
      }
      return true
    })
    if (!r) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[eventos] agenda edición', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
