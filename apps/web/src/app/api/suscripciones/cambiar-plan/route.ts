import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const { planId } = await request.json()
    if (!planId) {
      return NextResponse.json({ error: 'planId es requerido' }, { status: 400 })
    }

    // Verificar que el plan existe y está activo
    const plan = await prisma.$queryRaw<{ id: string; nombre: string }[]>`
      SELECT id::text, nombre FROM planes WHERE id = ${planId}::uuid AND activo = true LIMIT 1
    `
    if (!plan[0]) {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }

    // Actualizar la suscripción del cliente
    await prisma.$executeRaw`
      UPDATE suscripciones SET plan_id = ${planId}::uuid, "updatedAt" = NOW()
      WHERE "clienteId" = ${clienteId}::uuid
    `

    return NextResponse.json({ ok: true, plan_nombre: plan[0].nombre })
  } catch (error) {
    console.error('Error changing plan:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
