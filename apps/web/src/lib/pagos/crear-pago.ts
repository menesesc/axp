import type { Prisma } from '@prisma/client'

export interface MetodoInput {
  tipo: string
  monto: number
  fecha?: string | undefined
  referencia?: string | undefined
  attachments?: Array<{ key: string; filename: string }> | undefined
}

export interface CrearPagoInput {
  clienteId: string
  proveedorId: string
  fecha: Date
  nota?: string | null | undefined
  emitir: boolean
  documentos: Array<{ documentoId: string; montoAplicado: number }>
  metodos: MetodoInput[]
}

/**
 * Inserta una orden de pago con sus documentos y métodos dentro de una
 * transacción. Usado por el alta individual (wizard) y por el alta en lote.
 * Al emitir, los documentos pasan a PAGADO.
 */
export async function crearPagoTx(tx: Prisma.TransactionClient, data: CrearPagoInput): Promise<string> {
  const montoDocumentos = data.documentos.reduce((sum, d) => sum + d.montoAplicado, 0)
  const totalMetodos = data.metodos.reduce((sum, m) => sum + m.monto, 0)
  const montoTotal = montoDocumentos || totalMetodos || 0

  const pagoId = crypto.randomUUID()
  const estadoInicial = data.emitir ? 'EMITIDA' : 'BORRADOR'

  // Próximo número correlativo para este cliente
  const lastPago = await tx.$queryRaw<Array<{ max_numero: number | null }>>`
    SELECT MAX(numero) as max_numero FROM pagos WHERE "clienteId" = ${data.clienteId}::uuid
  `
  const numero = (lastPago[0]?.max_numero ?? 0) + 1

  // SQL directo para evitar problemas con el enum
  await tx.$executeRaw`
    INSERT INTO pagos (id, "clienteId", "proveedorId", numero, fecha, estado, "montoTotal", nota, "updatedAt")
    VALUES (
      ${pagoId}::uuid,
      ${data.clienteId}::uuid,
      ${data.proveedorId}::uuid,
      ${numero},
      ${data.fecha},
      ${estadoInicial}::"EstadoPago",
      ${montoTotal},
      ${data.nota || null},
      NOW()
    )
  `

  for (const doc of data.documentos) {
    await tx.pago_documentos.create({
      data: { pagoId, documentoId: doc.documentoId, montoAplicado: doc.montoAplicado },
    })
  }

  for (const m of data.metodos) {
    const meta: { fecha?: string; referencia?: string; attachments?: { key: string; filename: string }[] } = {}
    if (m.fecha) meta.fecha = m.fecha
    if (m.referencia) meta.referencia = m.referencia
    if (m.attachments && m.attachments.length > 0) meta.attachments = m.attachments

    await tx.pago_metodos.create({
      data: {
        id: crypto.randomUUID(),
        pagoId,
        tipo: m.tipo as 'EFECTIVO' | 'TRANSFERENCIA' | 'CHEQUE',
        monto: m.monto,
        meta: meta as object,
      },
    })
  }

  if (data.emitir) {
    const documentoIds = data.documentos.map((d) => d.documentoId)
    await tx.$executeRaw`
      UPDATE documentos
      SET "estadoRevision" = 'PAGADO'::"EstadoRevision", "updatedAt" = NOW()
      WHERE id = ANY(${documentoIds}::uuid[])
    `
  }

  return pagoId
}
