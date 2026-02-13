import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const proveedorId = searchParams.get('proveedorId')

  if (!proveedorId) {
    return NextResponse.json(
      { error: 'Se requiere proveedorId' },
      { status: 400 }
    )
  }

  // Verificar que el proveedor pertenece al cliente
  const proveedor = await prisma.proveedores.findFirst({
    where: {
      id: proveedorId,
      clienteId: user.clienteId,
    },
  })

  if (!proveedor) {
    return NextResponse.json(
      { error: 'Proveedor no encontrado' },
      { status: 404 }
    )
  }

  // Obtener IDs de documentos que ya están en alguna orden de pago
  const docsEnPago = await prisma.pago_documentos.findMany({
    select: { documentoId: true },
  })
  const docsEnPagoIds = new Set(docsEnPago.map((d) => d.documentoId))

  // Obtener documentos confirmados de este proveedor que no están pagados
  const documentos = await prisma.documentos.findMany({
    where: {
      clienteId: user.clienteId,
      proveedorId,
      estadoRevision: 'CONFIRMADO',
    },
    select: {
      id: true,
      tipo: true,
      letra: true,
      numeroCompleto: true,
      fechaEmision: true,
      total: true,
      confidenceScore: true,
      _count: {
        select: { documento_anotaciones: true },
      },
    },
    orderBy: { fechaEmision: 'asc' },
  })

  // Filtrar documentos que no están en una orden de pago
  const documentosPendientes = documentos.filter((d) => !docsEnPagoIds.has(d.id))

  return NextResponse.json({
    documentos: documentosPendientes.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      letra: d.letra,
      numeroCompleto: d.numeroCompleto,
      fechaEmision: d.fechaEmision,
      total: d.total ? Number(d.total) : null,
      confidenceScore: d.confidenceScore ? Number(d.confidenceScore) : null,
      anotacionesCount: d._count.documento_anotaciones,
    })),
    proveedor: {
      id: proveedor.id,
      razonSocial: proveedor.razonSocial,
    },
  })
}
