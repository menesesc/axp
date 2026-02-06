import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, requireAdmin } from '@/lib/auth'

// GET: Obtener un documento por ID con todos sus detalles
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar autenticación
    const { user, error: authError } = await getAuthUser()
    if (authError) return authError

    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const { id } = await params

    // Obtener documento con relaciones
    const documento = await prisma.documentos.findUnique({
      where: {
        id,
      },
      include: {
        clientes: {
          select: {
            id: true,
            razonSocial: true,
            cuit: true,
          },
        },
        proveedores: {
          select: {
            id: true,
            razonSocial: true,
            cuit: true,
          },
        },
        documento_items: {
          orderBy: {
            linea: 'asc',
          },
        },
      },
    })

    if (!documento) {
      return NextResponse.json({ error: 'Documento not found' }, { status: 404 })
    }

    // Verificar que el documento pertenece al cliente del usuario
    if (documento.clienteId !== clienteId) {
      return NextResponse.json(
        { error: 'No tienes acceso a este documento' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      documento,
      items: documento.documento_items || [],
    })
  } catch (error) {
    console.error('Error fetching documento:', error)
    return NextResponse.json(
      { error: 'Failed to fetch documento' },
      { status: 500 }
    )
  }
}

// PATCH: Actualizar un documento
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Requiere permisos de administrador
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const { id } = await params

    // Verificar que el documento existe y pertenece al cliente
    const existingDoc = await prisma.documentos.findUnique({
      where: { id },
      select: { clienteId: true },
    })

    if (!existingDoc) {
      return NextResponse.json({ error: 'Documento not found' }, { status: 404 })
    }

    if (existingDoc.clienteId !== clienteId) {
      return NextResponse.json(
        { error: 'No tienes acceso a este documento' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      fechaEmision,
      fechaVencimiento,
      letra,
      numeroCompleto,
      total,
      subtotal,
      iva,
      proveedorId,
      estadoRevision,
    } = body

    /**
     * Parsea fecha con timezone de Argentina (GMT-3).
     * Convierte "YYYY-MM-DD" a Date con hora mediodía en Argentina.
     */
    const parseArgentinaDate = (dateStr: string | null | undefined): Date | null => {
      if (!dateStr) return null
      // Si ya tiene hora/timezone, parsear directamente
      if (dateStr.includes('T')) {
        return new Date(dateStr)
      }
      // Para fechas YYYY-MM-DD, usar mediodía en Argentina (GMT-3)
      return new Date(`${dateStr}T12:00:00-03:00`)
    }

    // Construir objeto de actualización solo con campos presentes
    const updateData: any = {
      updatedAt: new Date(),
    }

    if (fechaEmision !== undefined)
      updateData.fechaEmision = parseArgentinaDate(fechaEmision)
    if (fechaVencimiento !== undefined)
      updateData.fechaVencimiento = parseArgentinaDate(fechaVencimiento)
    if (letra !== undefined) updateData.letra = letra || null
    if (numeroCompleto !== undefined)
      updateData.numeroCompleto = numeroCompleto || null
    if (total !== undefined)
      updateData.total = total ? parseFloat(total) : null
    if (subtotal !== undefined)
      updateData.subtotal = subtotal ? parseFloat(subtotal) : null
    if (iva !== undefined) updateData.iva = iva ? parseFloat(iva) : null
    if (proveedorId !== undefined) updateData.proveedorId = proveedorId || null
    if (estadoRevision !== undefined) updateData.estadoRevision = estadoRevision

    // Actualizar documento
    const documento = await prisma.documentos.update({
      where: {
        id,
      },
      data: updateData,
      include: {
        clientes: {
          select: {
            id: true,
            razonSocial: true,
            cuit: true,
          },
        },
        proveedores: {
          select: {
            id: true,
            razonSocial: true,
            cuit: true,
          },
        },
      },
    })

    // Recalcular campos faltantes
    const missingFields: string[] = []
    if (!documento.clienteId) missingFields.push('clienteId')
    if (!documento.proveedorId) missingFields.push('proveedorId')
    if (!documento.fechaEmision) missingFields.push('fechaEmision')
    if (!documento.total) missingFields.push('total')
    if (!documento.letra) missingFields.push('letra')
    if (!documento.numeroCompleto) missingFields.push('numeroCompleto')
    if (!documento.subtotal) missingFields.push('subtotal')
    if (!documento.iva) missingFields.push('iva')

    // Determinar nuevo estado (solo auto-cambiar si el usuario no lo especificó)
    let newEstado = documento.estadoRevision
    if (estadoRevision === undefined) {
      // Auto-confirmar solo si no hay campos faltantes y estaba pendiente
      if (
        missingFields.length === 0 &&
        documento.estadoRevision === 'PENDIENTE'
      ) {
        newEstado = 'CONFIRMADO'
      }
    }

    // Actualizar missingFields y estado si cambió
    const currentMissingFields = documento.missingFields as string[] || []
    if (
      missingFields.length !== currentMissingFields.length ||
      newEstado !== documento.estadoRevision
    ) {
      await prisma.documentos.update({
        where: { id },
        data: {
          missingFields,
          estadoRevision: newEstado,
        },
      })
    }

    // Retornar documento actualizado
    const documentoFinal = await prisma.documentos.findUnique({
      where: { id },
      include: {
        clientes: {
          select: {
            id: true,
            razonSocial: true,
            cuit: true,
          },
        },
        proveedores: {
          select: {
            id: true,
            razonSocial: true,
            cuit: true,
          },
        },
      },
    })

    return NextResponse.json({ documento: documentoFinal })
  } catch (error) {
    console.error('Error updating documento:', error)
    return NextResponse.json(
      { error: 'Failed to update documento' },
      { status: 500 }
    )
  }
}
