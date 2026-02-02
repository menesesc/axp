import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateProveedorSchema = z.object({
  razonSocial: z.string().min(1).optional(),
  cuit: z.string().nullable().optional(),
  alias: z.array(z.string()).optional(),
  letra: z.enum(['A', 'B', 'C']).nullable().optional(),
  activo: z.boolean().optional(),
})

// GET: Obtener proveedor por ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await getAuthUser()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const { id } = await params

  const proveedor = await prisma.proveedores.findFirst({
    where: {
      id,
      clienteId: user.clienteId,
    },
    include: {
      _count: {
        select: { documentos: true },
      },
    },
  })

  if (!proveedor) {
    return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
  }

  return NextResponse.json({
    proveedor: {
      ...proveedor,
      documentosCount: proveedor._count.documentos,
    },
  })
}

// PATCH: Actualizar proveedor
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const data = updateProveedorSchema.parse(body)

    // Verificar que el proveedor existe y pertenece al cliente
    const existing = await prisma.proveedores.findFirst({
      where: {
        id,
        clienteId: user.clienteId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    // Verificar CUIT duplicado
    if (data.cuit && data.cuit !== existing.cuit) {
      const existingByCuit = await prisma.proveedores.findFirst({
        where: {
          clienteId: user.clienteId,
          cuit: data.cuit,
          NOT: { id },
        },
      })

      if (existingByCuit) {
        return NextResponse.json(
          { error: `Ya existe un proveedor con CUIT ${data.cuit}` },
          { status: 409 }
        )
      }
    }

    // Verificar razón social duplicada
    if (data.razonSocial && data.razonSocial.toLowerCase() !== existing.razonSocial.toLowerCase()) {
      const existingByName = await prisma.proveedores.findFirst({
        where: {
          clienteId: user.clienteId,
          razonSocial: { equals: data.razonSocial, mode: 'insensitive' },
          NOT: { id },
        },
      })

      if (existingByName) {
        return NextResponse.json(
          { error: `Ya existe un proveedor con razón social "${data.razonSocial}"` },
          { status: 409 }
        )
      }
    }

    // Actualizar proveedor
    const proveedor = await prisma.proveedores.update({
      where: { id },
      data: {
        ...(data.razonSocial !== undefined && { razonSocial: data.razonSocial }),
        ...(data.cuit !== undefined && { cuit: data.cuit }),
        ...(data.alias !== undefined && { alias: data.alias }),
        ...(data.letra !== undefined && { letra: data.letra }),
        ...(data.activo !== undefined && { activo: data.activo }),
        updatedAt: new Date(),
      },
      include: {
        _count: {
          select: { documentos: true },
        },
      },
    })

    return NextResponse.json({
      proveedor: {
        ...proveedor,
        documentosCount: proveedor._count.documentos,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: err.errors },
        { status: 400 }
      )
    }
    console.error('Error updating proveedor:', err)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE: Eliminar o desactivar proveedor
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const { id } = await params

  const proveedor = await prisma.proveedores.findFirst({
    where: {
      id,
      clienteId: user.clienteId,
    },
    include: {
      _count: {
        select: { documentos: true },
      },
    },
  })

  if (!proveedor) {
    return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
  }

  // Si tiene documentos, solo desactivar
  if (proveedor._count.documentos > 0) {
    await prisma.proveedores.update({
      where: { id },
      data: {
        activo: false,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      message: 'Proveedor desactivado',
      softDelete: true,
    })
  }

  // Si no tiene documentos, eliminar
  await prisma.proveedores.delete({
    where: { id },
  })

  return NextResponse.json({
    message: 'Proveedor eliminado',
    softDelete: false,
  })
}
