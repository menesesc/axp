import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const empresa = await prisma.clientes.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        razonSocial: true,
        cuit: true,
        r2Prefix: true,
        activo: true,
      },
    })

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ empresa })
  } catch (error) {
    console.error('Error fetching empresa:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const body = await request.json()
    const { razonSocial, cuit } = body

    const updates: any = {}
    if (razonSocial) updates.razonSocial = razonSocial
    if (cuit) updates.cuit = cuit
    updates.updatedAt = new Date()

    const empresa = await prisma.clientes.update({
      where: { id: clienteId },
      data: updates,
      select: {
        id: true,
        razonSocial: true,
        cuit: true,
        r2Prefix: true,
        activo: true,
      },
    })

    return NextResponse.json({ empresa })
  } catch (error) {
    console.error('Error updating empresa:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
