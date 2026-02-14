import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const paymentAttachmentSchema = z.object({
  key: z.string(),
  filename: z.string(),
})

const updatePagoSchema = z.object({
  estado: z.enum(['BORRADOR', 'EMITIDA', 'PAGADO']).optional(),
  nota: z.string().optional().nullable(),
  proveedorId: z.string().uuid().optional(),
  fecha: z.string().transform((s) => new Date(s)).optional(),
  emitir: z.boolean().optional(),
  documentos: z.array(z.object({
    documentoId: z.string().uuid(),
    montoAplicado: z.number(),
  })).optional(),
  metodos: z.array(z.object({
    tipo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'ECHEQ']),
    monto: z.number(),
    fecha: z.string().optional(),
    referencia: z.string().optional(),
    attachments: z.array(paymentAttachmentSchema).optional(),
  })).optional(),
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
      include: {
        pago_documentos: true,
        pago_metodos: true,
      },
    })

    if (!pagoExistente) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
    }

    // Edicion completa solo permitida en BORRADOR
    const isFullEdit = data.documentos !== undefined || data.metodos !== undefined || data.proveedorId !== undefined || data.fecha !== undefined
    if (isFullEdit && pagoExistente.estado !== 'BORRADOR') {
      return NextResponse.json(
        { error: 'Solo se pueden editar órdenes en borrador' },
        { status: 400 }
      )
    }

    // Determinar si se quiere emitir
    const wantEmit = data.estado === 'EMITIDA' || data.emitir === true

    // Si se emite, validar completitud
    const finalMetodos = data.metodos ?? []
    const existingDocCount = pagoExistente.pago_documentos.length

    if (wantEmit) {
      const docsToCheck = data.documentos ?? (existingDocCount > 0 ? undefined : [])
      if (docsToCheck !== undefined && docsToCheck.length === 0) {
        return NextResponse.json(
          { error: 'Debe incluir documentos para emitir la orden' },
          { status: 400 }
        )
      }
      if (data.metodos !== undefined && data.metodos.length === 0) {
        return NextResponse.json(
          { error: 'Debe incluir formas de pago para emitir la orden' },
          { status: 400 }
        )
      }
      if (data.documentos && data.metodos) {
        const totalDocs = data.documentos.reduce((s, d) => s + d.montoAplicado, 0)
        const totalMets = data.metodos.reduce((s, m) => s + m.monto, 0)
        if (Math.abs(totalDocs - totalMets) > 0.01) {
          return NextResponse.json(
            { error: 'El total de métodos de pago no coincide con el total de documentos' },
            { status: 400 }
          )
        }
      }
      // Validar fechas de cheques
      for (const m of finalMetodos) {
        if ((m.tipo === 'CHEQUE' || m.tipo === 'ECHEQ') && !m.fecha) {
          return NextResponse.json(
            { error: 'Los cheques y eCheqs requieren fecha de pago' },
            { status: 400 }
          )
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      // Actualizar datos basicos del pago
      const proveedorId = data.proveedorId || pagoExistente.proveedorId
      const fecha = data.fecha || pagoExistente.fecha
      const nota = data.nota !== undefined ? data.nota : pagoExistente.nota
      const montoTotal = data.documentos
        ? data.documentos.reduce((s, d) => s + d.montoAplicado, 0)
        : Number(pagoExistente.montoTotal)
      const nuevoEstado = wantEmit ? 'EMITIDA' : (data.estado || pagoExistente.estado)

      await tx.$executeRaw`
        UPDATE pagos SET
          "proveedorId" = ${proveedorId}::uuid,
          fecha = ${fecha},
          nota = ${nota},
          "montoTotal" = ${montoTotal},
          estado = ${nuevoEstado}::"EstadoPago",
          "updatedAt" = NOW()
        WHERE id = ${id}::uuid
      `

      // Reemplazar documentos si se proporcionan
      if (data.documentos !== undefined) {
        await tx.pago_documentos.deleteMany({ where: { pagoId: id } })
        for (const doc of data.documentos) {
          await tx.pago_documentos.create({
            data: {
              pagoId: id,
              documentoId: doc.documentoId,
              montoAplicado: doc.montoAplicado,
            },
          })
        }
      }

      // Reemplazar metodos si se proporcionan
      if (data.metodos !== undefined) {
        await tx.pago_metodos.deleteMany({ where: { pagoId: id } })
        for (const m of data.metodos) {
          const meta: { fecha?: string; referencia?: string; attachments?: { key: string; filename: string }[] } = {}
          if (m.fecha) meta.fecha = m.fecha
          if (m.referencia) meta.referencia = m.referencia
          if (m.attachments && m.attachments.length > 0) meta.attachments = m.attachments

          await tx.pago_metodos.create({
            data: {
              id: crypto.randomUUID(),
              pagoId: id,
              tipo: m.tipo as 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE',
              monto: m.monto,
              meta: meta as object,
            },
          })
        }
      }

      // Si se emite, marcar documentos como PAGADO
      if (wantEmit) {
        await tx.$executeRaw`
          UPDATE documentos
          SET "estadoRevision" = 'PAGADO'::"EstadoRevision", "updatedAt" = NOW()
          WHERE id IN (
            SELECT "documentoId" FROM pago_documentos WHERE "pagoId" = ${id}::uuid
          )
        `
      }
    })

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
