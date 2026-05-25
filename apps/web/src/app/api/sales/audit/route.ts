import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sales/audit
 *
 * Lista eventos de auditoría con filtros y agregados.
 * Params: from, to, tipo (EMISION|DESCUENTO|ELIMINACION|ESPECIFICACION|OTRO),
 *         mozo, sucursal, summary=true|false.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const tipo = sp.get('tipo')
  const mozo = sp.get('mozo')
  const sucursal = sp.get('sucursal')
  const summary = sp.get('summary') === 'true'

  const dateFilter: Record<string, Date> = {}
  if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`)
  if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`)

  const closureWhere: Record<string, unknown> = { clienteId: clienteId! }
  if (Object.keys(dateFilter).length > 0) closureWhere.fecha = dateFilter
  if (sucursal) closureWhere.sucursal = sucursal

  const closures = await prisma.sales_closures.findMany({
    where: closureWhere,
    select: { id: true, fecha: true, turnoNombre: true, sucursal: true, nroCierre: true },
  })
  const closureIds = closures.map((c) => c.id)
  if (closureIds.length === 0) {
    return NextResponse.json({ events: [], totals: {}, byMozo: [], byProducto: [] })
  }

  const closureById = new Map(closures.map((c) => [c.id, c]))

  const where: Record<string, unknown> = { closureId: { in: closureIds } }
  if (tipo) where.tipo = tipo
  if (mozo) where.mozo = mozo

  if (summary) {
    // Agregados rápidos para dashboard
    const [byTipo, byMozoDescuento, byMozoEliminacion, topEliminados] = await Promise.all([
      prisma.sales_closure_audit_events.groupBy({
        by: ['tipo'],
        where: { closureId: { in: closureIds } },
        _count: true,
        _sum: { monto: true },
      }),
      prisma.sales_closure_audit_events.groupBy({
        by: ['mozo'],
        where: { closureId: { in: closureIds }, tipo: 'DESCUENTO' },
        _count: true,
        _sum: { monto: true },
        orderBy: { _sum: { monto: 'desc' } },
        take: 20,
      }),
      prisma.sales_closure_audit_events.groupBy({
        by: ['mozo'],
        where: { closureId: { in: closureIds }, tipo: 'ELIMINACION' },
        _count: true,
        orderBy: { _count: { mozo: 'desc' } },
        take: 20,
      }),
      prisma.sales_closure_audit_events.groupBy({
        by: ['productoNombre'],
        where: { closureId: { in: closureIds }, tipo: 'ELIMINACION', productoNombre: { not: null } },
        _count: true,
        orderBy: { _count: { productoNombre: 'desc' } },
        take: 20,
      }),
    ])

    const totals: Record<string, { count: number; totalMonto: number }> = {}
    for (const t of byTipo) {
      totals[t.tipo] = { count: t._count, totalMonto: Number(t._sum.monto ?? 0) }
    }

    return NextResponse.json({
      totals,
      descuentosPorMozo: byMozoDescuento.map((g) => ({
        mozo: g.mozo,
        count: g._count,
        totalMonto: Number(g._sum.monto ?? 0),
      })),
      eliminacionesPorMozo: byMozoEliminacion.map((g) => ({
        mozo: g.mozo,
        count: g._count,
      })),
      productosEliminados: topEliminados.map((g) => ({
        productoNombre: g.productoNombre,
        count: g._count,
      })),
    })
  }

  // Eventos detallados (paginados)
  const page = parseInt(sp.get('page') || '1')
  const pageSize = Math.min(parseInt(sp.get('pageSize') || '100'), 500)

  const [total, events] = await Promise.all([
    prisma.sales_closure_audit_events.count({ where }),
    prisma.sales_closure_audit_events.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const enriched = events.map((e) => {
    const c = closureById.get(e.closureId)
    return {
      ...e,
      monto: e.monto ? Number(e.monto) : null,
      porcentaje: e.porcentaje ? Number(e.porcentaje) : null,
      importeMesa: e.importeMesa ? Number(e.importeMesa) : null,
      fechaCierre: c?.fecha ?? null,
      turnoCierre: c?.turnoNombre ?? null,
      sucursalCierre: c?.sucursal ?? null,
      nroCierre: c?.nroCierre ?? null,
    }
  })

  return NextResponse.json({
    events: enriched,
    pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  })
}
