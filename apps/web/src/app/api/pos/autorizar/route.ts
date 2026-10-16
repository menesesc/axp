import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { verificarPin } from '@/lib/pos/pin'

export const dynamic = 'force-dynamic'

/**
 * La llave del supervisor.
 *
 * Sacar un plato que la cocina todavía no vio no es nada: el mozo se
 * equivocó al tocar. Sacar uno que ya está en la plancha sí, porque la
 * mercadería se usó y alguien tiene que hacerse cargo. Por eso no alcanza
 * con el PIN propio: tiene que venir alguien cuyo rol tenga la acción
 * permitida y sin autorización, o sea el que autoriza.
 *
 * Quién puede qué sale de pos_permisos, no está escrito acá: cada casa lo
 * configura distinto.
 */

const intentos = new Map<string, { fallos: number; hasta: number }>()
const MAX_FALLOS = 5
const ESPERA_MS = 60_000

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS)
  if (error) return error

  const b = (await request.json().catch(() => null)) as { pin?: string; accion?: string } | null
  const pin = b?.pin?.trim() ?? ''
  const accion = String(b?.accion || '').trim()
  if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })
  if (!accion) return NextResponse.json({ error: 'Falta la acción' }, { status: 400 })

  const freno = intentos.get(clienteId!)
  if (freno && freno.fallos >= MAX_FALLOS && Date.now() < freno.hasta) {
    return NextResponse.json({ error: 'Demasiados intentos, esperá un minuto' }, { status: 429 })
  }

  const candidatos = await prisma.$queryRaw<
    Array<{ id: string; nombre: string; rol: string; pinHash: string | null }>
  >`
    SELECT u.id, u.nombre, u.rol, u."pinHash"
      FROM pos_usuarios u
      JOIN pos_permisos p
        ON p."clienteId" = u."clienteId" AND p.rol = u.rol AND p.accion = ${accion}
     WHERE u."clienteId" = ${clienteId}::uuid AND u.activo AND u."pinHash" IS NOT NULL
       AND p.permitido AND NOT p."requiereAutorizacion"
  `
  const u = candidatos.find((x) => verificarPin(pin, x.pinHash))

  if (!u) {
    const f = (freno?.fallos ?? 0) + 1
    intentos.set(clienteId!, { fallos: f, hasta: Date.now() + ESPERA_MS })
    // A propósito no distingue "PIN mal" de "ese usuario no autoriza esto":
    // decirlo sería contar quién tiene llave.
    return NextResponse.json({ error: 'PIN sin permiso para esto' }, { status: 401 })
  }

  intentos.delete(clienteId!)
  return NextResponse.json({ usuario: { id: u.id, nombre: u.nombre, rol: u.rol } })
}
