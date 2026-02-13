import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// PATCH - Editar un item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const { id } = await params
    const clienteId = user?.clienteId
    const usuarioId = user?.id

    if (!clienteId || !usuarioId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Verificar que el item existe y pertenece a un documento del cliente
    const item = await prisma.documento_items.findFirst({
      where: {
        id,
        documentos: { clienteId },
      },
      include: {
        documentos: {
          select: { id: true, estadoRevision: true },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
    }

    // No permitir editar items de documentos PAGADO
    if (item.documentos.estadoRevision === 'PAGADO') {
      return NextResponse.json({ error: 'No se puede editar un documento pagado' }, { status: 400 })
    }

    const body = await request.json()
    const { descripcion, cantidad, precioUnitario, subtotal } = body

    // Preparar datos para actualizar
    const updateData: any = {}

    if (descripcion !== undefined) {
      if (typeof descripcion !== 'string' || descripcion.trim().length === 0) {
        return NextResponse.json({ error: 'Descripción inválida' }, { status: 400 })
      }
      updateData.descripcion = descripcion.trim()
    }

    if (cantidad !== undefined) {
      const cantidadNum = parseFloat(cantidad)
      if (isNaN(cantidadNum) || cantidadNum < 0) {
        return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
      }
      updateData.cantidad = cantidadNum
    }

    if (precioUnitario !== undefined) {
      const precioNum = parseFloat(precioUnitario)
      if (isNaN(precioNum) || precioNum < 0) {
        return NextResponse.json({ error: 'Precio unitario inválido' }, { status: 400 })
      }
      updateData.precioUnitario = precioNum
    }

    if (subtotal !== undefined) {
      const subtotalNum = parseFloat(subtotal)
      if (isNaN(subtotalNum) || subtotalNum < 0) {
        return NextResponse.json({ error: 'Subtotal inválido' }, { status: 400 })
      }
      updateData.subtotal = subtotalNum
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
    }

    // Guardar valores anteriores para el log
    const before = {
      descripcion: item.descripcion,
      cantidad: item.cantidad ? Number(item.cantidad) : null,
      precioUnitario: item.precioUnitario ? Number(item.precioUnitario) : null,
      subtotal: item.subtotal ? Number(item.subtotal) : null,
    }

    // Actualizar item
    const updatedItem = await prisma.documento_items.update({
      where: { id },
      data: updateData,
    })

    // Registrar la revisión
    await prisma.documento_revisiones.create({
      data: {
        id: crypto.randomUUID(),
        documentoId: item.documentos.id,
        usuarioId,
        accion: 'EDIT_ITEM',
        path: `items.${item.linea}`,
        before,
        after: {
          descripcion: updatedItem.descripcion,
          cantidad: updatedItem.cantidad ? Number(updatedItem.cantidad) : null,
          precioUnitario: updatedItem.precioUnitario ? Number(updatedItem.precioUnitario) : null,
          subtotal: updatedItem.subtotal ? Number(updatedItem.subtotal) : null,
        },
      },
    })

    return NextResponse.json({
      item: {
        id: updatedItem.id,
        linea: updatedItem.linea,
        descripcion: updatedItem.descripcion,
        codigo: updatedItem.codigo,
        cantidad: updatedItem.cantidad ? Number(updatedItem.cantidad) : null,
        unidad: updatedItem.unidad,
        precioUnitario: updatedItem.precioUnitario ? Number(updatedItem.precioUnitario) : null,
        subtotal: updatedItem.subtotal ? Number(updatedItem.subtotal) : null,
      },
    })
  } catch (error) {
    console.error('Error updating item:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
