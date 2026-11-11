import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'
import { MEDIO_TEXTO, fechaCorta, type MedioPago } from '@/lib/eventos/constantes'
import { auditar, esFecha, esUuid, mensajeError, nombreDe, numero, pagosDe, texto } from '@/lib/eventos/db'

export const dynamic = 'force-dynamic'

/*
 * Pagos de reservas. Van en su propia sección de permisos (eventos.cobros):
 * quien toma reservas no necesariamente maneja plata.
 *
 * El % cobrado de la reserva sale solo de acá (el cobro no es un estado):
 * nadie lo pone a mano. La integración con el flujo de Finanzas es de la
 * etapa 4; por eso el pago ya trae "movimientoId", vacío por ahora.
 */

const MEDIOS = Object.keys(MEDIO_TEXTO) as MedioPago[]
const pesos = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`

export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_COBROS)
  if (error) return error
  if (!verImportes) return NextResponse.json({ pagos: [] })
  const reservaId = request.nextUrl.searchParams.get('reservaId')
  if (!esUuid(reservaId)) return NextResponse.json({ error: 'Falta la reserva' }, { status: 400 })
  const [r] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM reservas WHERE id = ${reservaId}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!r) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json({ pagos: await pagosDe(reservaId) })
}

/** Registra un pago o una devolución. */
export async function POST(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_COBROS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!esUuid(b?.reservaId)) return NextResponse.json({ error: 'Falta la reserva' }, { status: 400 })
  const reservaId = b.reservaId
  const monto = numero(b.monto)
  if (!monto) return NextResponse.json({ error: 'El monto tiene que ser mayor a cero' }, { status: 400 })
  const medio = b.medio as MedioPago
  if (!MEDIOS.includes(medio)) return NextResponse.json({ error: 'Elegí el medio de pago' }, { status: 400 })
  const tipo = b.tipo === 'DEVOLUCION' ? 'DEVOLUCION' : 'PAGO'
  const fecha = esFecha(b.fecha) ? b.fecha : hoyAR()
  const comprobante = texto(b.comprobante, 120)
  const nota = texto(b.nota, 300)

  try {
    const r = await prisma.$transaction(async (tx) => {
      // Bloquea la reserva: dos devoluciones a la vez no pueden pasar el cobrado.
      await tx.$executeRaw`SELECT 1 FROM reservas WHERE id = ${reservaId}::uuid FOR UPDATE`
      const [res] = await tx.$queryRaw<Array<{ eventoId: string | null; numero: number; cobrado: number; total: number }>>`
        SELECT r."eventoId", r.numero, t.cobrado::float8 AS cobrado, t.total::float8 AS total
          FROM reservas r JOIN reserva_totales t ON t."reservaId" = r.id
         WHERE r.id = ${reservaId}::uuid AND r."clienteId" = ${clienteId}::uuid
      `
      if (!res) return 'no'
      // No se devuelve más de lo que entró.
      if (tipo === 'DEVOLUCION' && monto > res.cobrado + 0.009) return 'devolucion'
      const [p] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO reserva_pagos ("clienteId", "reservaId", tipo, fecha, monto, medio, comprobante, nota, "usuarioId", "usuarioNombre")
        VALUES (${clienteId}::uuid, ${reservaId}::uuid, ${tipo}, ${fecha}::date, ${monto}::numeric, ${medio},
                ${comprobante}, ${nota}, ${user?.id ?? null}::uuid, ${nombreDe(user)})
        RETURNING id
      `
      const cobrado = tipo === 'PAGO' ? res.cobrado + monto : res.cobrado - monto
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: res.eventoId,
        reservaId,
        accion: 'pago',
        descripcion:
          `${tipo === 'PAGO' ? 'Pago registrado' : 'Devolución registrada'}: ${pesos(monto)} en ${MEDIO_TEXTO[medio].toLowerCase()}` +
          ` el ${fechaCorta(fecha)}${comprobante ? ` (comp. ${comprobante})` : ''} · cobrado ${pesos(res.cobrado)} → ${pesos(cobrado)}` +
          ` de ${pesos(res.total)}`,
        despues: { pagoId: p!.id, tipo, monto, medio, fecha, comprobante, nota },
        user,
      })
      return p!.id
    })
    if (r === 'no') return NextResponse.json({ error: 'No existe' }, { status: 404 })
    if (r === 'devolucion') return NextResponse.json({ error: 'No se puede devolver más de lo cobrado' }, { status: 400 })
    return NextResponse.json({ id: r })
  } catch (e) {
    console.error('[eventos] pago', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

/** Anula un pago. No se borra: queda tachado y con el motivo. */
export async function DELETE(request: NextRequest) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_COBROS, 'edit')
  if (error) return error
  const sp = request.nextUrl.searchParams
  const id = sp.get('id')
  if (!esUuid(id)) return NextResponse.json({ error: 'Falta el pago' }, { status: 400 })
  const motivo = texto(sp.get('motivo'), 300)
  if (!motivo) return NextResponse.json({ error: 'Contá por qué se anula' }, { status: 400 })

  try {
    const r = await prisma.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<
        Array<{ reservaId: string; eventoId: string | null; tipo: string; monto: number; medio: MedioPago; fecha: string; anuladoAt: Date | null }>
      >`
        SELECT p."reservaId", r."eventoId", p.tipo, p.monto::float8 AS monto, p.medio,
               to_char(p.fecha, 'YYYY-MM-DD') AS fecha, p."anuladoAt"
          FROM reserva_pagos p JOIN reservas r ON r.id = p."reservaId"
         WHERE p.id = ${id}::uuid AND p."clienteId" = ${clienteId}::uuid
         FOR UPDATE OF p
      `
      if (!p) return 'no'
      if (p.anuladoAt) return 'ya'
      await tx.$executeRaw`
        UPDATE reserva_pagos SET "anuladoAt" = now(), "anuladoPor" = ${nombreDe(user)}, "anuladoMotivo" = ${motivo}
         WHERE id = ${id}::uuid
      `
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: p.eventoId,
        reservaId: p.reservaId,
        accion: 'pago_anulado',
        descripcion: `${p.tipo === 'PAGO' ? 'Pago' : 'Devolución'} anulado: ${pesos(p.monto)} en ${MEDIO_TEXTO[p.medio]?.toLowerCase() ?? p.medio} del ${fechaCorta(p.fecha)} · ${motivo}`,
        antes: { pagoId: id, ...p, anuladoAt: null },
        despues: { motivo },
        user,
      })
      return 'ok'
    })
    if (r === 'no') return NextResponse.json({ error: 'No existe' }, { status: 404 })
    if (r === 'ya') return NextResponse.json({ error: 'Ya estaba anulado' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[eventos] anular pago', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
