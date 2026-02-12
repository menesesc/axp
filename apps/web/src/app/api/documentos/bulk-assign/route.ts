import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { determineEstadoRevision, calculateMissingFields } from '@/lib/documento-estado'
import { requireAdmin } from '@/lib/auth'

// POST: Asignar proveedor a múltiples documentos
export async function POST(request: NextRequest) {
  try {
    // Autenticar usuario (solo admin puede asignar)
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
    const { documentoIds, proveedorId: rawProveedorId } = body

    // Normalizar proveedorId: convertir string "null" a null real
    const proveedorId = rawProveedorId === 'null' || rawProveedorId === '' ? null : rawProveedorId

    if (!Array.isArray(documentoIds) || documentoIds.length === 0) {
      return NextResponse.json(
        { error: 'documentoIds debe ser un array no vacío' },
        { status: 400 }
      )
    }

    // Si proveedorId es null, estamos desasignando
    // Si tiene valor, verificamos que el proveedor existe y pertenece al cliente
    if (proveedorId) {
      const proveedor = await prisma.proveedores.findFirst({
        where: {
          id: proveedorId,
          clienteId,
        },
        select: { id: true, activo: true },
      })

      if (!proveedor) {
        return NextResponse.json(
          { error: 'Proveedor no encontrado' },
          { status: 404 }
        )
      }

      if (!proveedor.activo) {
        return NextResponse.json(
          { error: 'El proveedor está inactivo' },
          { status: 400 }
        )
      }
    }

    // Obtener los documentos completos para verificar todos los campos
    const documentos = await prisma.documentos.findMany({
      where: {
        id: { in: documentoIds },
        clienteId,
      },
      select: {
        id: true,
        clienteId: true,
        fechaEmision: true,
        total: true,
        letra: true,
        numeroCompleto: true,
        subtotal: true,
        iva: true,
      },
    })

    if (!documentos || documentos.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron documentos válidos' },
        { status: 404 }
      )
    }

    // Actualizar cada documento evaluando su estado completo
    const updatePromises = documentos.map(async (doc) => {
      // El documento con el nuevo proveedorId
      const docParaEvaluar = {
        clienteId: doc.clienteId,
        proveedorId: proveedorId || null,
        fechaEmision: doc.fechaEmision,
        total: doc.total ? Number(doc.total) : null,
        letra: doc.letra,
        numeroCompleto: doc.numeroCompleto,
        subtotal: doc.subtotal ? Number(doc.subtotal) : null,
        iva: doc.iva ? Number(doc.iva) : null,
      }

      // Evaluar estado y calcular campos faltantes
      const estadoRevision = determineEstadoRevision(docParaEvaluar)
      const missingFields = calculateMissingFields(docParaEvaluar)

      return prisma.documentos.update({
        where: { id: doc.id },
        data: {
          proveedorId: proveedorId || null,
          estadoRevision: estadoRevision as any,
          missingFields,
          updatedAt: new Date(),
        },
        select: { id: true },
      })
    })

    const updatedDocs = await Promise.all(updatePromises)

    return NextResponse.json({
      message: `${updatedDocs.length} documentos actualizados correctamente`,
      updatedCount: updatedDocs.length,
      documentoIds: updatedDocs.map((d) => d.id),
    })
  } catch (error) {
    console.error('Error in bulk assign:', error)
    return NextResponse.json(
      { error: 'Error al asignar proveedor' },
      { status: 500 }
    )
  }
}
