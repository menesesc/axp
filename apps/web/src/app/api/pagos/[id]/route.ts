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
      numero: pago.numero,
      fecha: pago.fecha,
      estado: pago.estado,
      montoTotal: Number(pago.montoTotal),
      nota: pago.nota,
      proveedor: pago.proveedores,
      metodos: pago.pago_metodos.map((m) => {
        const meta = (m.meta || {}) as Record<string, unknown>
        return {
          id: m.id,
          tipo: m.tipo,
          monto: Number(m.monto),
          fecha: meta.fecha || pago.fecha,
          referencia: meta.referencia || null,
          attachments: meta.attachments || [],
        }
      }),
      documentos: pago.pago_documentos.map((pd) => ({
        ...pd.documentos,
        total: pd.documentos.total ? Number(pd.documentos.total) : null,
        confidenceScore: pd.documentos.confidenceScore ? Number(pd.documentos.confidenceScore) : null,
        montoAplicado: Number(pd.montoAplicado),
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

    // Actualizar el pago usando SQL directo para evitar problemas de tipos con el enum
    if (data.estado) {
      await prisma.$executeRaw`UPDATE pagos SET estado = ${data.estado}::"EstadoPago", "updatedAt" = NOW() WHERE id = ${id}::uuid`

      // Si se emite la orden (estado = EMITIDA), marcar los documentos como PAGADO
      if (data.estado === 'EMITIDA') {
        await prisma.$executeRaw`
          UPDATE documentos
          SET "estadoRevision" = 'PAGADO'::"EstadoRevision", "updatedAt" = NOW()
          WHERE id IN (
            SELECT "documentoId" FROM pago_documentos WHERE "pagoId" = ${id}::uuid
          )
        `
      }
    }

    if (data.nota !== undefined) {
      await prisma.$executeRaw`UPDATE pagos SET nota = ${data.nota}, "updatedAt" = NOW() WHERE id = ${id}::uuid`
    }

    // Obtener el pago actualizado
    const pagoActualizado = await prisma.pagos.findUnique({
      where: { id },
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
