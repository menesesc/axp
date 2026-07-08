import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2/client'

/**
 * Comprobante de transferencia a NIVEL ORDEN (campo pagos.comprobanteKey).
 * A diferencia de los adjuntos por forma de pago, este se puede agregar/reemplazar
 * en cualquier estado (BORRADOR o EMITIDA) — es el caso "me olvidé de adjuntar la
 * transferencia y quiero regenerar el PDF final". El PDF anexa este comprobante
 * automáticamente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const { id } = await params

  const pago = await prisma.pagos.findFirst({
    where: { id, clienteId: user.clienteId },
    select: { id: true },
  })
  if (!pago) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  }

  const cliente = await prisma.clientes.findUnique({
    where: { id: user.clienteId },
    select: { cuit: true },
  })
  if (!cliente?.cuit) {
    return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Solo se permiten archivos PDF' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'El archivo excede 10MB' }, { status: 400 })
  }

  try {
    const bucket = `axp-client-${cliente.cuit}`
    const timestamp = Date.now()
    const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const key = `comprobantes/${id}/transferencia-${timestamp}-${sanitized}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadToR2(bucket, key, buffer)

    await prisma.pagos.update({
      where: { id },
      data: { comprobanteKey: key },
    })

    return NextResponse.json({ success: true, key, filename: file.name })
  } catch (err) {
    console.error('Error subiendo comprobante de transferencia:', err)
    return NextResponse.json({ error: 'Error al subir el comprobante' }, { status: 500 })
  }
}

/** Quita el comprobante de transferencia de la orden (no borra el objeto en R2). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const { id } = await params

  const pago = await prisma.pagos.findFirst({
    where: { id, clienteId: user.clienteId },
    select: { id: true },
  })
  if (!pago) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  }

  await prisma.pagos.update({
    where: { id },
    data: { comprobanteKey: null },
  })

  return NextResponse.json({ success: true })
}
