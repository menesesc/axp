import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { sanitizePermisos } from '@/lib/permisos'

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
    const { activo, tipo_acceso, nombre } = body

    const updates: any = { updatedAt: new Date() }
    if (typeof activo === 'boolean') updates.activo = activo
    if (typeof nombre === 'string' && nombre.trim()) updates.nombre = nombre.trim()

    // Depósitos habilitados para contar stock. Vacío = todos. Va por SQL
    // directo, como `permisos`: es una columna nueva y el cliente Prisma de
    // producción no se regenera en el build.
    const depositos: string[] | null = Array.isArray(body.depositos)
      ? body.depositos.filter((d: unknown) => typeof d === 'string')
      : null

    // Matriz de permisos por módulo. Los admin no la usan: tienen acceso total,
    // así que al promover a admin se limpia.
    let permisos: string[] | null = null
    if (Array.isArray(body.permisos)) permisos = sanitizePermisos(body.permisos)

    if (tipo_acceso) {
      const esAdmin = tipo_acceso === 'ADMIN'
      updates.tipo_acceso = esAdmin ? 'ADMIN' : 'VIEWER'
      updates.rol = esAdmin ? 'ADMIN' : 'USER'
      if (esAdmin) permisos = []
    }

    // Nadie puede sacarse a sí mismo el acceso de administrador: evita que el
    // último admin de la empresa se deje afuera de Configuración.
    if (targetUser.id === user?.id && updates.rol === 'USER') {
      return NextResponse.json(
        { error: 'No podés quitarte a vos mismo el acceso de administrador' },
        { status: 400 }
      )
    }

    const updated = await prisma.usuarios.update({
      where: { id },
      data: updates,
    })

    // permisos y depositos vía SQL directo: no dependen de regenerar el
    // cliente Prisma.
    if (permisos !== null) {
      await prisma.$executeRaw`
        UPDATE usuarios SET permisos = ${permisos}::text[], "updatedAt" = NOW() WHERE id = ${id}::uuid
      `
    }
    if (depositos !== null) {
      await prisma.$executeRaw`
        UPDATE usuarios SET depositos = ${depositos}::uuid[], "updatedAt" = NOW() WHERE id = ${id}::uuid
      `
    }

    return NextResponse.json({
      usuario: { ...updated, permisos: permisos ?? undefined, depositos: depositos ?? undefined },
    })
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
