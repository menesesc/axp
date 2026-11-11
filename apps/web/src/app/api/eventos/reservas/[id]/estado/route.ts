import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { ESTADOS, ESTADO_TEXTO, TRANSICIONES, dadaDeBaja, type EstadoReserva } from '@/lib/eventos/constantes'
import { CupoExcedido, auditar, esUuid, mensajeError, respuestaCupo, texto, verificarCupo } from '@/lib/eventos/db'

export const dynamic = 'force-dynamic'

const VALIDOS = ESTADOS.map((e) => e.valor)

/**
 * Cambio de estado manual. El cobro no es un estado: el % cobrado sale de
 * los pagos.
 *
 * Los pasos permitidos están en TRANSICIONES: un presupuesto se aprueba o se
 * rechaza; un rechazado se reabre; un aprobado se cancela o se finaliza; un
 * cancelado se reactiva y un finalizado se reabre (los dos vuelven a
 * aprobado). Queda todo en la línea de tiempo. Al cancelar con plata
 * cobrada hay que decir qué pasa con la seña; si se devuelve, la devolución
 * se registra aparte en Pagos, con su medio y su comprobante.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const estado = b?.estado as EstadoReserva
  if (!VALIDOS.includes(estado)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  const cancelacion = b?.cancelacionSena === 'DEVUELTA' || b?.cancelacionSena === 'RETENIDA' ? b.cancelacionSena : null
  const nota = texto(b?.nota, 500)

  try {
    const r = await prisma.$transaction(async (tx) => {
      const [antes] = await tx.$queryRaw<
        Array<{ estado: EstadoReserva; eventoId: string | null; personas: number; cobrado: number; numero: number }>
      >`
        SELECT r.estado, r."eventoId", t.personas, t.cobrado::float8 AS cobrado, r.numero
          FROM reservas r JOIN reserva_totales t ON t."reservaId" = r.id
         WHERE r.id = ${id}::uuid AND r."clienteId" = ${clienteId}::uuid
      `
      if (!antes) return { status: 404, error: 'No existe' }
      if (antes.estado === estado) return { status: 400, error: `Ya está en ${ESTADO_TEXTO[estado].toLowerCase()}` }
      if (!TRANSICIONES[antes.estado].includes(estado)) {
        return { status: 400, error: `No se puede pasar de ${ESTADO_TEXTO[antes.estado].toLowerCase()} a ${ESTADO_TEXTO[estado].toLowerCase()}` }
      }
      if (estado === 'CANCELADO' && antes.cobrado > 0 && !cancelacion) {
        return { status: 400, error: 'Tiene plata cobrada: indicá si la seña se devuelve o se retiene', codigo: 'SENA' }
      }

      // Reactivar un cancelado o reabrir un rechazado vuelve a ocupar lugar.
      let exceso: { cupo: number; ocupado: number } | null = null
      if (dadaDeBaja(antes.estado) && !dadaDeBaja(estado) && antes.eventoId) {
        exceso = await verificarCupo(tx, antes.eventoId, id, antes.personas, b?.forzarCupo === true)
      }

      await tx.$executeRaw`
        UPDATE reservas SET
          estado            = ${estado},
          "aprobadaAt"      = CASE WHEN ${estado} IN ('APROBADO', 'FINALIZADO') THEN COALESCE("aprobadaAt", now())
                                   WHEN ${estado} = 'PRESUPUESTO' THEN NULL ELSE "aprobadaAt" END,
          "finalizadaAt"    = CASE WHEN ${estado} = 'FINALIZADO' THEN now() ELSE NULL END,
          "canceladaAt"     = CASE WHEN ${estado} = 'CANCELADO' THEN now() ELSE NULL END,
          "rechazadaAt"     = CASE WHEN ${estado} = 'RECHAZADO' THEN now() ELSE NULL END,
          "cancelacionSena" = CASE WHEN ${estado} = 'CANCELADO' THEN ${cancelacion} ELSE NULL END,
          "updatedAt"       = now()
        WHERE id = ${id}::uuid
      `
      const extra =
        estado === 'CANCELADO' && cancelacion
          ? cancelacion === 'DEVUELTA'
            ? ' · seña devuelta'
            : ' · seña retenida'
          : ''
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: antes.eventoId,
        reservaId: id,
        accion: 'estado',
        descripcion: `Estado: ${ESTADO_TEXTO[antes.estado]} → ${ESTADO_TEXTO[estado]}${extra}${nota ? ` · ${nota}` : ''}`,
        antes: { estado: antes.estado },
        despues: { estado, cancelacionSena: cancelacion, nota },
        user,
      })
      if (exceso) {
        await auditar(tx, {
          clienteId: clienteId!,
          eventoId: antes.eventoId,
          reservaId: id,
          accion: 'cupo_excedido',
          descripcion: `Volvió a ocupar lugar pasando el cupo con confirmación: había ${exceso.ocupado} de ${exceso.cupo}`,
          despues: { ...exceso, personas: antes.personas },
          user,
        })
      }
      return null
    })
    if (r) return NextResponse.json({ error: r.error, codigo: 'codigo' in r ? r.codigo : undefined }, { status: r.status })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof CupoExcedido) return NextResponse.json(respuestaCupo(e), { status: 409 })
    console.error('[reservas] estado', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
