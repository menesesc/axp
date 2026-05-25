import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const page = parseInt(sp.get('page') || '1')
  const pageSize = Math.min(parseInt(sp.get('pageSize') || '50'), 200)
  const from = sp.get('from') || ''
  const to = sp.get('to') || ''
  const turno = sp.get('turno') || ''
  const sucursal = sp.get('sucursal') || ''
  const q = sp.get('q') || ''

  const where: Record<string, unknown> = { clienteId: clienteId! }

  if (from || to) {
    where.fecha = {}
    if (from) (where.fecha as Record<string, unknown>).gte = new Date(`${from}T00:00:00Z`)
    if (to) (where.fecha as Record<string, unknown>).lte = new Date(`${to}T23:59:59Z`)
  }
  if (turno && ['ALMUERZO', 'CENA', 'OTRO'].includes(turno)) {
    where.turnoNombre = turno
  }
  if (sucursal) where.sucursal = sucursal
  if (q) {
    where.OR = [
      { sucursal: { contains: q, mode: 'insensitive' } },
      { empresaNombre: { contains: q, mode: 'insensitive' } },
    ]
  }

  const [total, closures, sucursales] = await Promise.all([
    prisma.sales_closures.count({ where }),
    prisma.sales_closures.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { turnoNumero: 'asc' }, { nroCierre: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fecha: true,
        nroCierre: true,
        turnoNombre: true,
        turnoNumero: true,
        sucursal: true,
        totalVentas: true,
        cantTickets: true,
        cantCubiertos: true,
        promedioCubierto: true,
        netoGravado: true,
        ivaTotal: true,
        efectivo: true,
        ctaCte: true,
        tarjetas: true,
        descuentoTotal: true,
        usuarioApertura: true,
        usuarioCierre: true,
        horaApertura: true,
        horaCierre: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.sales_closures.findMany({
      where: { clienteId: clienteId! },
      distinct: ['sucursal'],
      select: { sucursal: true },
    }),
  ])

  return NextResponse.json({
    closures,
    pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    facets: {
      sucursales: sucursales
        .map((s) => s.sucursal)
        .filter((s): s is string => Boolean(s))
        .sort(),
    },
  })
}
