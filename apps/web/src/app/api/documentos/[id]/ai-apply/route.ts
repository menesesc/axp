import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

/**
 * Parsea fecha con timezone de Argentina (GMT-3).
 * Replica la lógica del PATCH /api/documentos/[id]
 */
function parseArgentinaDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  let date: Date
  if (dateStr.includes('T')) {
    date = new Date(dateStr)
  } else {
    date = new Date(`${dateStr}T12:00:00-03:00`)
  }
  if (isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (date > today) {
    return new Date()
  }
  return date
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { logId, changes } = body

    if (!logId || !changes) {
      return NextResponse.json({ error: 'logId y changes son requeridos' }, { status: 400 })
    }

    // Validate the AI usage log exists and belongs to this document
    const log = await prisma.ai_usage_logs.findUnique({ where: { id: logId } })
    if (!log || log.documentoId !== id || log.clienteId !== clienteId) {
      return NextResponse.json({ error: 'Log de IA no válido' }, { status: 400 })
    }

    // Verify document exists and belongs to client
    const existingDoc = await prisma.documentos.findUnique({
      where: { id },
      select: { clienteId: true, estadoRevision: true },
    })

    if (!existingDoc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }
    if (existingDoc.clienteId !== clienteId) {
      return NextResponse.json({ error: 'No tienes acceso a este documento' }, { status: 403 })
    }

    // Build update data (same logic as PATCH /api/documentos/[id])
    const updateData: any = { updatedAt: new Date() }

    if (changes.fechaEmision !== undefined) {
      updateData.fechaEmision = parseArgentinaDate(changes.fechaEmision)
    }
    if (changes.fechaVencimiento !== undefined) {
      updateData.fechaVencimiento = parseArgentinaDate(changes.fechaVencimiento)
    }
    if (changes.letra !== undefined) {
      updateData.letra = changes.letra || null
    }
    if (changes.numeroCompleto !== undefined) {
      updateData.numeroCompleto = changes.numeroCompleto
        ? changes.numeroCompleto.replace(/\D/g, '')
        : null
    }
    if (changes.total !== undefined) {
      updateData.total = changes.total ? parseFloat(changes.total) : null
    }
    if (changes.subtotal !== undefined) {
      updateData.subtotal = changes.subtotal ? parseFloat(changes.subtotal) : null
    }
    if (changes.iva !== undefined) {
      updateData.iva = changes.iva ? parseFloat(changes.iva) : null
    }
    if (changes.proveedorId !== undefined) {
      updateData.proveedorId = changes.proveedorId || null
    }

    // Update document
    const documento = await prisma.documentos.update({
      where: { id },
      data: updateData,
      include: {
        proveedores: { select: { id: true, razonSocial: true, cuit: true } },
      },
    })

    // Recalculate missingFields (same logic as PATCH)
    const missingFields: string[] = []
    if (!documento.proveedorId) missingFields.push('proveedorId')
    if (!documento.fechaEmision) missingFields.push('fechaEmision')
    if (!documento.total) missingFields.push('total')
    if (!documento.letra) missingFields.push('letra')
    if (!documento.numeroCompleto) missingFields.push('numeroCompleto')
    if (!documento.subtotal) missingFields.push('subtotal')
    if (!documento.iva) missingFields.push('iva')

    // Determine new estado
    let newEstado = documento.estadoRevision
    if (documento.estadoRevision !== 'ERROR' && documento.estadoRevision !== 'DUPLICADO') {
      newEstado = missingFields.length === 0 ? 'CONFIRMADO' : 'PENDIENTE'
    }

    // Update missingFields and estado if changed
    if (
      missingFields.length !== ((documento.missingFields as string[]) || []).length ||
      newEstado !== documento.estadoRevision
    ) {
      await prisma.documentos.update({
        where: { id },
        data: { missingFields, estadoRevision: newEstado },
      })
    }

    // Mark AI log as accepted
    await prisma.ai_usage_logs.update({
      where: { id: logId },
      data: { aceptado: true },
    })

    return NextResponse.json({
      documento: { ...documento, missingFields, estadoRevision: newEstado },
      applied: true,
    })
  } catch (error) {
    console.error('Error applying AI review:', error)
    return NextResponse.json({ error: 'Error al aplicar los cambios' }, { status: 500 })
  }
}
