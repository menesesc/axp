import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const q = searchParams.get('q') || ''
    const proveedorId = searchParams.get('proveedorId') || ''
    const fechaDesde = searchParams.get('fechaDesde') || ''
    const fechaHasta = searchParams.get('fechaHasta') || ''

    // Build where clause for documento relation
    const documentosWhere: any = {
      clienteId,
    }

    // Filter by provider
    if (proveedorId) {
      documentosWhere.proveedorId = proveedorId
    }

    // Filter by date range
    if (fechaDesde || fechaHasta) {
      documentosWhere.fechaEmision = {}
      if (fechaDesde) {
        documentosWhere.fechaEmision.gte = new Date(fechaDesde)
      }
      if (fechaHasta) {
        documentosWhere.fechaEmision.lte = new Date(fechaHasta)
      }
    }

    // Build main where clause
    const where: any = {
      documentos: {
        is: documentosWhere,
      },
    }

    // Search by description (using contains for partial match)
    if (q) {
      where.descripcion = {
        contains: q,
        mode: 'insensitive',
      }
    }

    const [items, total] = await Promise.all([
      prisma.documento_items.findMany({
        where,
        include: {
          documentos: {
            select: {
              id: true,
              tipo: true,
              letra: true,
              numeroCompleto: true,
              fechaEmision: true,
              pdfFinalKey: true,
              pdfRawKey: true,
              proveedores: {
                select: {
                  id: true,
                  razonSocial: true,
                },
              },
            },
          },
        },
        orderBy: [
          { documentos: { fechaEmision: 'desc' } },
          { linea: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.documento_items.count({ where }),
    ])

    // Calculate totals
    const totalsResult = await prisma.documento_items.aggregate({
      where,
      _sum: {
        subtotal: true,
        cantidad: true,
      },
      _count: true,
    })

    return NextResponse.json({
      items: items.map(item => ({
        id: item.id,
        linea: item.linea,
        descripcion: item.descripcion,
        codigo: item.codigo,
        cantidad: item.cantidad ? Number(item.cantidad) : null,
        unidad: item.unidad,
        precioUnitario: item.precioUnitario ? Number(item.precioUnitario) : null,
        subtotal: item.subtotal ? Number(item.subtotal) : null,
        documento: {
          id: item.documentos.id,
          tipo: item.documentos.tipo,
          letra: item.documentos.letra,
          numeroCompleto: item.documentos.numeroCompleto,
          fechaEmision: item.documentos.fechaEmision,
          pdfKey: item.documentos.pdfFinalKey || item.documentos.pdfRawKey,
        },
        proveedor: item.documentos.proveedores,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      totals: {
        subtotal: Number(totalsResult._sum.subtotal) || 0,
        cantidad: Number(totalsResult._sum.cantidad) || 0,
        count: totalsResult._count,
      },
    })
  } catch (error: any) {
    console.error('Error fetching items:', error?.message || error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    )
  }
}
