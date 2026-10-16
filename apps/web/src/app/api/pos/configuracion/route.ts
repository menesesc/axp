import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { configuracionDe } from '@/lib/pos/db'
import { TURNOS_POR_DEFECTO, type Turno } from '@/lib/pos/turnos'

export const dynamic = 'force-dynamic'

/** Config del punto de venta: pantallas, monedas y los turnos de la casa. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.POS)
  if (error) return error
  return NextResponse.json({ configuracion: await configuracionDe(clienteId!) })
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as { turnos?: Turno[] } | null

  if (b?.turnos) {
    const limpios = b.turnos
      .filter((t) => t?.nombre?.trim() && /^\d{1,2}:\d{2}$/.test(t.desde ?? ''))
      .map((t) => ({ nombre: t.nombre.trim().slice(0, 20), desde: t.desde.padStart(5, '0') }))
    if (limpios.length === 0) {
      return NextResponse.json({ error: 'Dejá al menos un turno' }, { status: 400 })
    }
    await prisma.$executeRaw`
      UPDATE pos_configuracion SET turnos = ${JSON.stringify(limpios)}::jsonb, "updatedAt" = now()
       WHERE "clienteId" = ${clienteId}::uuid
    `
  }

  return NextResponse.json({ ok: true, turnos: b?.turnos ?? TURNOS_POR_DEFECTO })
}
