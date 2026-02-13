import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET - Obtener anotaciones de un documento
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const { id } = await params
    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    // Verificar que el documento pertenece al cliente
    const documento = await prisma.documentos.findFirst({
      where: { id, clienteId },
      select: { id: true },
    })

    if (!documento) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    const anotaciones = await prisma.documento_anotaciones.findMany({
      where: { documentoId: id },
      include: {
        usuarios: {
          select: { nombre: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      anotaciones: anotaciones.map(a => ({
        id: a.id,
        texto: a.texto,
        createdAt: a.createdAt,
        usuario: a.usuarios.nombre || a.usuarios.email,
      })),
    })
  } catch (error) {
    console.error('Error fetching anotaciones:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Crear anotación
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const { id } = await params
    const clienteId = user?.clienteId
    const usuarioId = user?.id

    if (!clienteId || !usuarioId) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })
    }

    // Verificar que el documento pertenece al cliente
    const documento = await prisma.documentos.findFirst({
      where: { id, clienteId },
      select: { id: true },
    })

    if (!documento) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const { texto } = body

    if (!texto || typeof texto !== 'string' || texto.trim().length === 0) {
      return NextResponse.json({ error: 'El texto es requerido' }, { status: 400 })
    }

    const anotacion = await prisma.documento_anotaciones.create({
      data: {
        documentoId: id,
        usuarioId,
        texto: texto.trim(),
      },
      include: {
        usuarios: {
          select: { nombre: true, email: true },
        },
      },
    })

    return NextResponse.json({
      anotacion: {
        id: anotacion.id,
        texto: anotacion.texto,
        createdAt: anotacion.createdAt,
        usuario: anotacion.usuarios.nombre || anotacion.usuarios.email,
      },
    })
  } catch (error) {
    console.error('Error creating anotacion:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Eliminar anotación
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const { id: documentoId } = await params
    const clienteId = user?.clienteId
    const usuarioId = user?.id

    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const anotacionId = searchParams.get('anotacionId')

    if (!anotacionId) {
      return NextResponse.json({ error: 'anotacionId requerido' }, { status: 400 })
    }

    // Verificar que la anotación existe y pertenece al documento del cliente
    const anotacion = await prisma.documento_anotaciones.findFirst({
      where: {
        id: anotacionId,
        documentoId,
        documentos: { clienteId },
      },
    })

    if (!anotacion) {
      return NextResponse.json({ error: 'Anotación no encontrada' }, { status: 404 })
    }

    // Solo el creador o admin puede eliminar
    if (anotacion.usuarioId !== usuarioId && user?.rol !== 'ADMIN' && user?.rol !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    await prisma.documento_anotaciones.delete({
      where: { id: anotacionId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting anotacion:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
