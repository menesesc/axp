import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { sanitizePermisos } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Edición de un usuario.
 *
 * Todo con SQL directo, sin el cliente Prisma. `usuarios` acumuló columnas
 * nuevas (`permisos`, `depositos`) y el cliente que corre en producción se
 * generó con un esquema anterior: cualquier lectura o escritura suya sobre
 * esta tabla puede romper según qué columnas conozca. Con SQL crudo el
 * resultado no depende de eso.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const [objetivo] = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM usuarios
       WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
       LIMIT 1
    `
    if (!objetivo) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const { activo, tipo_acceso, nombre } = body
    const esAdmin: boolean | null = tipo_acceso ? tipo_acceso === 'ADMIN' : null

    // Nadie puede sacarse a sí mismo el acceso de administrador: evita que el
    // último admin de la empresa se deje afuera de Configuración.
    if (objetivo.id === user?.id && esAdmin === false) {
      return NextResponse.json(
        { error: 'No podés quitarte a vos mismo el acceso de administrador' },
        { status: 400 }
      )
    }

    // Los admin no usan la matriz: tienen acceso total, así que al promover se limpia.
    let permisos: string[] | null = Array.isArray(body.permisos) ? sanitizePermisos(body.permisos) : null
    if (esAdmin === true) permisos = []

    const depositos: string[] | null = Array.isArray(body.depositos)
      ? body.depositos.filter((d: unknown) => typeof d === 'string')
      : null

    // Una sentencia por campo presente. Son pocas, van sobre la misma fila y
    // se leen de un vistazo; un UPDATE dinámico no se justifica.
    const ops = []
    if (typeof nombre === 'string' && nombre.trim()) {
      ops.push(prisma.$executeRaw`UPDATE usuarios SET nombre = ${nombre.trim()} WHERE id = ${id}::uuid`)
    }
    if (typeof activo === 'boolean') {
      ops.push(prisma.$executeRaw`UPDATE usuarios SET activo = ${activo} WHERE id = ${id}::uuid`)
    }
    if (esAdmin !== null) {
      const ta = esAdmin ? 'ADMIN' : 'VIEWER'
      const rol = esAdmin ? 'ADMIN' : 'USER'
      ops.push(prisma.$executeRaw`
        UPDATE usuarios SET tipo_acceso = ${ta}, rol = ${rol}::"RolUsuario" WHERE id = ${id}::uuid
      `)
    }
    if (permisos !== null) {
      ops.push(prisma.$executeRaw`UPDATE usuarios SET permisos = ${permisos}::text[] WHERE id = ${id}::uuid`)
    }
    if (depositos !== null) {
      ops.push(prisma.$executeRaw`UPDATE usuarios SET depositos = ${depositos}::uuid[] WHERE id = ${id}::uuid`)
    }
    ops.push(prisma.$executeRaw`UPDATE usuarios SET "updatedAt" = NOW() WHERE id = ${id}::uuid`)

    await prisma.$transaction(ops)

    const [actualizado] = await prisma.$queryRaw<
      Array<{
        id: string
        email: string
        nombre: string
        rol: string
        tipo_acceso: string | null
        permisos: string[] | null
        depositos: string[] | null
        activo: boolean
      }>
    >`
      SELECT id, email, nombre, rol::text AS rol, tipo_acceso, permisos, depositos, activo
        FROM usuarios WHERE id = ${id}::uuid
    `

    return NextResponse.json({ usuario: actualizado })
  } catch (error) {
    console.error('Error updating usuario:', error)
    // El detalle va al cliente a propósito: la ruta es solo para admin y sin el
    // mensaje real no hay forma de saber qué falló.
    const detalle = error instanceof Error ? error.message.split('\n').slice(0, 3).join(' ') : 'desconocido'
    return NextResponse.json({ error: `No se pudo actualizar: ${detalle}` }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const { id } = await params
    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const [objetivo] = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM usuarios WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid LIMIT 1
    `
    if (!objetivo) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    if (objetivo.id === user?.id) {
      return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 })
    }

    await prisma.$executeRaw`DELETE FROM usuarios WHERE id = ${id}::uuid`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting usuario:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
