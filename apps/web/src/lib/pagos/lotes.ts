import { PDFDocument } from 'pdf-lib'
import { prisma } from '@/lib/prisma'
import { generatePaymentOrderPdf, formatNumeroOrden } from '@/lib/pdf/generate-payment-order-pdf'
import type { GaliciaFila } from './galicia'

/**
 * Lotes de transferencias (tabla pago_lotes + pagos.loteId, ambas agregadas por
 * SQL directo: se consultan con SQL crudo para no depender del cliente Prisma
 * regenerado).
 */

export interface LoteResumen {
  id: string
  numero: number
  fecha: string
  createdAt: string
  ordenes: number
  pagadas: number
  conComprobante: number
  montoTotal: number
}

export async function listarLotes(clienteId: string): Promise<LoteResumen[]> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; numero: number; fecha: Date; created_at: Date; ordenes: number; pagadas: number; con_comprobante: number; monto: number | null }>
  >`
    SELECT l.id, l.numero, l.fecha, l."createdAt" AS created_at,
           COUNT(p.id)::int AS ordenes,
           COUNT(p.id) FILTER (WHERE p.estado = 'PAGADO')::int AS pagadas,
           COUNT(p.id) FILTER (WHERE p."comprobanteKey" IS NOT NULL)::int AS con_comprobante,
           COALESCE(SUM(p."montoTotal"), 0)::float AS monto
    FROM pago_lotes l
    LEFT JOIN pagos p ON p."loteId" = l.id
    WHERE l."clienteId" = ${clienteId}::uuid
    GROUP BY l.id
    ORDER BY l.numero DESC
    LIMIT 50
  `
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    fecha: r.fecha.toISOString().slice(0, 10),
    createdAt: r.created_at.toISOString(),
    ordenes: r.ordenes,
    pagadas: r.pagadas,
    conComprobante: r.con_comprobante,
    montoTotal: r.monto ?? 0,
  }))
}

/** Lote con sus órdenes completas (incluye lo necesario para el PDF). */
export async function cargarLote(clienteId: string, loteId: string) {
  const lote = await prisma.$queryRaw<Array<{ id: string; numero: number; fecha: Date }>>`
    SELECT id, numero, fecha FROM pago_lotes WHERE id = ${loteId}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!lote[0]) return null

  const ids = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM pagos WHERE "loteId" = ${loteId}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  const pagos = await prisma.pagos.findMany({
    where: { id: { in: ids.map((i) => i.id) } },
    include: {
      proveedores: { select: { id: true, razonSocial: true, cuit: true } },
      pago_documentos: {
        include: {
          documentos: { select: { tipo: true, letra: true, numeroCompleto: true, fechaEmision: true, total: true } },
        },
      },
      pago_metodos: true,
    },
    orderBy: { numero: 'asc' },
  })
  const cbus = await prisma.$queryRaw<Array<{ id: string; cbu: string | null }>>`
    SELECT id, cbu FROM proveedores WHERE id = ANY(${pagos.map((p) => p.proveedorId)}::uuid[])
  `
  const cbuMap = new Map(cbus.map((c) => [c.id, c.cbu]))

  return {
    id: lote[0].id,
    numero: lote[0].numero,
    fecha: lote[0].fecha.toISOString().slice(0, 10),
    pagos: pagos.map((p) => ({ ...p, cbu: cbuMap.get(p.proveedorId) ?? null })),
  }
}

export type LoteCompleto = NonNullable<Awaited<ReturnType<typeof cargarLote>>>

const TIPO_CORTO: Record<string, string> = { FACTURA: 'FC', NOTA_CREDITO: 'NC', REMITO: 'RM' }

/** "OP 000123 FC A 0001-00004567 NC A 0001-00000089" — referencia que ve el proveedor en su banco. */
export function descripcionTransferencia(pago: LoteCompleto['pagos'][number]): string {
  const docs = pago.pago_documentos
    .map((pd) => [TIPO_CORTO[pd.documentos.tipo] ?? pd.documentos.tipo, pd.documentos.letra, pd.documentos.numeroCompleto].filter(Boolean).join(' '))
    .join(' ')
  return `OP ${formatNumeroOrden(pago.numero)} ${docs}`.trim()
}

export function filasGalicia(lote: LoteCompleto): GaliciaFila[] {
  return lote.pagos
    .filter((p) => p.cbu)
    // Galicia admite 12 caracteres de descripción: alcanza para el número de OP.
    .map((p) => ({ cbu: p.cbu!, monto: Number(p.montoTotal), descripcion: `OP ${p.numero}` }))
}

/** Un PDF con todas las órdenes del lote, cada una seguida de su comprobante. */
export async function pdfFinalLote(lote: LoteCompleto, cliente: { razonSocial: string; cuit: string }): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const pago of lote.pagos) {
    const bytes = await generatePaymentOrderPdf(pago, { clienteRazonSocial: cliente.razonSocial, clienteCuit: cliente.cuit })
    const src = await PDFDocument.load(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return out.save()
}

/** Separa un PDF en PDFs de una página. */
export async function separarPaginas(bytes: Uint8Array): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(bytes)
  const out: Uint8Array[] = []
  for (const i of src.getPageIndices()) {
    const doc = await PDFDocument.create()
    const [page] = await doc.copyPages(src, [i])
    doc.addPage(page!)
    out.push(await doc.save())
  }
  return out
}

export async function textoPdf(bytes: Uint8Array): Promise<string> {
  const mod = await import('pdf-parse')
  const pdfParse =
    (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default ??
    (mod as unknown as (b: Buffer) => Promise<{ text: string }>)
  return (await pdfParse(Buffer.from(bytes))).text
}
