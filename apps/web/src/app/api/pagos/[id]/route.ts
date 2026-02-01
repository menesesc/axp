import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updatePagoSchema = z.object({
  estado: z.enum(['BORRADOR', 'EMITIDA', 'PAGADO']).optional(),
  nota: z.string().optional().nullable(),
})

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

  const pago = await prisma.pagos.findFirst({
    where: {
      id,
      clienteId: user.clienteId,
    },
    include: {
      proveedores: {
        select: {
          id: true,
          razonSocial: true,
          cuit: true,
        },
      },
      pago_metodos: true,
      pago_documentos: {
        include: {
          documentos: {
            select: {
              id: true,
              tipo: true,
              letra: true,
              numeroCompleto: true,
              fechaEmision: true,
              total: true,
              confidenceScore: true,
              estadoRevision: true,
            },
          },
        },
      },
    },
  })

  if (!pago) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }

  return NextResponse.json({
    pago: {
      id: pago.id,
      fecha: pago.fecha,
      estado: pago.estado,
      montoTotal: pago.montoTotal,
      nota: pago.nota,
      proveedor: pago.proveedores,
      metodos: pago.pago_metodos,
      documentos: pago.pago_documentos.map((pd) => ({
        ...pd.documentos,
        montoAplicado: pd.montoAplicado,
      })),
    },
  })
}

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
    const data = updatePagoSchema.parse(body)

    // Verificar que el pago existe y pertenece al cliente
    const pagoExistente = await prisma.pagos.findFirst({
      where: {
        id,
        clienteId: user.clienteId,
      },
    })

    if (!pagoExistente) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
    }

    // Actualizar el pago - usar el estado existente si no se proporciona uno nuevo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {
      updatedAt: new Date(),
    }

    if (data.estado) {
      // Mapear EMITIDA a un estado válido si no existe en el enum de Prisma
      updateData.estado = data.estado === 'EMITIDA' ? 'BORRADOR' : data.estado
    }

    if (data.nota !== undefined) {
      updateData.nota = data.nota
    }

    const pagoActualizado = await prisma.pagos.update({
      where: { id },
      data: updateData,
      include: {
        proveedores: {
          select: {
            id: true,
            razonSocial: true,
          },
        },
        pago_metodos: true,
      },
    })

    return NextResponse.json({ pago: pagoActualizado })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: err.errors },
        { status: 400 }
      )
    }
    console.error('Error updating pago:', err)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

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

  const pago = await prisma.pagos.findFirst({
    where: {
      id,
      clienteId: user.clienteId,
    },
  })

  if (!pago) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  }

  // Solo se pueden eliminar pagos en borrador
  if (pago.estado !== 'BORRADOR') {
    return NextResponse.json(
      { error: 'Solo se pueden eliminar órdenes en borrador' },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    // Eliminar métodos de pago
    await tx.pago_metodos.deleteMany({
      where: { pagoId: id },
    })

    // Eliminar documentos asociados
    await tx.pago_documentos.deleteMany({
      where: { pagoId: id },
    })

    // Eliminar el pago
    await tx.pagos.delete({
      where: { id },
    })
  })

  return NextResponse.json({ success: true })
}
