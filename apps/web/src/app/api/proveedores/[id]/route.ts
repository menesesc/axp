import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { importesJson } from '@/lib/importes'
import { contactosDesde } from '@/lib/proveedores/contactos'
import { cbusDelCliente, guardarCbu, parseCbuInput } from '@/lib/proveedores/cbu'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateProveedorSchema = z.object({
  razonSocial: z.string().min(1).optional(),
  cuit: z.string().nullable().optional(),
  alias: z.array(z.string()).optional(),
  letra: z.enum(['A', 'B', 'C']).nullable().optional(),
  email: z.string().email().nullable().optional(),
  pedidos1Nombre: z.string().max(100).nullable().optional(),
  pedidos1Telefono: z.string().max(30).nullable().optional(),
  pedidos2Nombre: z.string().max(100).nullable().optional(),
  pedidos2Telefono: z.string().max(30).nullable().optional(),
  adminNombre: z.string().max(100).nullable().optional(),
  adminTelefono: z.string().max(30).nullable().optional(),
  diasEntrega: z.number().int().min(0).max(60).nullable().optional(),
  cbu: z.string().nullable().optional(),
  activo: z.boolean().optional(),
})

// GET: Obtener proveedor por ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, verImportes, error } = await requireSeccion(SECCION.DOC_PROVEEDORES)
  if (error) return error
  const json = importesJson(verImportes)
  if (!user?.clienteId) {
    return json({ error: 'Sin empresa asignada' }, { status: 403 })
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
    return json({ error: 'Proveedor no encontrado' }, { status: 404 })
  }

  const cbus = await cbusDelCliente(user.clienteId)

  return json({
    proveedor: {
      ...proveedor,
      cbu: cbus.get(proveedor.id) ?? null,
      documentosCount: proveedor._count.documentos,
    },
  })
}

// PATCH: Actualizar proveedor
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireSeccion(SECCION.DOC_PROVEEDORES, 'edit')
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const data = updateProveedorSchema.parse(body)
    const cbuIn = parseCbuInput(data.cbu)
    if (cbuIn.error) {
      return NextResponse.json({ error: cbuIn.error }, { status: 400 })
    }

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
        ...(data.email !== undefined && { email: data.email }),
        ...contactosDesde(data),
        ...(data.activo !== undefined && { activo: data.activo }),
        updatedAt: new Date(),
      },
      include: {
        _count: {
          select: { documentos: true },
        },
      },
    })

    if (cbuIn.cbu !== undefined) await guardarCbu(user.clienteId, id, cbuIn.cbu)
    const cbus = await cbusDelCliente(user.clienteId)

    return NextResponse.json({
      proveedor: {
        ...proveedor,
        cbu: cbus.get(id) ?? null,
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
  const { user, error } = await requireSeccion(SECCION.DOC_PROVEEDORES, 'edit')
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
