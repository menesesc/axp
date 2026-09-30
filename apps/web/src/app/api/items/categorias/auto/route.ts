import { NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { categorizarPendientes } from '@/lib/compras/categorias'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Clasifica con IA una tanda de descripciones sin categoría. La UI lo llama
 * en loop mientras `pendientes > 0` para mostrar el progreso.
 */
export async function POST() {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  try {
    const r = await categorizarPendientes(clienteId, 240)
    return NextResponse.json(r)
  } catch (e) {
    console.error('Error categorizando items:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error de IA' }, { status: 502 })
  }
}
