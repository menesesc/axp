import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { auditar, esUuid, mensajeError } from '@/lib/eventos/db'
import { guardarVersion, presupuestoEvento, presupuestoReserva, versionesDe } from '@/lib/eventos/presupuesto-db'
import type { PresupuestoDatos } from '@/lib/eventos/presupuesto'

export const dynamic = 'force-dynamic'

/**
 * Presupuesto de una reserva (?reservaId=) o de un evento (?eventoId=).
 *
 *   sin ?id   el presupuesto armado con lo de hoy, más la lista de versiones
 *   ?id=      una versión guardada, exactamente como se mandó
 *
 * ?regimenes=1 incluye los regímenes especiales (por defecto no van).
 */
export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const sp = request.nextUrl.searchParams
  const reservaId = sp.get('reservaId')
  const eventoId = sp.get('eventoId')
  const versionId = sp.get('id')

  if (versionId) {
    if (!esUuid(versionId)) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    const [v] = await prisma.$queryRaw<
      Array<{ id: string; version: number; datos: PresupuestoDatos; reservaId: string | null; eventoId: string | null; usuarioNombre: string | null; createdAt: Date }>
    >`
      SELECT id, version, datos, "reservaId", "eventoId", "usuarioNombre", "createdAt"
        FROM evento_presupuestos WHERE id = ${versionId}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    if (!v) return NextResponse.json({ error: 'No existe' }, { status: 404 })
    return NextResponse.json({ version: { ...v, datos: verImportes ? v.datos : { ...v.datos, importes: null } }, conLogo: await conLogo(clienteId!) })
  }

  const opciones = { regimenes: sp.get('regimenes') === '1', verImportes }
  const armado = esUuid(reservaId)
    ? await presupuestoReserva(clienteId!, reservaId, opciones)
    : esUuid(eventoId)
      ? await presupuestoEvento(clienteId!, eventoId, opciones)
      : null
  if (!armado) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const versiones = await versionesDe(clienteId!, esUuid(reservaId) ? { reservaId } : { eventoId: eventoId! })
  return NextResponse.json({
    actual: armado.datos,
    conLogo: armado.conLogo,
    versiones: versiones.map((v) => ({ ...v, total: verImportes ? v.total : null })),
    verImportes,
  })
}

/**
 * Genera una versión: congela el presupuesto de hoy como v1, v2… y lo deja
 * en la línea de tiempo. No manda nada por mail: el texto y el PDF salen de
 * la pantalla.
 */
export async function POST(request: NextRequest) {
  const { user, clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  // Un presupuesto sin precios no es un presupuesto: para generar versiones hay que ver importes.
  if (!verImportes) return NextResponse.json({ error: 'Para generar presupuestos necesitás ver importes' }, { status: 403 })
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const reservaId = esUuid(b?.reservaId) ? b.reservaId : null
  const eventoId = !reservaId && esUuid(b?.eventoId) ? b.eventoId : null
  const regimenes = b?.regimenes === true
  const armado = reservaId
    ? await presupuestoReserva(clienteId!, reservaId, { regimenes, verImportes })
    : eventoId
      ? await presupuestoEvento(clienteId!, eventoId, { regimenes, verImportes })
      : null
  if (!armado) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  try {
    const v = await prisma.$transaction(async (tx) => {
      const g = await guardarVersion(tx, clienteId!, { eventoId: armado.eventoId, reservaId }, armado.datos, regimenes, user)
      await auditar(tx, {
        clienteId: clienteId!,
        eventoId: armado.eventoId,
        reservaId,
        accion: 'presupuesto',
        descripcion: `Presupuesto v${g.version} generado${reservaId ? '' : ' (del evento)'}${regimenes ? ', con regímenes' : ''}`,
        despues: { presupuestoId: g.id, version: g.version },
        user,
      })
      return g
    })
    return NextResponse.json({ id: v.id, version: v.version, datos: v.datos })
  } catch (e) {
    console.error('[eventos/presupuestos]', e)
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

async function conLogo(clienteId: string) {
  const [c] = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT "logoKey" IS NOT NULL AS ok FROM clientes WHERE id = ${clienteId}::uuid`
  return !!c?.ok
}
