import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { crearPagoTx } from '@/lib/pagos/crear-pago'

export const dynamic = 'force-dynamic'

/**
 * Pagar en lote — paso 1.
 *
 * GET: todos los proveedores con documentos a pagar (CONFIRMADO y fuera de
 * cualquier orden, misma regla que /api/pagos/documentos-pendientes), con sus
 * documentos y el CBU cargado. El usuario confirma uno por uno qué documentos
 * paga, igual que en el wizard.
 *
 * POST: crea un BORRADOR por proveedor con los documentos elegidos y una única
 * transferencia por el total. Después se revisan en la bandeja "A transferir".
 */
export async function GET() {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const rows = await prisma.$queryRaw<
    Array<{
      proveedor_id: string
      razon_social: string
      cuit: string | null
      cbu: string | null
      id: string
      tipo: string
      letra: string | null
      numero_completo: string | null
      fecha_emision: Date | null
      fecha_vencimiento: Date | null
      total: number | null
    }>
  >`
    SELECT p.id AS proveedor_id, p."razonSocial" AS razon_social, p.cuit, p.cbu,
           d.id, d.tipo::text AS tipo, d.letra, d."numeroCompleto" AS numero_completo,
           d."fechaEmision" AS fecha_emision, d."fechaVencimiento" AS fecha_vencimiento,
           d.total::float AS total
    FROM documentos d
    JOIN proveedores p ON p.id = d."proveedorId"
    WHERE d."clienteId" = ${user.clienteId}::uuid
      AND d."estadoRevision" = 'CONFIRMADO'
      AND NOT EXISTS (SELECT 1 FROM pago_documentos pd WHERE pd."documentoId" = d.id)
    ORDER BY p."razonSocial" ASC, d."fechaEmision" ASC NULLS LAST
  `

  const map = new Map<
    string,
    {
      proveedor: { id: string; razonSocial: string; cuit: string | null; cbu: string | null }
      documentos: Array<{
        id: string
        tipo: string
        letra: string | null
        numeroCompleto: string | null
        fechaEmision: string | null
        fechaVencimiento: string | null
        total: number
      }>
    }
  >()
  for (const r of rows) {
    let g = map.get(r.proveedor_id)
    if (!g) {
      g = { proveedor: { id: r.proveedor_id, razonSocial: r.razon_social, cuit: r.cuit, cbu: r.cbu }, documentos: [] }
      map.set(r.proveedor_id, g)
    }
    g.documentos.push({
      id: r.id,
      tipo: r.tipo,
      letra: r.letra,
      numeroCompleto: r.numero_completo,
      fechaEmision: r.fecha_emision ? r.fecha_emision.toISOString().slice(0, 10) : null,
      fechaVencimiento: r.fecha_vencimiento ? r.fecha_vencimiento.toISOString().slice(0, 10) : null,
      total: r.total ?? 0,
    })
  }

  return NextResponse.json({ proveedores: [...map.values()] })
}

const loteSchema = z.object({
  fecha: z.string().transform((s) => new Date(s)),
  items: z
    .array(
      z.object({
        proveedorId: z.string().uuid(),
        documentoIds: z.array(z.string().uuid()).min(1),
      })
    )
    .min(1)
    .max(100),
})

export async function POST(request: NextRequest) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS, 'edit')
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }
  const clienteId = user.clienteId

  let data: z.infer<typeof loteSchema>
  try {
    data = loteSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  // Validar todos los documentos de una vez: del proveedor indicado,
  // confirmados y fuera de cualquier orden.
  const allIds = data.items.flatMap((i) => i.documentoIds)
  if (new Set(allIds).size !== allIds.length) {
    return NextResponse.json({ error: 'Hay documentos repetidos' }, { status: 400 })
  }
  const docs = await prisma.$queryRaw<Array<{ id: string; proveedor_id: string; total: number | null; en_pago: boolean }>>`
    SELECT d.id, d."proveedorId" AS proveedor_id, d.total::float AS total,
           EXISTS (SELECT 1 FROM pago_documentos pd WHERE pd."documentoId" = d.id) AS en_pago
    FROM documentos d
    WHERE d.id = ANY(${allIds}::uuid[])
      AND d."clienteId" = ${clienteId}::uuid
      AND d."estadoRevision" = 'CONFIRMADO'
  `
  const docMap = new Map(docs.map((d) => [d.id, d]))
  for (const item of data.items) {
    for (const id of item.documentoIds) {
      const d = docMap.get(id)
      if (!d || d.proveedor_id !== item.proveedorId) {
        return NextResponse.json({ error: 'Algunos documentos no son válidos o ya no están pendientes' }, { status: 400 })
      }
      if (d.en_pago) {
        return NextResponse.json({ error: 'Algunos documentos ya están en otra orden de pago' }, { status: 409 })
      }
    }
    const total = item.documentoIds.reduce((s, id) => s + (docMap.get(id)!.total ?? 0), 0)
    if (total <= 0) {
      return NextResponse.json({ error: 'Cada orden debe tener un total mayor a cero' }, { status: 400 })
    }
  }

  const ids = await prisma.$transaction(async (tx) => {
    const out: string[] = []
    for (const item of data.items) {
      const documentos = item.documentoIds.map((id) => ({
        documentoId: id,
        montoAplicado: docMap.get(id)!.total ?? 0,
      }))
      const total = Math.round(documentos.reduce((s, d) => s + d.montoAplicado, 0) * 100) / 100
      out.push(
        await crearPagoTx(tx, {
          clienteId,
          proveedorId: item.proveedorId,
          fecha: data.fecha,
          emitir: false,
          documentos,
          metodos: [{ tipo: 'TRANSFERENCIA', monto: total, fecha: data.fecha.toISOString() }],
        })
      )
    }
    return out
  }, { timeout: 60_000 })

  return NextResponse.json({ pagoIds: ids }, { status: 201 })
}
