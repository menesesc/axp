import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { actualizarVajilla, crearVajilla, listarVajillas } from '@/lib/recetas/db'

export const dynamic = 'force-dynamic'

/** La vajilla de la casa, con cuántas recetas se presentan en cada pieza. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  return NextResponse.json({ vajillas: await listarVajillas(clienteId!) })
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const nombre = String(b?.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })

  const r = await crearVajilla(
    clienteId!,
    nombre.slice(0, 80),
    typeof b.descripcion === 'string' && b.descripcion.trim() ? b.descripcion.trim().slice(0, 300) : null,
    typeof b.emoji === 'string' && b.emoji.trim() ? b.emoji.slice(0, 16) : null
  )
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const id = String(b?.id || '')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  const ok = await actualizarVajilla(clienteId!, id, {
    ...(typeof b.nombre === 'string' && b.nombre.trim() ? { nombre: b.nombre.trim().slice(0, 80) } : {}),
    ...(typeof b.descripcion === 'string' ? { descripcion: b.descripcion.trim().slice(0, 300) || null } : {}),
    ...(typeof b.emoji === 'string' ? { emoji: b.emoji.slice(0, 16) || null } : {}),
    ...(typeof b.orden === 'number' ? { orden: Math.round(b.orden) } : {}),
    ...(typeof b.activo === 'boolean' ? { activo: b.activo } : {}),
  })
  if (!ok) return NextResponse.json({ error: 'Vajilla no encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
