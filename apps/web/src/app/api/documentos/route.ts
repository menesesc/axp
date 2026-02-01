import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Verificar autenticación
    const { user, error } = await getAuthUser()
    if (error) return error

    const { searchParams } = new URL(request.url)

    // Usar clienteId del usuario autenticado (no del query param)
    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    // Obtener documentos con paginación
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // Filtros opcionales
    const estado = searchParams.get('estado')
    const proveedorId = searchParams.get('proveedorId')
    const busqueda = searchParams.get('q')

    const where: any = {
      clienteId,
    }

    if (estado) {
      where.estadoRevision = estado
    }

    if (proveedorId) {
      where.proveedorId = proveedorId
    }

    if (busqueda) {
      where.OR = [
        { numeroCompleto: { contains: busqueda, mode: 'insensitive' } },
        { proveedores: { razonSocial: { contains: busqueda, mode: 'insensitive' } } },
      ]
    }

    // Consultar documentos
    const [documentos, total] = await Promise.all([
      prisma.documentos.findMany({
        where,
        include: {
          proveedores: {
            select: {
              id: true,
              razonSocial: true,
              cuit: true,
            },
          },
        },
        orderBy: {
          fechaEmision: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.documentos.count({ where }),
    ])

    return NextResponse.json({
      documentos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error en /api/documentos:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
