import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { jsonImportes } from '@/lib/importes'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { crearPagoTx } from '@/lib/pagos/crear-pago'
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
  const { user, error, verImportes } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '25')
  const estado = searchParams.get('estado')
  const proveedorId = searchParams.get('proveedorId')
  const q = searchParams.get('q')?.trim()
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

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

  // Rango de fechas de la orden (YYYY-MM-DD; la columna es @db.Date).
  const esFecha = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (esFecha(desde) || esFecha(hasta)) {
    where.fecha = {
      ...(esFecha(desde) ? { gte: new Date(`${desde}T00:00:00Z`) } : {}),
      ...(esFecha(hasta) ? { lte: new Date(`${hasta}T00:00:00Z`) } : {}),
    }
  }

  if (q) {
    where.proveedores = {
      razonSocial: { contains: q, mode: 'insensitive' },
    }
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
      orderBy: { numero: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pagos.count({ where }),
  ])

  return jsonImportes({
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
  }, !!verImportes)
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS, 'edit')
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
    const pago = await prisma.$transaction(async (tx) => {
      const pagoId = await crearPagoTx(tx, {
        clienteId: user.clienteId!,
        proveedorId: data.proveedorId,
        fecha: data.fecha,
        nota: data.nota,
        emitir: data.emitir,
        documentos: data.documentos,
        metodos: data.metodos,
      })
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
