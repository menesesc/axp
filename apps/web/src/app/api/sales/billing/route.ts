import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Informe de facturación: Factura A elec, B elec, B + Notas de crédito.
 * Total neto = Σ facturas + Σ NC (NC son negativas) → equivale a totalVentas.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const sucursal = sp.get('sucursal')

  const dateFilter: Record<string, Date> = {}
  if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`)
  if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`)

  const where: Record<string, unknown> = { clienteId: clienteId! }
  if (Object.keys(dateFilter).length > 0) where.fecha = dateFilter
  if (sucursal) where.sucursal = sucursal

  const closures = await prisma.sales_closures.findMany({
    where,
    select: {
      fecha: true,
      facturaAElectronica: true,
      cantFacturaAElectronica: true,
      facturaBElectronica: true,
      cantFacturaBElectronica: true,
      facturaB: true,
      cantFacturaB: true,
      notaCreditoAElectronica: true,
      cantNotaCreditoAElectronica: true,
      notaCreditoBElectronica: true,
      cantNotaCreditoBElectronica: true,
      notaCreditoB: true,
      cantNotaCreditoB: true,
    },
    orderBy: { fecha: 'asc' },
  })

  // Acumuladores
  const acc = {
    facturaAElectronica: 0, cantFacturaAElectronica: 0,
    facturaBElectronica: 0, cantFacturaBElectronica: 0,
    facturaB: 0, cantFacturaB: 0,
    notaCreditoAElectronica: 0, cantNotaCreditoAElectronica: 0,
    notaCreditoBElectronica: 0, cantNotaCreditoBElectronica: 0,
    notaCreditoB: 0, cantNotaCreditoB: 0,
  }

  type DailyRow = {
    fecha: string
    facturaAElectronica: number
    facturaBElectronica: number
    facturaB: number
    notaCreditoAElectronica: number
    notaCreditoBElectronica: number
    notaCreditoB: number
  }
  const daily = new Map<string, DailyRow>()

  for (const c of closures) {
    const key = c.fecha.toISOString().slice(0, 10)
    const a = Number(c.facturaAElectronica ?? 0)
    const be = Number(c.facturaBElectronica ?? 0)
    const b = Number(c.facturaB ?? 0)
    const nca = Number(c.notaCreditoAElectronica ?? 0)
    const ncbe = Number(c.notaCreditoBElectronica ?? 0)
    const ncb = Number(c.notaCreditoB ?? 0)

    acc.facturaAElectronica += a; acc.cantFacturaAElectronica += c.cantFacturaAElectronica ?? 0
    acc.facturaBElectronica += be; acc.cantFacturaBElectronica += c.cantFacturaBElectronica ?? 0
    acc.facturaB += b; acc.cantFacturaB += c.cantFacturaB ?? 0
    acc.notaCreditoAElectronica += nca; acc.cantNotaCreditoAElectronica += c.cantNotaCreditoAElectronica ?? 0
    acc.notaCreditoBElectronica += ncbe; acc.cantNotaCreditoBElectronica += c.cantNotaCreditoBElectronica ?? 0
    acc.notaCreditoB += ncb; acc.cantNotaCreditoB += c.cantNotaCreditoB ?? 0

    const cur = daily.get(key) ?? {
      fecha: key,
      facturaAElectronica: 0,
      facturaBElectronica: 0,
      facturaB: 0,
      notaCreditoAElectronica: 0,
      notaCreditoBElectronica: 0,
      notaCreditoB: 0,
    }
    cur.facturaAElectronica += a
    cur.facturaBElectronica += be
    cur.facturaB += b
    cur.notaCreditoAElectronica += nca
    cur.notaCreditoBElectronica += ncbe
    cur.notaCreditoB += ncb
    daily.set(key, cur)
  }

  const totalFacturas = acc.facturaAElectronica + acc.facturaBElectronica + acc.facturaB
  const totalNotasCredito = acc.notaCreditoAElectronica + acc.notaCreditoBElectronica + acc.notaCreditoB // negativo o 0
  const totalNeto = totalFacturas + totalNotasCredito
  const pct = (v: number) => (totalFacturas > 0 ? (v / totalFacturas) * 100 : 0)

  const series = Array.from(daily.values())
    .sort((x, y) => x.fecha.localeCompare(y.fecha))
    .map((d) => ({
      ...d,
      totalFacturas: d.facturaAElectronica + d.facturaBElectronica + d.facturaB,
      totalNotasCredito: d.notaCreditoAElectronica + d.notaCreditoBElectronica + d.notaCreditoB,
      totalNeto:
        d.facturaAElectronica + d.facturaBElectronica + d.facturaB +
        d.notaCreditoAElectronica + d.notaCreditoBElectronica + d.notaCreditoB,
    }))

  return NextResponse.json({
    totalNeto,
    totalFacturas,
    totalNotasCredito,
    series,
    breakdown: [
      { tipo: 'Factura A Electrónica', key: 'facturaAElectronica', importe: acc.facturaAElectronica, cantidad: acc.cantFacturaAElectronica, porcentaje: pct(acc.facturaAElectronica), kind: 'factura' },
      { tipo: 'Factura B Electrónica', key: 'facturaBElectronica', importe: acc.facturaBElectronica, cantidad: acc.cantFacturaBElectronica, porcentaje: pct(acc.facturaBElectronica), kind: 'factura' },
      { tipo: 'Factura B',             key: 'facturaB',            importe: acc.facturaB,            cantidad: acc.cantFacturaB,            porcentaje: pct(acc.facturaB),            kind: 'factura' },
      { tipo: 'N. Crédito A Electrónica', key: 'notaCreditoAElectronica', importe: acc.notaCreditoAElectronica, cantidad: acc.cantNotaCreditoAElectronica, porcentaje: pct(acc.notaCreditoAElectronica), kind: 'credito' },
      { tipo: 'N. Crédito B Electrónica', key: 'notaCreditoBElectronica', importe: acc.notaCreditoBElectronica, cantidad: acc.cantNotaCreditoBElectronica, porcentaje: pct(acc.notaCreditoBElectronica), kind: 'credito' },
      { tipo: 'N. Crédito B',             key: 'notaCreditoB',            importe: acc.notaCreditoB,            cantidad: acc.cantNotaCreditoB,            porcentaje: pct(acc.notaCreditoB),            kind: 'credito' },
    ],
  })
}
