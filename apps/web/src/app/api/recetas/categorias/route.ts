import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { actualizarCatalogo, crearEnCatalogo, listarCategorias } from '@/lib/recetas/db'

export const dynamic = 'force-dynamic'

/** Categorías del recetario, con cuántas recetas tiene cada una. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO)
  if (error) return error
  return NextResponse.json({ categorias: await listarCategorias(clienteId!) })
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const nombre = String(b?.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })

  const r = await crearEnCatalogo(
    'receta_categorias',
    clienteId!,
    nombre.slice(0, 80),
    typeof b.emoji === 'string' && b.emoji.trim() ? b.emoji.slice(0, 16) : null,
    typeof b.color === 'string' && b.color.trim() ? b.color.slice(0, 9) : null
  )
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  return NextResponse.json({ ok: true })
}

/**
 * Edita o da de baja una categoría.
 *
 * Dar de baja no borra: las recetas quedarían sin clasificar y esa pérdida no
 * se ve hasta mucho después. Se desactiva y deja de ofrecerse.
 */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.RECETAS_LIBRO, 'edit')
  if (error) return error
  const b = await request.json().catch(() => null)
  const id = String(b?.id || '')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  const ok = await actualizarCatalogo('receta_categorias', clienteId!, id, {
    ...(typeof b.nombre === 'string' && b.nombre.trim() ? { nombre: b.nombre.trim().slice(0, 80) } : {}),
    ...(typeof b.emoji === 'string' ? { emoji: b.emoji.slice(0, 16) || null } : {}),
    ...(typeof b.color === 'string' ? { color: b.color.slice(0, 9) || null } : {}),
    ...(typeof b.orden === 'number' ? { orden: Math.round(b.orden) } : {}),
    ...(typeof b.activo === 'boolean' ? { activo: b.activo } : {}),
  })
  if (!ok) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
