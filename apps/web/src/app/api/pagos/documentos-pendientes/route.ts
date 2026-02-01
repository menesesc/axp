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

  // Obtener documentos confirmados de este proveedor
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
    },
    orderBy: { fechaEmision: 'asc' },
  })

  return NextResponse.json({
    documentos,
    proveedor: {
      id: proveedor.id,
      razonSocial: proveedor.razonSocial,
    },
  })
}
