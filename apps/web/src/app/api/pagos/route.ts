import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const paymentAttachmentSchema = z.object({
  key: z.string(),
  filename: z.string(),
})

const createPagoSchema = z.object({
  proveedorId: z.string().uuid(),
  fecha: z.string().transform((s) => new Date(s)),
  nota: z.string().optional().nullable(),
  emitir: z.boolean().optional().default(false),
  documentos: z.array(z.object({
    documentoId: z.string().uuid(),
    montoAplicado: z.number(),
  })).optional().default([]),
  metodos: z.array(z.object({
    tipo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'ECHEQ']),
    monto: z.number(),
    fecha: z.string().optional(),
    referencia: z.string().optional(),
    attachments: z.array(paymentAttachmentSchema).optional(),
  })).optional().default([]),
})

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '25')
  const estado = searchParams.get('estado')
  const proveedorId = searchParams.get('proveedorId')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    clienteId: user.clienteId,
  }

  if (estado) {
    where.estado = estado
  }

  if (proveedorId) {
    where.proveedorId = proveedorId
  }

  const [pagos, total] = await Promise.all([
    prisma.pagos.findMany({
      where,
      include: {
        proveedores: {
          select: {
            id: true,
            razonSocial: true,
          },
        },
        pago_metodos: true,
        _count: {
          select: {
            pago_documentos: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pagos.count({ where }),
  ])

  return NextResponse.json({
    pagos: pagos.map((p) => ({
      id: p.id,
      numero: p.numero,
      fecha: p.fecha,
      estado: p.estado,
      montoTotal: p.montoTotal,
      nota: p.nota,
      proveedor: p.proveedores,
      metodos: p.pago_metodos,
      documentosCount: p._count.pago_documentos,
    })),
    pagination: {
      page,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
    },
  })
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const data = createPagoSchema.parse(body)

    // Verificar que el proveedor pertenece al cliente
    const proveedor = await prisma.proveedores.findFirst({
      where: {
        id: data.proveedorId,
        clienteId: user.clienteId,
      },
    })

    if (!proveedor) {
      return NextResponse.json(
        { error: 'Proveedor no encontrado' },
        { status: 404 }
      )
    }

    // Verificar documentos si se incluyen
    if (data.documentos.length > 0) {
      const documentoIds = data.documentos.map((d) => d.documentoId)
      const documentos = await prisma.documentos.findMany({
        where: {
          id: { in: documentoIds },
          clienteId: user.clienteId,
          proveedorId: data.proveedorId,
        },
      })

      if (documentos.length !== documentoIds.length) {
        return NextResponse.json(
          { error: 'Algunos documentos no son válidos' },
          { status: 400 }
        )
      }
    }

    // Calcular montos
    const montoDocumentos = data.documentos.reduce((sum, d) => sum + d.montoAplicado, 0)
    const totalMetodos = data.metodos.reduce((sum, m) => sum + m.monto, 0)
    const montoTotal = montoDocumentos || totalMetodos || 0

    // Validaciones estrictas solo al emitir
    if (data.emitir) {
      if (data.documentos.length === 0) {
        return NextResponse.json(
          { error: 'Debe incluir documentos para emitir la orden' },
          { status: 400 }
        )
      }
      if (data.metodos.length === 0) {
        return NextResponse.json(
          { error: 'Debe incluir formas de pago para emitir la orden' },
          { status: 400 }
        )
      }
      if (Math.abs(montoDocumentos - totalMetodos) > 0.01) {
        return NextResponse.json(
          { error: 'El total de métodos de pago no coincide con el total de documentos' },
          { status: 400 }
        )
      }
      // Validar fechas de cheque/eCheq
      for (const m of data.metodos) {
        if ((m.tipo === 'CHEQUE' || m.tipo === 'ECHEQ') && !m.fecha) {
          return NextResponse.json(
            { error: 'Los cheques y eCheqs requieren fecha de pago' },
            { status: 400 }
          )
        }
        if (m.fecha) {
          const fechaPago = new Date(m.fecha)
          const maxDate = new Date(data.fecha)
          maxDate.setFullYear(maxDate.getFullYear() + 1)
          if (fechaPago > maxDate) {
            return NextResponse.json(
              { error: 'La fecha de pago no puede exceder 365 días desde la fecha de la orden' },
              { status: 400 }
            )
          }
        }
      }
    }

    // Crear la orden de pago con transacción
    const pagoId = crypto.randomUUID()
    const estadoInicial = data.emitir ? 'EMITIDA' : 'BORRADOR'

    const pago = await prisma.$transaction(async (tx) => {
      // Obtener próximo número correlativo para este cliente
      const lastPago = await tx.$queryRaw<Array<{ max_numero: number | null }>>`
        SELECT MAX(numero) as max_numero FROM pagos WHERE "clienteId" = ${user.clienteId}::uuid
      `
      const numero = (lastPago[0]?.max_numero ?? 0) + 1

      // Crear el pago usando SQL directo para evitar problemas con el enum
      await tx.$executeRaw`
        INSERT INTO pagos (id, "clienteId", "proveedorId", numero, fecha, estado, "montoTotal", nota, "updatedAt")
        VALUES (
          ${pagoId}::uuid,
          ${user.clienteId}::uuid,
          ${data.proveedorId}::uuid,
          ${numero},
          ${data.fecha},
          ${estadoInicial}::"EstadoPago",
          ${montoTotal},
          ${data.nota || null},
          NOW()
        )
      `

      // Crear los documentos asociados
      for (const doc of data.documentos) {
        await tx.pago_documentos.create({
          data: {
            pagoId: pagoId,
            documentoId: doc.documentoId,
            montoAplicado: doc.montoAplicado,
          },
        })
      }

      // Crear los métodos de pago
      for (const m of data.metodos) {
        // Build meta object with optional fields
        const meta: { fecha?: string; referencia?: string; attachments?: { key: string; filename: string }[] } = {}
        if (m.fecha) meta.fecha = m.fecha
        if (m.referencia) meta.referencia = m.referencia
        if (m.attachments && m.attachments.length > 0) {
          meta.attachments = m.attachments
        }

        await tx.pago_metodos.create({
          data: {
            id: crypto.randomUUID(),
            pagoId: pagoId,
            tipo: m.tipo as 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE',
            monto: m.monto,
            meta: meta as object,
          },
        })
      }

      // Si se emite la orden, marcar los documentos como PAGADO
      if (data.emitir) {
        const documentoIds = data.documentos.map((d) => d.documentoId)
        await tx.$executeRaw`
          UPDATE documentos
          SET "estadoRevision" = 'PAGADO'::"EstadoRevision", "updatedAt" = NOW()
          WHERE id = ANY(${documentoIds}::uuid[])
        `
      }

      // Obtener el pago creado
      return tx.pagos.findUnique({ where: { id: pagoId } })
    })

    return NextResponse.json({ pago }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: err.errors },
        { status: 400 }
      )
    }
    console.error('Error creating pago:', err)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
