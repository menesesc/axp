import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { verificarPin } from '@/lib/pos/pin'

export const dynamic = 'force-dynamic'

/**
 * Identificación por PIN en la pantalla de mozos.
 *
 * El dispositivo está logueado como el cliente; quien cambia todo el tiempo es
 * el mozo que lo agarra. El PIN no es una contraseña: son cuatro dígitos que
 * se tipean a la vista de todo el salón. Lo que lo protege no es el secreto
 * sino que después de unos intentos fallidos deje de responder.
 *
 * El contador vive en memoria del proceso. Si el proceso se reinicia se
 * pierde, y está bien: frena el tanteo de un chico aburrido en el salón, que
 * es de lo que se trata, no de un atacante con la base en la mano.
 */

const intentos = new Map<string, { fallos: number; hasta: number }>()
const MAX_FALLOS = 5
const ESPERA_MS = 60_000

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS)
  if (error) return error

  const b = (await request.json().catch(() => null)) as { pin?: string } | null
  const pin = b?.pin?.trim() ?? ''
  if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ error: 'PIN inválido' }, { status: 400 })

  const freno = intentos.get(clienteId!)
  if (freno && freno.fallos >= MAX_FALLOS && Date.now() < freno.hasta) {
    return NextResponse.json({ error: 'Demasiados intentos, esperá un minuto' }, { status: 429 })
  }

  const usuarios = await prisma.$queryRaw<Array<{ id: string; nombre: string; rol: string; pinHash: string | null }>>`
    SELECT id, nombre, rol, "pinHash"
      FROM pos_usuarios
     WHERE "clienteId" = ${clienteId}::uuid AND activo AND "pinHash" IS NOT NULL
  `
  // Sin usuario que tipear: el PIN alcanza para saber quién es. Son diez
  // personas, no diez mil, y pedir el nombre antes es un paso de más en la
  // mano de alguien que lleva tres platos.
  const u = usuarios.find((x) => verificarPin(pin, x.pinHash))

  if (!u) {
    const f = (freno?.fallos ?? 0) + 1
    intentos.set(clienteId!, { fallos: f, hasta: Date.now() + ESPERA_MS })
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  intentos.delete(clienteId!)
  return NextResponse.json({ usuario: { id: u.id, nombre: u.nombre, rol: u.rol } })
}
