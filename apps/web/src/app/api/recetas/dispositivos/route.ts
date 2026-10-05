import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { actualizarCatalogo, crearEnCatalogo, listarDispositivos } from '@/lib/recetas/db'

export const dynamic = 'force-dynamic'

/** Dispositivos de cocina, con cuántas recetas usan cada uno. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  return NextResponse.json({ dispositivos: await listarDispositivos(clienteId!) })
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const nombre = String(b?.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })

  const r = await crearEnCatalogo(
    'dispositivos',
    clienteId!,
    nombre.slice(0, 80),
    typeof b.emoji === 'string' && b.emoji.trim() ? b.emoji.slice(0, 16) : null,
    null
  )
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  return NextResponse.json({ ok: true })
}

/**
 * Edita o da de baja un dispositivo. Dar de baja no lo saca de las recetas que
 * ya lo usan: solo deja de ofrecerse al cargar nuevas.
 */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const id = String(b?.id || '')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  const ok = await actualizarCatalogo('dispositivos', clienteId!, id, {
    ...(typeof b.nombre === 'string' && b.nombre.trim() ? { nombre: b.nombre.trim().slice(0, 80) } : {}),
    ...(typeof b.emoji === 'string' ? { emoji: b.emoji.slice(0, 16) || null } : {}),
    ...(typeof b.orden === 'number' ? { orden: Math.round(b.orden) } : {}),
    ...(typeof b.activo === 'boolean' ? { activo: b.activo } : {}),
  })
  if (!ok) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
