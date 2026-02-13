import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET - Listar todas las anotaciones del cliente
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    const anotaciones = await prisma.documento_anotaciones.findMany({
      where: {
        documentos: { clienteId },
      },
      include: {
        usuarios: {
          select: { nombre: true, email: true },
        },
        documentos: {
          select: {
            id: true,
            tipo: true,
            letra: true,
            numeroCompleto: true,
            fechaEmision: true,
            total: true,
            proveedores: {
              select: { razonSocial: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Contar total de anotaciones
    const total = await prisma.documento_anotaciones.count({
      where: { documentos: { clienteId } },
    })

    return NextResponse.json({
      anotaciones: anotaciones.map(a => ({
        id: a.id,
        texto: a.texto,
        createdAt: a.createdAt,
        usuario: a.usuarios.nombre || a.usuarios.email,
        documento: {
          id: a.documentos.id,
          tipo: a.documentos.tipo,
          letra: a.documentos.letra,
          numeroCompleto: a.documentos.numeroCompleto,
          fechaEmision: a.documentos.fechaEmision,
          total: a.documentos.total ? Number(a.documentos.total) : null,
          proveedor: a.documentos.proveedores?.razonSocial || null,
        },
      })),
      total,
    })
  } catch (error) {
    console.error('Error fetching anotaciones:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
