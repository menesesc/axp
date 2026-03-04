import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

const VALID_TIPOS = ['FACTURA', 'REMITO', 'NOTA_CREDITO'] as const

// POST: Cambiar tipo de documento a múltiples documentos
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { documentoIds, tipo } = body

    if (!Array.isArray(documentoIds) || documentoIds.length === 0) {
      return NextResponse.json(
        { error: 'documentoIds debe ser un array no vacío' },
        { status: 400 }
      )
    }

    if (!tipo || !VALID_TIPOS.includes(tipo)) {
      return NextResponse.json(
        { error: `tipo debe ser uno de: ${VALID_TIPOS.join(', ')}` },
        { status: 400 }
      )
    }

    // Actualizar tipo en todos los documentos del cliente
    const result = await prisma.documentos.updateMany({
      where: {
        id: { in: documentoIds },
        clienteId,
      },
      data: {
        tipo,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      message: `${result.count} documentos actualizados a ${tipo}`,
      updatedCount: result.count,
    })
  } catch (error) {
    console.error('Error in bulk update tipo:', error)
    return NextResponse.json(
      { error: 'Error al cambiar tipo de documento' },
      { status: 500 }
    )
  }
}
