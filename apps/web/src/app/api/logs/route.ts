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
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const level = searchParams.get('level')
    const source = searchParams.get('source')

    const where: any = { cliente_id: clienteId }
    if (level && level !== 'all') where.level = level
    if (source && source !== 'all') where.source = source

    const [logs, total, unreadCount] = await Promise.all([
      prisma.processing_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.processing_logs.count({ where }),
      prisma.processing_logs.count({
        where: { cliente_id: clienteId, read: false },
      }),
    ])

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      unreadCount,
    })
  } catch (error) {
    console.error('Error fetching logs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json()
    const { logIds, markAllRead } = body

    if (markAllRead) {
      const result = await prisma.processing_logs.updateMany({
        where: { cliente_id: clienteId, read: false },
        data: { read: true },
      })
      return NextResponse.json({ updated: result.count })
    }

    if (logIds && Array.isArray(logIds) && logIds.length > 0) {
      const result = await prisma.processing_logs.updateMany({
        where: {
          id: { in: logIds },
          cliente_id: clienteId,
        },
        data: { read: true },
      })
      return NextResponse.json({ updated: result.count })
    }

    return NextResponse.json({ error: 'No logIds provided' }, { status: 400 })
  } catch (error) {
    console.error('Error updating logs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
