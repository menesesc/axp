import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUnread,
      errors24h,
      warnings24h,
      success24h,
      last7dGrouped,
      recentErrors,
    ] = await Promise.all([
      // Total sin leer
      prisma.processing_logs.count({
        where: { cliente_id: clienteId, read: false },
      }),

      // Errores últimas 24h
      prisma.processing_logs.count({
        where: {
          cliente_id: clienteId,
          level: 'ERROR',
          created_at: { gte: last24h },
        },
      }),

      // Warnings últimas 24h
      prisma.processing_logs.count({
        where: {
          cliente_id: clienteId,
          level: 'WARNING',
          created_at: { gte: last24h },
        },
      }),

      // Exitosos últimas 24h
      prisma.processing_logs.count({
        where: {
          cliente_id: clienteId,
          level: 'SUCCESS',
          created_at: { gte: last24h },
        },
      }),

      // Agrupados por nivel últimos 7 días
      prisma.processing_logs.groupBy({
        by: ['level'],
        where: {
          cliente_id: clienteId,
          created_at: { gte: last7d },
        },
        _count: true,
      }),

      // Últimos errores
      prisma.processing_logs.findMany({
        where: {
          cliente_id: clienteId,
          level: 'ERROR',
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: {
          id: true,
          message: true,
          source: true,
          filename: true,
          created_at: true,
          read: true,
        },
      }),
    ])

    // Construir objeto de últimos 7 días
    const last7dStats: Record<string, number> = {
      INFO: 0,
      WARNING: 0,
      ERROR: 0,
      SUCCESS: 0,
    }
    for (const group of last7dGrouped) {
      last7dStats[group.level] = group._count
    }

    return NextResponse.json({
      totalUnread,
      last24h: {
        errors: errors24h,
        warnings: warnings24h,
        success: success24h,
      },
      last7d: last7dStats,
      recentErrors,
    })
  } catch (error) {
    console.error('Error fetching log stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
