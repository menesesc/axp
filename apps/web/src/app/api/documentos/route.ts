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
    const limit = parseInt(searchParams.get('limit') || searchParams.get('pageSize') || '20')
    const skip = (page - 1) * limit
    const sortBy = searchParams.get('sortBy') || 'fechaEmision'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    // Filtros opcionales
    const estado = searchParams.get('estado')
    const proveedorId = searchParams.get('proveedorId')
    const busqueda = searchParams.get('q')
    const sinItems = searchParams.get('sinItems') === 'true'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const confidence = searchParams.get('confidence')

    const where: any = {
      clienteId,
    }

    if (estado) {
      where.estadoRevision = estado
    }

    if (proveedorId) {
      if (proveedorId === 'null') {
        where.proveedorId = null
      } else {
        where.proveedorId = proveedorId
      }
    }

    // Filtro de confianza OCR
    if (confidence && confidence !== 'all') {
      if (confidence === 'high') {
        where.confidenceScore = { gte: 90 }
      } else if (confidence === 'medium') {
        where.confidenceScore = { gte: 80, lt: 90 }
      } else if (confidence === 'low') {
        where.confidenceScore = { lt: 80 }
      }
    }

    if (busqueda) {
      where.OR = [
        { numeroCompleto: { contains: busqueda, mode: 'insensitive' } },
        { proveedores: { razonSocial: { contains: busqueda, mode: 'insensitive' } } },
      ]
    }

    // Filtro para documentos sin items
    if (sinItems) {
      where.documento_items = {
        none: {},
      }
    }

    // Filtro por fecha de emisión
    if (dateFrom || dateTo) {
      where.fechaEmision = {}
      if (dateFrom) {
        where.fechaEmision.gte = new Date(dateFrom)
      }
      if (dateTo) {
        // Add one day to include the entire day
        const endDate = new Date(dateTo)
        endDate.setHours(23, 59, 59, 999)
        where.fechaEmision.lte = endDate
      }
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
          pago_documentos: {
            select: {
              pagoId: true,
            },
            take: 1,
          },
          _count: {
            select: {
              documento_items: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      }),
      prisma.documentos.count({ where }),
    ])

    // Agregar pagoId al resultado (solo para documentos PAGADO)
    const documentosConPago = documentos.map((doc) => {
      const docAny = doc as typeof doc & { pago_documentos: { pagoId: string }[] }
      return {
        ...doc,
        pagoId: doc.estadoRevision === 'PAGADO' && docAny.pago_documentos?.[0]?.pagoId
          ? docAny.pago_documentos[0].pagoId
          : null,
        pago_documentos: undefined,
      }
    })

    return NextResponse.json({
      documentos: documentosConPago,
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
