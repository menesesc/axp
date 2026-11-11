import { prisma } from '@/lib/prisma'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { calcularPlan, fechaCorta, type Alerta } from './constantes'
import { agendaDe, configuracionDe, cuotasDe, listarEventos, listarReservas, type ReservaFila } from './db'

/**
 * Lo que pide atención en eventos y reservas. Cada alerta sale de los datos
 * (nada se marca a mano) y lleva a la ficha donde se resuelve.
 *
 * Una seña vencida sólo avisa: nunca libera el lugar sola. Decidir qué
 * hacer con esa reserva es de una persona.
 */

const hrefReserva = (r: { id: string }) => `/eventos/reserva/${r.id}`
const pesos = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`
const etiqueta = (r: ReservaFila) => `#${r.numero} ${r.nombre}${r.eventoNombre ? ` · ${r.eventoNombre}` : ''}`

export async function alertasDe(clienteId: string, verImportes: boolean): Promise<Alerta[]> {
  const hoy = hoyAR()
  const cfg = await configuracionDe(clienteId)

  // Lo vivo: de los últimos seis meses en adelante. Las finalizadas con saldo
  // se buscan aparte, sin límite de fecha: una deuda no prescribe en la lista.
  // Lo rechazado y lo cancelado no avisa nada, salvo que haya plata para
  // devolver.
  const [vivas, finalizadas, bajas, agenda, eventos] = await Promise.all([
    listarReservas(clienteId, { desde: sumarDias(hoy, -180), estados: ['PRESUPUESTO', 'APROBADO'] }),
    listarReservas(clienteId, { estados: ['FINALIZADO'], conSaldo: true }),
    listarReservas(clienteId, { estados: ['RECHAZADO', 'CANCELADO'] }),
    agendaDe(clienteId, { soloPendientes: true, hasta: hoy }),
    listarEventos(clienteId, { desde: hoy, hasta: sumarDias(hoy, 120) }),
  ])
  const cuotas = await cuotasDe(vivas.map((r) => r.id))
  // Los días se cuentan desde el último presupuesto generado (v1, v2…) y, si
  // nunca se generó, desde que se cargó la reserva: mandar una versión nueva
  // es volver a esperar respuesta.
  const creadas = await prisma.$queryRaw<Array<{ id: string; dias: number }>>`
    SELECT r.id,
           (current_date - COALESCE((SELECT max(p."createdAt") FROM evento_presupuestos p WHERE p."reservaId" = r.id),
                                    r."createdAt")::date)::int AS dias
      FROM reservas r
     WHERE r."clienteId" = ${clienteId}::uuid AND r.estado = 'PRESUPUESTO'
       AND r.id = ANY(${vivas.filter((r) => r.estado === 'PRESUPUESTO').map((r) => r.id)}::uuid[])
  `
  const diasDe = new Map(creadas.map((c) => [c.id, c.dias]))
  const out: Alerta[] = []
  const m = (n: number) => (verImportes ? n : null)

  // Reservas pasadas sin finalizar, agrupadas por evento: con cien reservas
  // del 31/12 sin cerrar, una sola alerta del evento es lo que sirve.
  const pasadasPorEvento = new Map<string, ReservaFila[]>()

  for (const r of vivas) {
    if (r.fecha < hoy && (r.estado === 'PRESUPUESTO' || r.estado === 'APROBADO')) {
      if (r.eventoId) {
        const arr = pasadasPorEvento.get(r.eventoId)
        if (arr) arr.push(r)
        else pasadasPorEvento.set(r.eventoId, [r])
      } else {
        out.push({
          id: `pasada-${r.id}`,
          tipo: 'evento_sin_finalizar',
          gravedad: 'media',
          titulo: etiqueta(r),
          detalle: `Fue el ${fechaCorta(r.fecha)} y sigue ${r.estado === 'PRESUPUESTO' ? 'presupuestada' : 'aprobada'}`,
          fecha: r.fecha,
          href: hrefReserva(r),
          monto: null,
        })
      }
      continue
    }
    if (r.fecha < hoy) continue

    // Cuotas: vencidas o por vencer, sólo en lo que sigue en pie.
    if (r.saldo > 0) {
      const plan = calcularPlan(cuotas.get(r.id) ?? [], r.total, r.cobrado, hoy, cfg.diasAvisoVencimiento)
      for (const c of plan) {
        if (c.estado !== 'VENCIDA' && c.estado !== 'POR_VENCER') continue
        out.push({
          id: `cuota-${r.id}-${c.orden}`,
          tipo: c.estado === 'VENCIDA' ? 'cuota_vencida' : 'cuota_proxima',
          gravedad: c.estado === 'VENCIDA' ? 'alta' : 'media',
          titulo: etiqueta(r),
          detalle:
            `${c.concepto} ${c.estado === 'VENCIDA' ? 'vencida el' : 'vence el'} ${fechaCorta(c.vencimiento)}` +
            (verImportes ? ` · faltan ${pesos(c.pendiente)}` : '') +
            (r.contactoTelefono ? ` · ${r.contactoTelefono}` : ''),
          fecha: c.vencimiento,
          href: hrefReserva(r),
          monto: m(c.pendiente),
        })
      }
    }

    const dias = diasDe.get(r.id)
    if (r.estado === 'PRESUPUESTO' && dias !== undefined && dias >= cfg.diasPresupuesto) {
      out.push({
        id: `presupuesto-${r.id}`,
        tipo: 'presupuesto_sin_respuesta',
        gravedad: 'baja',
        titulo: etiqueta(r),
        detalle: `Presupuesto de hace ${dias} días sin respuesta${r.contactoTelefono ? ` · ${r.contactoTelefono}` : ''}`,
        fecha: r.fecha,
        href: hrefReserva(r),
        monto: m(r.total),
      })
    }

    // Un régimen sin nota de servicio llega a la cocina como "2 alergia" y
    // nadie sabe a qué.
    const conRegimen = r.regimenes.reduce((s, g) => s + g.cantidad, 0)
    if (conRegimen > 0 && !r.notaServicio?.trim() && r.regimenes.some((g) => !g.nota?.trim())) {
      out.push({
        id: `regimen-${r.id}`,
        tipo: 'regimen_sin_nota',
        gravedad: r.regimenes.some((g) => g.tipo === 'ALERGIA') ? 'alta' : 'baja',
        titulo: etiqueta(r),
        detalle: `${conRegimen} con régimen especial y sin indicaciones para la cocina`,
        fecha: r.fecha,
        href: hrefReserva(r),
        monto: null,
      })
    }
  }

  for (const [eventoId, rs] of pasadasPorEvento) {
    const r0 = rs[0]!
    out.push({
      id: `pasado-${eventoId}`,
      tipo: 'evento_sin_finalizar',
      gravedad: 'media',
      titulo: r0.eventoNombre ?? 'Evento',
      detalle: `Fue el ${fechaCorta(r0.fecha)} y tiene ${rs.length} reserva${rs.length === 1 ? '' : 's'} sin finalizar`,
      fecha: r0.fecha,
      href: `/eventos/evento/${eventoId}`,
      monto: null,
    })
  }

  for (const r of finalizadas) {
    if (r.saldo <= 0) continue
    out.push({
      id: `saldo-${r.id}`,
      tipo: 'finalizada_con_saldo',
      gravedad: 'alta',
      titulo: etiqueta(r),
      detalle: `Finalizada el ${fechaCorta(r.fecha)} con saldo impago${verImportes ? ` de ${pesos(r.saldo)}` : ''}`,
      fecha: r.fecha,
      href: hrefReserva(r),
      monto: m(r.saldo),
    })
  }

  // Rechazada con plata cobrada, o cancelada con la seña a devolver: mientras
  // lo cobrado no vuelva a cero (la devolución se carga en Pagos), avisa.
  for (const r of bajas) {
    if (r.cobrado <= 0) continue
    if (r.estado === 'CANCELADO' && r.cancelacionSena !== 'DEVUELTA') continue
    out.push({
      id: `devolver-${r.id}`,
      tipo: 'devolucion_pendiente',
      gravedad: 'media',
      titulo: etiqueta(r),
      detalle:
        `${r.estado === 'RECHAZADO' ? 'Rechazada' : 'Cancelada con la seña a devolver'}` +
        `${verImportes ? ` · quedan ${pesos(r.cobrado)} para devolver` : ' · queda plata para devolver'}` +
        (r.contactoTelefono ? ` · ${r.contactoTelefono}` : ''),
      fecha: r.fecha,
      href: hrefReserva(r),
      monto: m(r.cobrado),
    })
  }

  for (const g of agenda) {
    const cuando = new Date(g.fechaHora)
    const vencida = cuando.getTime() < Date.now()
    out.push({
      id: `agenda-${g.id}`,
      tipo: 'agenda',
      gravedad: vencida ? 'media' : 'baja',
      titulo: g.titulo,
      detalle:
        `${cuando.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` +
        `${g.reservaNombre ? ` · #${g.reservaNumero} ${g.reservaNombre}` : g.eventoNombre ? ` · ${g.eventoNombre}` : ''}` +
        `${g.responsableNombre ? ` · ${g.responsableNombre}` : ''}`,
      fecha: null,
      href: g.reservaId ? `/eventos/reserva/${g.reservaId}` : `/eventos/evento/${g.eventoId}`,
      monto: null,
    })
  }

  for (const e of eventos) {
    if (!e.cupo) continue
    const pct = Math.round((e.personas / e.cupo) * 100)
    if (pct < cfg.avisoCupoPct) continue
    out.push({
      id: `cupo-${e.id}`,
      tipo: 'cupo',
      gravedad: pct >= 100 ? 'alta' : 'baja',
      titulo: e.nombre,
      detalle: `${e.personas} de ${e.cupo} personas (${pct} %)${pct > 100 ? ' · pasado de cupo' : ''}`,
      fecha: e.fecha,
      href: `/eventos/evento/${e.id}`,
      monto: null,
    })
  }

  const peso = { alta: 0, media: 1, baja: 2 }
  return out.sort((a, b) => peso[a.gravedad] - peso[b.gravedad] || (a.fecha ?? '9').localeCompare(b.fecha ?? '9'))
}
