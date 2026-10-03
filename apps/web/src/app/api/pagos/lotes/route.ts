import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'
import { cbusDelCliente, cbuValido } from '@/lib/proveedores/cbu'
import { listarLotes } from '@/lib/pagos/lotes'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }
  return NextResponse.json({ lotes: await listarLotes(user.clienteId) })
}

const schema = z.object({ pagoIds: z.array(z.string().uuid()).min(1).max(200) })

/**
 * Arma un lote con borradores seleccionados: los emite (documentos → PAGADO,
 * igual que al emitir una orden suelta) y los agrupa para generar el archivo
 * del banco. Todo o nada: si alguno no está listo, no se crea el lote.
 */
export async function POST(request: NextRequest) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_PAGOS, 'edit')
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }
  const clienteId = user.clienteId

  let pagoIds: string[]
  try {
    pagoIds = schema.parse(await request.json()).pagoIds
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const [pagos, cbus] = await Promise.all([
    prisma.pagos.findMany({
      where: { id: { in: pagoIds }, clienteId },
      include: {
        proveedores: { select: { razonSocial: true } },
        pago_documentos: { select: { documentoId: true } },
        pago_metodos: { select: { tipo: true, monto: true } },
      },
    }),
    cbusDelCliente(clienteId),
  ])
  if (pagos.length !== pagoIds.length) {
    return NextResponse.json({ error: 'Algunas órdenes no existen' }, { status: 404 })
  }

  for (const p of pagos) {
    const nombre = p.proveedores.razonSocial
    const cbu = cbus.get(p.proveedorId)
    const totalMetodos = p.pago_metodos.reduce((s, m) => s + Number(m.monto), 0)
    const problema =
      p.estado !== 'BORRADOR' ? 'ya no es borrador'
      : p.pago_documentos.length === 0 ? 'no tiene documentos'
      : !cbu || !cbuValido(cbu) ? 'el proveedor no tiene un CBU válido'
      : p.pago_metodos.length === 0 || p.pago_metodos.some((m) => m.tipo !== 'TRANSFERENCIA') ? 'tiene medios de pago que no son transferencia'
      : Math.abs(totalMetodos - Number(p.montoTotal)) > 0.01 ? 'las formas de pago no suman el total'
      : null
    if (problema) {
      return NextResponse.json({ error: `OP ${p.numero} (${nombre}): ${problema}` }, { status: 400 })
    }
  }

  const loteId = await prisma.$transaction(async (tx) => {
    const last = await tx.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(numero) AS max FROM pago_lotes WHERE "clienteId" = ${clienteId}::uuid
    `
    const numero = (last[0]?.max ?? 0) + 1
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pago_lotes ("clienteId", numero) VALUES (${clienteId}::uuid, ${numero}) RETURNING id
    `
    const id = inserted[0]!.id
    // El estado se re-chequea en el UPDATE para no emitir dos veces si otro
    // usuario armó un lote con la misma orden en paralelo.
    const n = await tx.$executeRaw`
      UPDATE pagos SET estado = 'EMITIDA'::"EstadoPago", "loteId" = ${id}::uuid, "updatedAt" = NOW()
      WHERE id = ANY(${pagoIds}::uuid[]) AND "clienteId" = ${clienteId}::uuid AND estado = 'BORRADOR'
    `
    if (n !== pagoIds.length) throw new Error('CONCURRENCIA')
    const docIds = pagos.flatMap((p) => p.pago_documentos.map((d) => d.documentoId))
    await tx.$executeRaw`
      UPDATE documentos SET "estadoRevision" = 'PAGADO'::"EstadoRevision", "updatedAt" = NOW()
      WHERE id = ANY(${docIds}::uuid[])
    `
    return id
  }).catch((e) => {
    if (e instanceof Error && e.message === 'CONCURRENCIA') return null
    throw e
  })

  if (!loteId) {
    return NextResponse.json({ error: 'Algunas órdenes cambiaron mientras se armaba el lote. Recargá y volvé a intentar.' }, { status: 409 })
  }
  return NextResponse.json({ loteId }, { status: 201 })
}
