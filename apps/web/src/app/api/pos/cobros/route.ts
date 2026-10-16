import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * El cobro de una mesa.
 *
 * Un consumo se paga de muchas formas a la vez: mitad en efectivo y mitad
 * con tarjeta es lo más común del mundo. Por eso el cobro tiene varios
 * pagos, y lo que cierra la mesa es que la suma llegue al total, no que haya
 * un pago.
 *
 * La propina va aparte del importe: no forma parte de la venta ni de la
 * factura, pero sí del arqueo, porque el cajero la tiene en la caja.
 *
 * La factura electrónica todavía no se emite acá: eso llega con Factukey, y
 * el comprobante se va a enganchar a este mismo cobro.
 */

const FORMAS = ['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'qr', 'transferencia', 'cuenta_corriente', 'otro']

interface PagoEntrada {
  forma?: string
  importe?: number
  propina?: number
  referencia?: string | null
  clienteCtaCte?: string | null
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { pedidoId?: string; pagos?: PagoEntrada[]; sinComprobante?: boolean; usuarioId?: string | null }
    | null
  if (!b?.pedidoId) return NextResponse.json({ error: 'Falta el pedido' }, { status: 400 })

  const pagos = (b.pagos ?? [])
    .filter((p) => p.forma && FORMAS.includes(p.forma) && (p.importe ?? 0) > 0)
    .map((p) => ({
      forma: p.forma!,
      importe: Math.round((p.importe ?? 0) * 100) / 100,
      propina: Math.max(0, Math.round((p.propina ?? 0) * 100) / 100),
      referencia: p.referencia?.trim()?.slice(0, 100) || null,
      clienteCtaCte: p.clienteCtaCte?.trim()?.slice(0, 150) || null,
    }))
  if (pagos.length === 0) return NextResponse.json({ error: 'Cargá al menos un pago' }, { status: 400 })

  const [pedido] = await prisma.$queryRaw<Array<{ id: string; estado: string; total: number }>>`
    SELECT id, estado, total::float8 AS total FROM pos_pedidos
     WHERE id = ${b.pedidoId}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (pedido.estado === 'cerrado') return NextResponse.json({ error: 'La mesa ya está cobrada' }, { status: 409 })
  if (pedido.estado === 'anulado') return NextResponse.json({ error: 'El pedido está anulado' }, { status: 409 })

  const cobrado = pagos.reduce((s, p) => s + p.importe, 0)
  // Un peso de diferencia es redondeo, no una falta de pago: los decimales se
  // redondean en el ticket y nadie paga centavos.
  if (cobrado + 1 < pedido.total) {
    return NextResponse.json(
      { error: `Falta cobrar $${Math.round(pedido.total - cobrado).toLocaleString('es-AR')}` },
      { status: 400 }
    )
  }

  const cobroId = crypto.randomUUID()
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        INSERT INTO pos_cobros (id, "pedidoId", alcance, monto, "sinComprobante", "usuarioId")
        VALUES (${cobroId}::uuid, ${b.pedidoId}::uuid, 'items', ${pedido.total},
                ${b.sinComprobante ?? false}, ${b.usuarioId || null}::uuid)
      `
      for (const p of pagos) {
        await tx.$executeRaw`
          INSERT INTO pos_pagos (id, "cobroId", forma, importe, moneda, cotizacion, "importeArs", propina, referencia, "clienteCtaCte")
          VALUES (gen_random_uuid(), ${cobroId}::uuid, ${p.forma}, ${p.importe}, 'ARS', 1, ${p.importe},
                  ${p.propina}, ${p.referencia}, ${p.clienteCtaCte})
        `
      }
      await tx.$executeRaw`
        UPDATE pos_pedidos SET estado = 'cerrado', "cerradoAt" = now() WHERE id = ${b.pedidoId}::uuid
      `
    },
    { timeout: 15_000 }
  )

  return NextResponse.json({
    id: cobroId,
    total: pedido.total,
    cobrado,
    vuelto: Math.round((cobrado - pedido.total) * 100) / 100,
  })
}
