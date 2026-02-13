import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    // Verify the user belongs to the same company
    const targetUser = await prisma.usuarios.findFirst({
      where: { id, clienteId },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const { activo, tipo_acceso } = body

    const updates: any = { updatedAt: new Date() }
    if (typeof activo === 'boolean') updates.activo = activo
    if (tipo_acceso) {
      updates.tipo_acceso = tipo_acceso
      updates.rol = tipo_acceso === 'ADMIN' ? 'ADMIN' : 'USER'
    }

    const updated = await prisma.usuarios.update({
      where: { id },
      data: updates,
    })

    return NextResponse.json({ usuario: updated })
  } catch (error) {
    console.error('Error updating usuario:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    // Verify the user belongs to the same company
    const targetUser = await prisma.usuarios.findFirst({
      where: { id, clienteId },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Don't allow deleting yourself
    if (targetUser.id === user?.id) {
      return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 })
    }

    await prisma.usuarios.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting usuario:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
