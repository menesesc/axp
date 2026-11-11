import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'
import {
  agendaDe,
  auditar,
  auditoriaDe,
  configuracionDe,
  cuotasDe,
  diferencias,
  esUuid,
  eventoBase,
  listarReservas,
  mensajeError,
  type EventoBase,
} from '@/lib/eventos/db'
import { leerEvento } from '@/lib/eventos/entrada'
import { kpisEvento } from '@/lib/eventos/resumen'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Ficha del evento: condiciones, todas sus reservas (con cien o más, la
 * tabla filtra en el navegador), los números de la cabecera y la línea de
 * tiempo.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const evento = await eventoBase(clienteId!, id)
  if (!evento) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const [reservas, auditoria, agenda, cfg] = await Promise.all([
    listarReservas(clienteId!, { eventoId: id }),
    auditoriaDe(clienteId!, { eventoId: id }),
    agendaDe(clienteId!, { eventoId: id }),
    configuracionDe(clienteId!),
  ])
  const cuotas = await cuotasDe(reservas.map((r) => r.id))
  const kpis = kpisEvento(evento.cupo, reservas, cuotas, hoyAR())

  // Sin el flag de importes, la plata no viaja.
  const sinPlata = <T extends { total: number; cobrado: number; saldo: number }>(x: T): T => ({ ...x, total: 0, cobrado: 0, saldo: 0 })
  return NextResponse.json({
    evento: verImportes ? evento : { ...evento, precioAdulto: 0, precioMenor: 0, senaMonto: null },
    reservas: verImportes ? reservas : reservas.map(sinPlata),
    kpis: verImportes ? kpis : { ...sinPlata(kpis), montoVencido: 0 },
    auditoria,
    agenda,
    avisoCupoPct: cfg.avisoCupoPct,
    verImportes,
  })
}

const ETIQUETAS: Partial<Record<keyof EventoBase, string>> = {
  nombre: 'Nombre',
  tipo: 'Tipo',
  fecha: 'Fecha',
  horaInicio: 'Hora de inicio',
  horaFin: 'Hora de fin',
  cupo: 'Cupo',
  precioAdulto: 'Precio adulto',
  precioMenor: 'Precio menor',
  ivaModo: 'IVA',
  ivaAlicuota: 'Alícuota',
  pagoModo: 'Regla de pago',
  senaPct: 'Seña %',
  senaMonto: 'Seña fija',
  senaVence: 'Vence la seña',
  saldoVence: 'Vence el saldo',
  observaciones: 'Observaciones',
  salonIds: 'Salones',
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const ev = leerEvento(await request.json().catch(() => null), false)
  if ('error' in ev) return NextResponse.json({ error: ev.error }, { status: 400 })
  const d = ev.datos
  const tiene = (k: keyof typeof d) => k in d

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const antes = await eventoBase(clienteId!, id, tx)
      if (!antes) return null
      await tx.$executeRaw`
        UPDATE eventos SET
          nombre        = CASE WHEN ${tiene('nombre')} THEN ${d.nombre ?? null} ELSE nombre END,
          tipo          = CASE WHEN ${tiene('tipo')} THEN ${d.tipo ?? null} ELSE tipo END,
          fecha         = CASE WHEN ${tiene('fecha')} THEN ${d.fecha ?? null}::date ELSE fecha END,
          "horaInicio"  = CASE WHEN ${tiene('horaInicio')} THEN ${d.horaInicio ?? null}::time ELSE "horaInicio" END,
          "horaFin"     = CASE WHEN ${tiene('horaFin')} THEN ${d.horaFin ?? null}::time ELSE "horaFin" END,
          cupo          = CASE WHEN ${tiene('cupo')} THEN ${d.cupo ?? null}::int ELSE cupo END,
          "precioAdulto"= CASE WHEN ${tiene('precioAdulto')} THEN ${d.precioAdulto ?? 0}::numeric ELSE "precioAdulto" END,
          "precioMenor" = CASE WHEN ${tiene('precioMenor')} THEN ${d.precioMenor ?? 0}::numeric ELSE "precioMenor" END,
          "ivaModo"     = CASE WHEN ${tiene('ivaModo')} THEN ${d.ivaModo ?? 'FINAL'} ELSE "ivaModo" END,
          "ivaAlicuota" = CASE WHEN ${tiene('ivaAlicuota')} THEN ${d.ivaAlicuota ?? 21}::numeric ELSE "ivaAlicuota" END,
          "pagoModo"    = CASE WHEN ${tiene('pagoModo')} THEN ${d.pagoModo ?? 'NINGUNA'} ELSE "pagoModo" END,
          "senaPct"     = CASE WHEN ${tiene('senaPct')} THEN ${d.senaPct ?? null}::numeric ELSE "senaPct" END,
          "senaMonto"   = CASE WHEN ${tiene('senaMonto')} THEN ${d.senaMonto ?? null}::numeric ELSE "senaMonto" END,
          "senaVence"   = CASE WHEN ${tiene('senaVence')} THEN ${d.senaVence ?? null}::date ELSE "senaVence" END,
          "saldoVence"  = CASE WHEN ${tiene('saldoVence')} THEN ${d.saldoVence ?? null}::date ELSE "saldoVence" END,
          observaciones = CASE WHEN ${tiene('observaciones')} THEN ${d.observaciones ?? null} ELSE observaciones END,
          "updatedAt"   = now()
        WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
      `
      if (d.salonIds) {
        await tx.$executeRaw`DELETE FROM evento_salones WHERE "eventoId" = ${id}::uuid`
        if (d.salonIds.length) {
          await tx.$executeRaw`
            INSERT INTO evento_salones ("eventoId", "sectorId")
            SELECT ${id}::uuid, s.id FROM pos_sectores s
             WHERE s.id = ANY(${d.salonIds}::uuid[]) AND s."clienteId" = ${clienteId}::uuid
          `
        }
      }

      // Si se mueve el evento, se mueven las reservas que estaban en su
      // fecha y hora: son las que la heredaron. Las que alguien corrió a
      // mano (llegan más tarde, otro día) se quedan donde están.
      let movidas = 0
      if (d.fecha && d.fecha !== antes.fecha) {
        movidas = await tx.$executeRaw`
          UPDATE reservas SET fecha = ${d.fecha}::date, "updatedAt" = now()
           WHERE "eventoId" = ${id}::uuid AND fecha = ${antes.fecha}::date
        `
      }
      if (tiene('horaInicio') && d.horaInicio !== antes.horaInicio) {
        await tx.$executeRaw`
          UPDATE reservas SET hora = ${d.horaInicio ?? null}::time, "updatedAt" = now()
           WHERE "eventoId" = ${id}::uuid
             AND hora IS NOT DISTINCT FROM ${antes.horaInicio}::time
        `
      }

      // Los salones se auditan por nombre: un uuid en la línea de tiempo no le
      // dice nada a nadie.
      const ids = [...new Set([...antes.salonIds, ...(d.salonIds ?? [])])]
      const nombres = new Map(
        ids.length
          ? (
              await tx.$queryRaw<Array<{ id: string; nombre: string }>>`
                SELECT id::text, nombre FROM pos_sectores WHERE id = ANY(${ids}::uuid[])
              `
            ).map((s) => [s.id, s.nombre])
          : []
      )
      const aNombres = (xs: string[]) => xs.map((x) => nombres.get(x) ?? '?').sort()
      const despues = { ...d, salonIds: aNombres(d.salonIds ?? antes.salonIds) }
      const dif = diferencias({ ...antes, salonIds: aNombres(antes.salonIds) }, despues, ETIQUETAS)
      if (dif.hay) {
        await auditar(tx, {
          clienteId: clienteId!,
          eventoId: id,
          accion: 'editado',
          descripcion: dif.texto + (movidas ? ` (se movieron ${movidas} reservas a la fecha nueva)` : ''),
          antes: dif.antes,
          despues: dif.despues,
          user,
        })
      }
      return true
    })
    if (!resultado) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[eventos] edición', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

/**
 * Sólo se borra un evento vacío. Con reservas, aunque estén canceladas, hay
 * historia que cuidar: se cancelan las reservas y el evento queda.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  try {
    const r = await prisma.$transaction(async (tx) => {
      const ev = await eventoBase(clienteId!, id, tx)
      if (!ev) return 'no'
      const [c] = await tx.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM reservas WHERE "eventoId" = ${id}::uuid
      `
      if ((c?.n ?? 0) > 0) return 'reservas'
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: id,
        accion: 'borrado',
        descripcion: `Evento borrado: ${ev.nombre} (${ev.fecha})`,
        antes: ev,
        user,
      })
      await tx.$executeRaw`DELETE FROM eventos WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid`
      return 'ok'
    })
    if (r === 'no') return NextResponse.json({ error: 'No existe' }, { status: 404 })
    if (r === 'reservas') {
      return NextResponse.json({ error: 'El evento tiene reservas: cancelalas o movelas antes de borrarlo' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[eventos] baja', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
