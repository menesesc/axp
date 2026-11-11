import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { auditar, esFecha, listarEventos, mensajeError } from '@/lib/eventos/db'
import { leerEvento } from '@/lib/eventos/entrada'

export const dynamic = 'force-dynamic'

/** Eventos de un rango, con el agregado de sus reservas. */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const sp = request.nextUrl.searchParams
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')
  const eventos = await listarEventos(clienteId!, {
    desde: esFecha(desde) ? desde : null,
    hasta: esFecha(hasta) ? hasta : null,
    q: sp.get('q'),
  })
  return NextResponse.json({
    eventos: verImportes ? eventos : eventos.map((e) => ({ ...e, total: 0, cobrado: 0, saldo: 0, precioAdulto: 0, precioMenor: 0, senaMonto: null })),
    verImportes,
  })
}

export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const body = await request.json().catch(() => null)
  const ev = leerEvento(body, true)
  if ('error' in ev) return NextResponse.json({ error: ev.error }, { status: 400 })
  const d = ev.datos

  try {
    const id = await prisma.$transaction(async (tx) => {
      const [e] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO eventos ("clienteId", nombre, tipo, fecha, "horaInicio", "horaFin", cupo,
                             "precioAdulto", "precioMenor", "ivaModo", "ivaAlicuota", "pagoModo",
                             "senaPct", "senaMonto", "senaVence", "saldoVence", observaciones, "createdById")
        VALUES (${clienteId}::uuid, ${d.nombre}, ${d.tipo ?? 'OTRO'}, ${d.fecha}::date, ${d.horaInicio ?? null}::time,
                ${d.horaFin ?? null}::time, ${d.cupo ?? null}::int, ${d.precioAdulto ?? 0}::numeric, ${d.precioMenor ?? 0}::numeric,
                ${d.ivaModo ?? 'FINAL'}, ${d.ivaAlicuota ?? 21}::numeric, ${d.pagoModo ?? 'NINGUNA'},
                ${d.senaPct ?? null}::numeric, ${d.senaMonto ?? null}::numeric, ${d.senaVence ?? null}::date,
                ${d.saldoVence ?? null}::date, ${d.observaciones ?? null}, ${user?.id ?? null}::uuid)
        RETURNING id
      `
      if (d.salonIds?.length) {
        await tx.$executeRaw`
          INSERT INTO evento_salones ("eventoId", "sectorId")
          SELECT ${e!.id}::uuid, s.id FROM pos_sectores s
           WHERE s.id = ANY(${d.salonIds}::uuid[]) AND s."clienteId" = ${clienteId}::uuid
        `
      }
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: e!.id,
        accion: 'creado',
        descripcion: `Evento creado: ${d.nombre} (${d.fecha})`,
        despues: d,
        user,
      })
      return e!.id
    })
    return NextResponse.json({ id })
  } catch (e) {
    console.error('[eventos] alta', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
