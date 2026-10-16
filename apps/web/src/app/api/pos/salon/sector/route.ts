import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Zoom del plano de un sector.
 *
 * Es del plano, no de quien lo mira: se elige una vez en el diseñador para que
 * el salón entre completo, y así lo ven la caja y el mozo.
 */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as { id?: string; planoZoom?: number } | null
  const zoom = Number(b?.planoZoom)
  if (!b?.id || !Number.isFinite(zoom)) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const acotado = Math.min(1.5, Math.max(0.3, Math.round(zoom * 100) / 100))
  const n = await prisma.$executeRaw`
    UPDATE pos_sectores SET "planoZoom" = ${acotado}
     WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (n === 0) return NextResponse.json({ error: 'No existe el sector' }, { status: 404 })
  return NextResponse.json({ ok: true, planoZoom: acotado })
}
