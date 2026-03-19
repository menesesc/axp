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
      return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const q = searchParams.get('q') || ''
    const formaPago = searchParams.get('formaPago') || ''
    const fechaDesde = searchParams.get('fechaDesde') || ''
    const fechaHasta = searchParams.get('fechaHasta') || ''

    const where: Record<string, unknown> = { clienteId }

    if (fechaDesde || fechaHasta) {
      where.fecha = {}
      if (fechaDesde) (where.fecha as Record<string, unknown>).gte = new Date(`${fechaDesde}T00:00:00`)
      if (fechaHasta) (where.fecha as Record<string, unknown>).lte = new Date(`${fechaHasta}T23:59:59`)
    }

    if (formaPago) where.formaPago = formaPago

    if (q) {
      where.OR = [
        { nroDocumento: { contains: q, mode: 'insensitive' } },
        { clienteNombre: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [total, ventas] = await Promise.all([
      prisma.ventas.count({ where }),
      prisma.ventas.findMany({
        where,
        include: { venta_items: { orderBy: { linea: 'asc' } } },
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return NextResponse.json({
      ventas,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('Error fetching ventas:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
