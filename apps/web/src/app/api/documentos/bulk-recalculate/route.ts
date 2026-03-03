import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { determineEstadoRevision, calculateMissingFields } from '@/lib/documento-estado'
import { requireAdmin } from '@/lib/auth'

// POST: Recalcular estadoRevision para múltiples documentos
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
    const { documentIds } = body

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'documentIds debe ser un array no vacío' },
        { status: 400 }
      )
    }

    // Obtener documentos con todos los campos necesarios
    const documentos = await prisma.documentos.findMany({
      where: {
        id: { in: documentIds },
        clienteId,
      },
      select: {
        id: true,
        clienteId: true,
        proveedorId: true,
        fechaEmision: true,
        total: true,
        letra: true,
        numeroCompleto: true,
        subtotal: true,
        iva: true,
        estadoRevision: true,
      },
    })

    let updated = 0
    let unchanged = 0

    const updatePromises = documentos.map(async (doc) => {
      // No tocar ERROR o DUPLICADO
      if (doc.estadoRevision === 'ERROR' || doc.estadoRevision === 'DUPLICADO') {
        unchanged++
        return
      }

      const correctEstado = determineEstadoRevision(doc)
      const missingFields = calculateMissingFields(doc)

      if (correctEstado !== doc.estadoRevision) {
        await prisma.documentos.update({
          where: { id: doc.id },
          data: {
            estadoRevision: correctEstado,
            missingFields,
          },
        })
        updated++
      } else {
        unchanged++
      }
    })

    await Promise.all(updatePromises)

    return NextResponse.json({
      updated,
      unchanged,
      total: documentos.length,
    })
  } catch (error) {
    console.error('Error in bulk recalculate:', error)
    return NextResponse.json(
      { error: 'Error al recalcular estados' },
      { status: 500 }
    )
  }
}
