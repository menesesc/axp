import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser, requireAdmin } from '@/lib/auth'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

// Configurar cliente R2 para eliminar archivos
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

const r2Client = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null

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

    // Recalcular missingFields basado en datos actuales
    const actualMissing: string[] = []
    if (!documento.proveedorId) actualMissing.push('proveedor')
    if (!documento.fechaEmision) actualMissing.push('fechaEmision')
    if (!documento.total) actualMissing.push('total')
    if (!documento.letra) actualMissing.push('letra')
    if (!documento.numeroCompleto) actualMissing.push('numeroCompleto')

    return NextResponse.json({
      documento: {
        ...documento,
        missingFields: actualMissing,
      },
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
      // estadoRevision se calcula automáticamente, no se acepta del cliente
    } = body

    /**
     * Parsea fecha con timezone de Argentina (GMT-3).
     * Convierte "YYYY-MM-DD" a Date con hora mediodía en Argentina.
     * Si la fecha es futura, usa la fecha actual.
     */
    const parseArgentinaDate = (dateStr: string | null | undefined): Date | null => {
      if (!dateStr) return null
      let date: Date
      // Si ya tiene hora/timezone, parsear directamente
      if (dateStr.includes('T')) {
        date = new Date(dateStr)
      } else {
        // Para fechas YYYY-MM-DD, usar mediodía en Argentina (GMT-3)
        date = new Date(`${dateStr}T12:00:00-03:00`)
      }
      // Validar que no sea fecha futura
      const today = new Date()
      today.setHours(23, 59, 59, 999) // Fin del día actual
      if (date > today) {
        return new Date() // Usar fecha actual si es futura
      }
      return date
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
    if (numeroCompleto !== undefined) {
      // Strip non-digits from numeroCompleto (keep only digits)
      updateData.numeroCompleto = numeroCompleto ? numeroCompleto.replace(/\D/g, '') : null
    }
    if (total !== undefined)
      updateData.total = total ? parseFloat(total) : null
    if (subtotal !== undefined)
      updateData.subtotal = subtotal ? parseFloat(subtotal) : null
    if (iva !== undefined) updateData.iva = iva ? parseFloat(iva) : null
    if (proveedorId !== undefined) updateData.proveedorId = proveedorId || null
    // estadoRevision se calcula automáticamente abajo

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

    // Determinar nuevo estado automáticamente basado en los campos
    let newEstado: 'PENDIENTE' | 'CONFIRMADO' | 'ERROR' | 'DUPLICADO' = documento.estadoRevision as any

    // Solo cambiar estado si no es ERROR o DUPLICADO (estados manuales)
    if (documento.estadoRevision !== 'ERROR' && documento.estadoRevision !== 'DUPLICADO') {
      if (missingFields.length === 0) {
        // Tiene todos los campos requeridos
        newEstado = 'CONFIRMADO'
      } else {
        // Faltan campos
        newEstado = 'PENDIENTE'
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

// DELETE: Eliminar un documento y sus archivos de R2
export async function DELETE(
  _request: NextRequest,
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

    // Obtener documento con sus keys de PDF y cliente (para el bucket)
    const documento = await prisma.documentos.findUnique({
      where: { id },
      select: {
        clienteId: true,
        pdfRawKey: true,
        pdfFinalKey: true,
        clientes: {
          select: { cuit: true },
        },
      },
    })

    if (!documento) {
      return NextResponse.json({ error: 'Documento not found' }, { status: 404 })
    }

    if (documento.clienteId !== clienteId) {
      return NextResponse.json(
        { error: 'No tienes acceso a este documento' },
        { status: 403 }
      )
    }

    // Eliminar archivos de R2 si tenemos cliente configurado
    if (r2Client && documento.clientes?.cuit) {
      const bucket = `axp-client-${documento.clientes.cuit}`

      // Eliminar PDF procesado
      if (documento.pdfFinalKey) {
        try {
          await r2Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: documento.pdfFinalKey,
          }))
        } catch (e) {
          console.warn(`Failed to delete pdfFinalKey from R2: ${documento.pdfFinalKey}`, e)
        }
      }

      // Eliminar PDF raw (si es diferente del final)
      if (documento.pdfRawKey && documento.pdfRawKey !== documento.pdfFinalKey) {
        try {
          await r2Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: documento.pdfRawKey,
          }))
        } catch (e) {
          console.warn(`Failed to delete pdfRawKey from R2: ${documento.pdfRawKey}`, e)
        }
      }
    }

    // Eliminar items del documento primero (FK constraint)
    await prisma.documento_items.deleteMany({
      where: { documentoId: id },
    })

    // Eliminar el documento
    await prisma.documentos.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, message: 'Documento eliminado' })
  } catch (error) {
    console.error('Error deleting documento:', error)
    return NextResponse.json(
      { error: 'Failed to delete documento' },
      { status: 500 }
    )
  }
}
