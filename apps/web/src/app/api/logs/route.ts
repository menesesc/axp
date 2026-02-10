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

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const level = searchParams.get('level') // INFO, WARNING, ERROR, SUCCESS
    const source = searchParams.get('source') // OCR, PROCESSOR, WATCHER, SYSTEM
    const unreadOnly = searchParams.get('unread') === 'true'
    const skip = (page - 1) * limit

    const where: any = {
      cliente_id: clienteId,
    }

    if (level) {
      where.level = level
    }

    if (source) {
      where.source = source
    }

    if (unreadOnly) {
      where.read = false
    }

    const [logs, total, unreadCount] = await Promise.all([
      prisma.processing_logs.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.processing_logs.count({ where }),
      prisma.processing_logs.count({
        where: {
          cliente_id: clienteId,
          read: false,
        },
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

// Marcar logs como leídos
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
      // Marcar todos como leídos
      await prisma.processing_logs.updateMany({
        where: {
          cliente_id: clienteId,
          read: false,
        },
        data: {
          read: true,
        },
      })
    } else if (logIds && Array.isArray(logIds)) {
      // Marcar específicos como leídos
      await prisma.processing_logs.updateMany({
        where: {
          id: { in: logIds },
          cliente_id: clienteId,
        },
        data: {
          read: true,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating logs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Endpoint para que el worker escriba logs (usa service key)
export async function POST(request: NextRequest) {
  try {
    // Verificar service key para el worker
    const authHeader = request.headers.get('authorization')
    const serviceKey = process.env.WORKER_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
      // Fallback: verificar si es un usuario autenticado admin
      const { user, error } = await getAuthUser()
      if (error) return error
      if (user?.rol !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    const body = await request.json()
    const { clienteId, level, source, message, details, documentoId, filename } = body

    if (!clienteId || !level || !source || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: clienteId, level, source, message' },
        { status: 400 }
      )
    }

    const log = await prisma.processing_logs.create({
      data: {
        cliente_id: clienteId,
        level,
        source,
        message,
        details: details || {},
        documento_id: documentoId || null,
        filename: filename || null,
      },
    })

    return NextResponse.json({ success: true, logId: log.id })
  } catch (error) {
    console.error('Error creating log:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
