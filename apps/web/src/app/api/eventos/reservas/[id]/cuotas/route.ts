import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { cuotasDeRegla, fechaCorta, type CuotaDef } from '@/lib/eventos/constantes'
import { auditar, cuotasDe, esFecha, esUuid, eventoBase, guardarCuotas, mensajeError, numero, texto } from '@/lib/eventos/db'

export const dynamic = 'force-dynamic'

const describir = (cs: CuotaDef[]) =>
  cs
    .map((c) => {
      const cuanto = c.monto != null ? `$ ${c.monto.toLocaleString('es-AR')}` : c.porcentaje != null ? `${c.porcentaje} %` : 'el resto'
      return `${c.concepto} ${cuanto}${c.vencimiento ? ` vence ${fechaCorta(c.vencimiento)}` : ''}`
    })
    .join(' · ') || 'sin plan'

/**
 * Reemplaza el plan de pagos. Con `regenerar` lo vuelve a armar desde la
 * regla del evento (sirve si la regla cambió después de cargar la reserva).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const b = (await request.json().catch(() => null)) as { cuotas?: unknown; regenerar?: boolean } | null

  const [reserva] = await prisma.$queryRaw<Array<{ eventoId: string | null }>>`
    SELECT "eventoId" FROM reservas WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!reserva) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  let cuotas: CuotaDef[]
  if (b?.regenerar) {
    const ev = reserva.eventoId ? await eventoBase(clienteId!, reserva.eventoId) : null
    if (!ev) return NextResponse.json({ error: 'La reserva no es de un evento' }, { status: 400 })
    cuotas = cuotasDeRegla(ev)
  } else {
    if (!Array.isArray(b?.cuotas)) return NextResponse.json({ error: 'Faltan las cuotas' }, { status: 400 })
    cuotas = []
    for (const [i, c] of (b.cuotas as Array<Record<string, unknown>>).entries()) {
      const concepto = texto(c?.concepto, 60)
      if (!concepto) return NextResponse.json({ error: 'Cada cuota necesita un concepto' }, { status: 400 })
      if (c.vencimiento && !esFecha(c.vencimiento)) return NextResponse.json({ error: 'Vencimiento inválido' }, { status: 400 })
      const monto = numero(c.monto)
      const porcentaje = monto == null ? numero(c.porcentaje) : null
      if (porcentaje != null && porcentaje > 100) return NextResponse.json({ error: 'Un porcentaje no puede pasar de 100' }, { status: 400 })
      cuotas.push({
        concepto,
        monto: monto && monto > 0 ? monto : null,
        porcentaje,
        vencimiento: (c.vencimiento as string) || null,
        orden: i,
      })
    }
    const pct = cuotas.reduce((s, c) => s + (c.porcentaje ?? 0), 0)
    if (pct > 100) return NextResponse.json({ error: 'Los porcentajes suman más de 100' }, { status: 400 })
  }

  try {
    const antes = (await cuotasDe([id])).get(id) ?? []
    await prisma.$transaction(async (tx) => {
      await guardarCuotas(tx, id, cuotas)
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: reserva.eventoId,
        reservaId: id,
        accion: 'cuotas',
        descripcion: `Plan de pagos: ${describir(antes)} → ${describir(cuotas)}`,
        antes,
        despues: cuotas,
        user,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[reservas] cuotas', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
