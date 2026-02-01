import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getAuthUser, requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Verificar autenticación
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    // Obtener proveedores del cliente
    const proveedores = await prisma.proveedores.findMany({
      where: {
        clienteId,
      },
      orderBy: {
        razonSocial: 'asc',
      },
      include: {
        _count: {
          select: {
            documentos: true,
          },
        },
      },
    })

    return NextResponse.json({
      proveedores: proveedores.map((p) => ({
        ...p,
        documentosCount: p._count.documentos,
      })),
    })
  } catch (error) {
    console.error('Error en GET /api/proveedores:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // Requiere permisos de administrador
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { razonSocial, cuit, letra, alias } = body

    // Validaciones
    if (!razonSocial || razonSocial.trim().length === 0) {
      return NextResponse.json(
        { error: 'La razón social es requerida' },
        { status: 400 }
      )
    }

    if (cuit && !/^\d{11}$/.test(cuit.replace(/-/g, ''))) {
      return NextResponse.json(
        { error: 'El CUIT debe tener 11 dígitos' },
        { status: 400 }
      )
    }

    // Verificar duplicados
    const existing = await prisma.proveedores.findFirst({
      where: {
        clienteId,
        OR: [
          cuit ? { cuit: cuit.replace(/-/g, '') } : {},
          { razonSocial: { equals: razonSocial.trim(), mode: 'insensitive' } },
        ],
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un proveedor con ese CUIT o razón social' },
        { status: 409 }
      )
    }

    // Crear proveedor
    const proveedor = await prisma.proveedores.create({
      data: {
        id: crypto.randomUUID(),
        clienteId,
        razonSocial: razonSocial.trim(),
        cuit: cuit ? cuit.replace(/-/g, '') : null,
        letra: letra || null,
        alias: alias || [],
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ proveedor }, { status: 201 })
  } catch (error) {
    console.error('Error en POST /api/proveedores:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
