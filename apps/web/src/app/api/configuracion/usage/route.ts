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
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    // Get current month's start
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Count documents this month
    const documentosCount = await prisma.documentos.count({
      where: {
        clienteId,
        createdAt: { gte: monthStart },
      },
    })

    // Count active users
    const usuariosCount = await prisma.usuarios.count({
      where: {
        clienteId,
        activo: true,
      },
    })

    // Get subscription limits (from suscripciones + planes)
    const suscripcion = await prisma.$queryRaw<
      { documentos_mes_limite: number | null; usuarios_limite: number | null; storage_mb_limite: number }[]
    >`
      SELECT p.documentos_mes_limite, p.usuarios_limite, p.storage_mb_limite
      FROM suscripciones s
      JOIN planes p ON s.plan_id = p.id
      WHERE s."clienteId" = ${clienteId}::uuid
      LIMIT 1
    `

    const limits = suscripcion[0] || {
      documentos_mes_limite: 50,
      usuarios_limite: 3,
      storage_mb_limite: 5000,
    }

    // Calculate storage (approximate based on document count)
    // In production, you would track actual storage usage
    const storageUsedMb = documentosCount * 0.5 // Assume 500KB per document average

    const usage = {
      documentos_mes: documentosCount,
      documentos_limite: limits.documentos_mes_limite,
      usuarios_activos: usuariosCount,
      usuarios_limite: limits.usuarios_limite,
      storage_usado_mb: storageUsedMb,
      storage_limite_mb: limits.storage_mb_limite,
    }

    return NextResponse.json({ usage })
  } catch (error) {
    console.error('Error fetching usage:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
