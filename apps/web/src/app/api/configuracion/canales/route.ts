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

    const cliente = await prisma.clientes.findUnique({
      where: { id: clienteId },
      select: {
        r2Prefix: true,
        cuit: true,
      },
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    // Return channel configuration
    // In a real implementation, this would be stored in the database
    const canales = {
      email: {
        habilitado: true,
        direccion: `facturas@axp.com.ar`,
        alias: [],
      },
      whatsapp: {
        habilitado: false,
        numero: null,
        webhook_url: null,
      },
      sftp: {
        habilitado: true,
        ruta: `/${cliente.r2Prefix}/incoming`,
      },
    }

    return NextResponse.json({ canales })
  } catch (error) {
    console.error('Error fetching canales:', error)
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

    // In a real implementation, you would update the channel configuration in the database
    // For now, we'll just acknowledge the update
    console.log('Channel config update:', body)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating canales:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
