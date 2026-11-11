import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { ORDEN_SIGLAS, REGIMEN_TEXTO, cuotasDeRegla, personasTexto, type Sigla } from '@/lib/eventos/constantes'
import {
  CupoExcedido,
  auditar,
  esFecha,
  esUuid,
  eventoBase,
  guardarCuotas,
  guardarMesas,
  guardarRegimenes,
  listarReservas,
  mensajeError,
  respuestaCupo,
  siguienteNumero,
  verificarCupo,
  verificarPropios,
} from '@/lib/eventos/db'
import { leerReserva } from '@/lib/eventos/entrada'

export const dynamic = 'force-dynamic'

/**
 * Lista de reservas con filtros. Sin rango ni evento devuelve lo que viene
 * (desde hoy), que es lo que se mira todos los días.
 */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const sp = request.nextUrl.searchParams
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')
  const eventoId = sp.get('eventoId')
  const siglas = (sp.get('siglas') ?? '')
    .split(',')
    .filter((s): s is Sigla => (ORDEN_SIGLAS as string[]).includes(s))
  const titularId = sp.get('titularId')
  const sectorId = sp.get('sectorId')

  const reservas = await listarReservas(clienteId!, {
    eventoId: esUuid(eventoId) ? eventoId : null,
    sinEvento: sp.get('sinEvento') === '1',
    desde: esFecha(desde) ? desde : null,
    hasta: esFecha(hasta) ? hasta : null,
    siglas,
    sectorId: esUuid(sectorId) ? sectorId : null,
    titularId: esUuid(titularId) ? titularId : null,
    conRegimen: sp.get('conRegimen') === '1',
    q: sp.get('q'),
  })
  return NextResponse.json({
    reservas: verImportes ? reservas : reservas.map((r) => ({ ...r, total: 0, cobrado: 0, saldo: 0 })),
    verImportes,
  })
}

/**
 * Alta. Alcanza con nombre y personas: en una reserva de evento la fecha, la
 * hora, el salón (si el evento tiene uno solo), los precios y el plan de
 * pagos salen del evento. Es lo que permite cargar cien reservas del 31/12
 * de corrido con nombre, teléfono y cantidad.
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const r = leerReserva(body, true)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  const d = r.datos
  const forzar = body?.forzarCupo === true
  // Se puede nacer aprobada (una reserva a la carta no pasa por presupuesto).
  const estado = body?.estado === 'APROBADO' ? 'APROBADO' : 'PRESUPUESTO'
  const personas = (d.adultos ?? 0) + (d.menores ?? 0) + (d.bebes ?? 0) + (d.liberados ?? 0)
  if (personas === 0) return NextResponse.json({ error: 'La reserva necesita al menos una persona' }, { status: 400 })

  try {
    const res = await prisma.$transaction(async (tx) => {
      const ev = d.eventoId ? await eventoBase(clienteId!, d.eventoId, tx) : null
      if (d.eventoId && !ev) throw new Error('EVENTO')
      const fecha = d.fecha ?? ev?.fecha
      if (!fecha) throw new Error('FECHA')
      const hora = 'hora' in d ? d.hora ?? null : ev?.horaInicio ?? null
      const sectorId = 'sectorId' in d ? d.sectorId ?? null : ev?.salonIds.length === 1 ? ev.salonIds[0]! : null

      await verificarPropios(tx, clienteId!, { titularId: d.titularId, sectorId })
      const exceso = ev ? await verificarCupo(tx, ev.id, null, personas, forzar) : null
      const numero = await siguienteNumero(tx, clienteId!)

      const [fila] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO reservas ("clienteId", numero, "eventoId", "titularId", nombre, "contactoNombre", "contactoTelefono",
                              "contactoEmail", fecha, hora, "sectorId", adultos, menores, bebes, liberados,
                              "precioAdulto", "precioMenor", "precioLiberado", "ivaModo", "ivaAlicuota",
                              descuento, "descuentoNota", estado, "aprobadaAt", origen, "mesaInamovible",
                              observaciones, "notaServicio", "createdById")
        VALUES (${clienteId}::uuid, ${numero}, ${ev?.id ?? null}::uuid, ${d.titularId ?? null}::uuid, ${d.nombre!},
                ${d.contactoNombre ?? null}, ${d.contactoTelefono ?? null}, ${d.contactoEmail ?? null},
                ${fecha}::date, ${hora}::time, ${sectorId}::uuid,
                ${d.adultos ?? 0}::int, ${d.menores ?? 0}::int, ${d.bebes ?? 0}::int, ${d.liberados ?? 0}::int,
                ${d.precioAdulto ?? null}::numeric, ${d.precioMenor ?? null}::numeric, ${d.precioLiberado ?? null}::numeric,
                ${d.ivaModo ?? null}, ${d.ivaAlicuota ?? null}::numeric, ${d.descuento ?? 0}::numeric, ${d.descuentoNota ?? null},
                ${estado}, ${estado === 'APROBADO' ? new Date() : null}::timestamptz, ${d.origen ?? null},
                ${d.mesaInamovible ?? false}, ${d.observaciones ?? null}, ${d.notaServicio ?? null}, ${user?.id ?? null}::uuid)
        RETURNING id
      `
      const id = fila!.id
      if (d.regimenes?.length) await guardarRegimenes(tx, id, d.regimenes)
      const mesas = d.mesaIds?.length ? await guardarMesas(tx, clienteId!, id, d.mesaIds) : []
      if (ev) await guardarCuotas(tx, id, cuotasDeRegla({ ...ev, fecha: ev.fecha }))

      const detalle = [
        personasTexto({ adultos: d.adultos ?? 0, menores: d.menores ?? 0, bebes: d.bebes ?? 0, liberados: d.liberados ?? 0 }),
        fecha,
        hora,
        d.origen ? `origen ${d.origen}` : null,
        mesas.length ? `mesa ${mesas.join(', ')}` : null,
        d.regimenes?.length ? d.regimenes.map((g) => `${g.cantidad} ${REGIMEN_TEXTO[g.tipo].toLowerCase()}`).join(', ') : null,
      ].filter(Boolean)
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: ev?.id,
        reservaId: id,
        accion: 'creada',
        descripcion: `Reserva #${numero} creada (${estado === 'APROBADO' ? 'aprobada' : 'presupuesto'}): ${d.nombre} · ${detalle.join(' · ')}`,
        despues: { ...d, estado, fecha, hora, sectorId },
        user,
      })
      if (exceso) {
        await auditar(tx, {
          clienteId: clienteId!,
          eventoId: ev?.id,
          reservaId: id,
          accion: 'cupo_excedido',
          descripcion: `Se pasó el cupo con confirmación: había ${exceso.ocupado} de ${exceso.cupo} y entraron ${personas} más`,
          despues: { ...exceso, personas },
          user,
        })
      }
      return { id, numero }
    })
    return NextResponse.json(res)
  } catch (e) {
    if (e instanceof CupoExcedido) return NextResponse.json(respuestaCupo(e), { status: 409 })
    if (e instanceof Error && e.message === 'EVENTO') return NextResponse.json({ error: 'El evento no existe' }, { status: 404 })
    if (e instanceof Error && e.message === 'REF') return NextResponse.json({ error: 'El cliente o el salón no son válidos' }, { status: 400 })
    if (e instanceof Error && e.message === 'FECHA') return NextResponse.json({ error: 'Falta la fecha' }, { status: 400 })
    console.error('[reservas] alta', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
