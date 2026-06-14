import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { UNIDADES } from '@/lib/conciliacion/units'

export const dynamic = 'force-dynamic'

/** Edita un insumo. Solo admin. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const existing = await prisma.insumos.findFirst({ where: { id: params.id, clienteId } })
  if (!existing) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim()
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    data.nombre = nombre
  }
  if (body.unidadBase !== undefined) {
    if (!UNIDADES.includes(String(body.unidadBase) as never)) {
      return NextResponse.json({ error: `unidadBase debe ser una de: ${UNIDADES.join(', ')}` }, { status: 400 })
    }
    data.unidadBase = String(body.unidadBase)
  }
  if (body.categoria !== undefined) data.categoria = body.categoria ? String(body.categoria).trim() : null
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas).trim() : null
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  try {
    const insumo = await prisma.insumos.update({ where: { id: params.id }, data })
    return NextResponse.json({ insumo })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un insumo con ese nombre' }, { status: 409 })
    }
    throw e
  }
}

/** Borra un insumo (alias en cascade; recipe_items quedan con insumoId=null). Solo admin. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin()
  if (error) return error
  const clienteId = user!.clienteId
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const existing = await prisma.insumos.findFirst({ where: { id: params.id, clienteId } })
  if (!existing) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  await prisma.insumos.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
