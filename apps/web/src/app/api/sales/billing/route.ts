import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Informe de facturación: Factura A electrónica, Factura B electrónica, Factura B.
 * Devuelve totales, % sobre total, y serie diaria.
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
    },
    orderBy: { fecha: 'asc' },
  })

  let totalA = 0, totalBe = 0, totalB = 0
  let cantA = 0, cantBe = 0, cantB = 0
  const daily = new Map<string, { fecha: string; facturaAElectronica: number; facturaBElectronica: number; facturaB: number }>()

  for (const c of closures) {
    const key = c.fecha.toISOString().slice(0, 10)
    const a = Number(c.facturaAElectronica ?? 0)
    const be = Number(c.facturaBElectronica ?? 0)
    const b = Number(c.facturaB ?? 0)
    totalA += a; totalBe += be; totalB += b
    cantA += c.cantFacturaAElectronica ?? 0
    cantBe += c.cantFacturaBElectronica ?? 0
    cantB += c.cantFacturaB ?? 0

    const cur = daily.get(key) ?? { fecha: key, facturaAElectronica: 0, facturaBElectronica: 0, facturaB: 0 }
    cur.facturaAElectronica += a
    cur.facturaBElectronica += be
    cur.facturaB += b
    daily.set(key, cur)
  }

  const total = totalA + totalBe + totalB
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  const series = Array.from(daily.values())
    .sort((x, y) => x.fecha.localeCompare(y.fecha))
    .map((d) => ({
      ...d,
      total: d.facturaAElectronica + d.facturaBElectronica + d.facturaB,
    }))

  return NextResponse.json({
    total,
    series,
    breakdown: [
      { tipo: 'Factura A Electrónica', key: 'facturaAElectronica', importe: totalA, cantidad: cantA, porcentaje: pct(totalA) },
      { tipo: 'Factura B Electrónica', key: 'facturaBElectronica', importe: totalBe, cantidad: cantBe, porcentaje: pct(totalBe) },
      { tipo: 'Factura B',             key: 'facturaB',            importe: totalB,  cantidad: cantB,  porcentaje: pct(totalB) },
    ],
  })
}
