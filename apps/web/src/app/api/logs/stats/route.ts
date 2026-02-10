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

    const today = new Date()
    const last24h = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUnread,
      errorsLast24h,
      warningsLast24h,
      successLast24h,
      countByLevel,
      recentErrors,
    ] = await Promise.all([
      // Total no leídos
      prisma.processing_logs.count({
        where: {
          cliente_id: clienteId,
          read: false,
        },
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

      // Success últimas 24h
      prisma.processing_logs.count({
        where: {
          cliente_id: clienteId,
          level: 'SUCCESS',
          created_at: { gte: last24h },
        },
      }),

      // Conteo por nivel (últimos 7 días)
      prisma.processing_logs.groupBy({
        where: {
          cliente_id: clienteId,
          created_at: { gte: last7d },
        },
        by: ['level'],
        _count: { _all: true },
      }),

      // Últimos 5 errores
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

    const levelCounts = {
      INFO: 0,
      WARNING: 0,
      ERROR: 0,
      SUCCESS: 0,
    }

    for (const row of countByLevel) {
      levelCounts[row.level as keyof typeof levelCounts] = row._count._all
    }

    return NextResponse.json({
      totalUnread,
      last24h: {
        errors: errorsLast24h,
        warnings: warningsLast24h,
        success: successLast24h,
      },
      last7d: levelCounts,
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
