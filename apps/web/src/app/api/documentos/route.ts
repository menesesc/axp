import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get('clienteId')
    
    if (!clienteId) {
      return NextResponse.json(
        { error: 'clienteId is required' },
        { status: 400 }
      )
    }

    // Obtener documentos con paginación
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // Filtros opcionales
    const estado = searchParams.get('estado')
    const proveedorId = searchParams.get('proveedorId')

    const where: any = {
      clienteId,
    }

    if (estado) {
      where.estadoRevision = estado
    }

    if (proveedorId) {
      where.proveedorId = proveedorId
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
    console.error('Error en /api/documentos:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
