import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { auditar, esUuid, mensajeError } from '@/lib/eventos/db'
import { adicionalesDe, adicionalesTexto, guardarAdicionales, leerAdicionales, sugerenciasAdicionales } from '@/lib/eventos/menus'

export const dynamic = 'force-dynamic'

/** Descripciones ya usadas en la casa, para sugerir al cargar ("Show de Tango", "DJ"…). */
export async function GET() {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const sugerencias = await sugerenciasAdicionales(clienteId!)
  return NextResponse.json({ sugerencias: verImportes ? sugerencias : sugerencias.map((s) => ({ ...s, precioUnitario: 0 })) })
}

/**
 * Reemplaza los adicionales propios de un evento o de una reserva. Los del
 * evento los heredan todas sus reservas y entran en su total (los del
 * titular) por la vista `reserva_totales`.
 */
export async function PUT(request: NextRequest) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const reservaId = esUuid(b?.reservaId) ? b.reservaId : null
  const eventoIdBody = !reservaId && esUuid(b?.eventoId) ? b.eventoId : null
  if (!reservaId && !eventoIdBody) return NextResponse.json({ error: 'Falta el evento o la reserva' }, { status: 400 })
  const leidos = leerAdicionales(b?.adicionales, !reservaId)
  if ('error' in leidos) return NextResponse.json({ error: leidos.error }, { status: 400 })

  try {
    const ok = await prisma.$transaction(async (tx) => {
      let eventoId = eventoIdBody
      if (reservaId) {
        const [r] = await tx.$queryRaw<Array<{ eventoId: string | null }>>`
          SELECT "eventoId" FROM reservas WHERE id = ${reservaId}::uuid AND "clienteId" = ${clienteId}::uuid FOR UPDATE
        `
        if (!r) return false
        eventoId = r.eventoId
      } else {
        const [e] = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM eventos WHERE id = ${eventoId}::uuid AND "clienteId" = ${clienteId}::uuid FOR UPDATE
        `
        if (!e) return false
      }
      const dueno = reservaId ? { reservaId } : { eventoId }
      const previos = (await adicionalesDe(dueno)).filter((a) => !a.delEvento)
      let xs = leidos.adicionales
      // Sin importes los precios no se ven ni se mandan: se conservan.
      if (!verImportes) {
        const precio = new Map(previos.map((a) => [a.id, a.precioUnitario]))
        xs = xs.map((a) => ({ ...a, precioUnitario: (a.id && precio.get(a.id)) || 0 }))
      }
      await guardarAdicionales(tx, clienteId!, dueno, xs)
      const antes = adicionalesTexto(previos)
      const despues = adicionalesTexto(xs)
      const cambioPrecio = JSON.stringify(previos.map((a) => a.precioUnitario)) !== JSON.stringify(xs.map((a) => a.precioUnitario))
      if (antes !== despues || cambioPrecio) {
        await auditar(tx, {
          clienteId: clienteId!,
          eventoId,
          reservaId,
          accion: 'adicionales',
          descripcion: antes !== despues ? `Adicionales: ${antes} → ${despues}` : 'Adicionales: cambiaron los precios',
          antes: previos.map(({ delEvento: _, ...a }) => a),
          despues: xs,
          user,
        })
      }
      return true
    })
    if (!ok) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[eventos/adicionales]', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
