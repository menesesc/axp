import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { sincronizarPresentia } from '@/lib/integraciones/sincronizar-presentia'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Sincroniza Presentia a pedido: costo por mes y la plata que salió por la
 * nómina, día por día. Con `probar=1` no guarda nada: sólo dice si la
 * conexión anda y qué trajo.
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { desde?: string; hasta?: string; probar?: boolean }
    | null

  try {
    const r = await sincronizarPresentia(clienteId!, {
      ...(b?.desde ? { desde: b.desde } : {}),
      ...(b?.hasta ? { hasta: b.hasta } : {}),
      probar: !!b?.probar,
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 300) }, { status: 502 })
  }
}
