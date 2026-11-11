import { prisma } from '@/lib/prisma'
import { calculateMissingFields, determineEstadoRevision } from '@/lib/documento-estado'

/**
 * De estos proveedores, cuáles son impuestos (rubro IMPUESTO). Sus
 * comprobantes —F.931, DDJJ de IVA, Ingresos Brutos— no tienen letra, y sin
 * esto nunca quedarían confirmados ni se podrían pagar.
 *
 * Por SQL crudo: `rubro` es columna nueva y el cliente Prisma desplegado no
 * la conoce.
 */
export async function proveedoresImpuesto(ids: Array<string | null | undefined>): Promise<Set<string>> {
  const unicos = [...new Set(ids.filter((id): id is string => !!id))]
  if (unicos.length === 0) return new Set()
  const filas = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text FROM proveedores WHERE id = ANY(${unicos}::uuid[]) AND rubro = 'IMPUESTO'
  `
  return new Set(filas.map((f) => f.id))
}

/**
 * Al cambiar el rubro, los documentos que ya tiene el proveedor se vuelven a
 * evaluar: si pasa a IMPUESTO, los F.931 que entraron pendientes por no tener
 * letra quedan confirmados y se pueden pagar. No toca ERROR, DUPLICADO ni PAGADO.
 */
export async function recalcularEstadosDeProveedor(clienteId: string, proveedorId: string): Promise<number> {
  const sinLetra = (await proveedoresImpuesto([proveedorId])).size > 0
  const docs = await prisma.documentos.findMany({
    where: { clienteId, proveedorId, estadoRevision: { in: ['PENDIENTE', 'CONFIRMADO'] } },
    select: {
      id: true, clienteId: true, proveedorId: true, fechaEmision: true, total: true, letra: true,
      numeroCompleto: true, subtotal: true, iva: true, pdfRawKey: true, missingFields: true, estadoRevision: true,
    },
  })
  let cambiados = 0
  for (const doc of docs) {
    const evaluar = { ...doc, sinLetra }
    const estado = determineEstadoRevision(evaluar)
    if (estado === doc.estadoRevision) continue
    await prisma.documentos.update({
      where: { id: doc.id },
      data: { estadoRevision: estado, missingFields: calculateMissingFields(evaluar) },
    })
    cambiados++
  }
  return cambiados
}
