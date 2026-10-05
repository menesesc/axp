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

    // logoKey va por SQL crudo: el cliente Prisma de producción no se
    // regenera en el build y no conoce las columnas nuevas.
    const [logo] = await prisma.$queryRaw<Array<{ logoKey: string | null }>>`
      SELECT "logoKey" FROM clientes WHERE id = ${clienteId}::uuid
    `

    return NextResponse.json({ empresa: { ...empresa, logoKey: logo?.logoKey ?? null } })
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
    const { razonSocial, cuit, logoKey } = body
    // Idem: logoKey se escribe aparte con SQL crudo, más abajo.

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

    // Logo del encabezado del recetario. Por SQL crudo, como la lectura.
    if (typeof logoKey === 'string') {
      await prisma.$executeRaw`
        UPDATE clientes SET "logoKey" = ${logoKey.trim() || null} WHERE id = ${clienteId}::uuid
      `
    }

    return NextResponse.json({ empresa: { ...empresa, logoKey: typeof logoKey === 'string' ? logoKey.trim() || null : undefined } })
  } catch (error) {
    console.error('Error updating empresa:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
