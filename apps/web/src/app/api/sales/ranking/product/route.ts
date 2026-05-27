import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Detalle diario (con desglose por turno) de un producto vendido en un rango.
 * Query: codigo, from, to, sucursal?
 * Devuelve series por fecha con valores por turno.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const codigo = sp.get('codigo')
  if (!codigo) {
    return NextResponse.json({ error: 'codigo is required' }, { status: 400 })
  }
  // nombre desambigua cuando el código no es único (caso ****).
  const nombre = sp.get('nombre')
  const from = sp.get('from')
  const to = sp.get('to')
  const sucursal = sp.get('sucursal')

  const dateFilter: Record<string, Date> = {}
  if (from) dateFilter.gte = new Date(`${from}T00:00:00Z`)
  if (to) dateFilter.lte = new Date(`${to}T23:59:59Z`)

  const closureWhere: Record<string, unknown> = { clienteId: clienteId! }
  if (Object.keys(dateFilter).length > 0) closureWhere.fecha = dateFilter
  if (sucursal) closureWhere.sucursal = sucursal

  const itemsWhere: Record<string, unknown> = { codigo, closure: closureWhere }
  if (nombre) itemsWhere.nombre = nombre

  const items = await prisma.sales_closure_items.findMany({
    where: itemsWhere,
    select: {
      unidades: true,
      importe: true,
      nombre: true,
      rubroNombre: true,
      closure: {
        select: { fecha: true, turnoNombre: true },
      },
    },
  })

  if (items.length === 0) {
    return NextResponse.json({
      codigo,
      nombre: null,
      series: [],
      totals: { unidades: 0, importe: 0 },
      porTurno: { ALMUERZO: { unidades: 0, importe: 0 }, CENA: { unidades: 0, importe: 0 }, OTRO: { unidades: 0, importe: 0 } },
    })
  }

  // Agrupamos por fecha
  type Bucket = { ALMUERZO_u: number; ALMUERZO_i: number; CENA_u: number; CENA_i: number; OTRO_u: number; OTRO_i: number }
  const map = new Map<string, Bucket>()
  let totalU = 0
  let totalI = 0
  const porTurno = {
    ALMUERZO: { unidades: 0, importe: 0 },
    CENA: { unidades: 0, importe: 0 },
    OTRO: { unidades: 0, importe: 0 },
  }

  for (const it of items) {
    const key = it.closure.fecha.toISOString().slice(0, 10)
    const u = Number(it.unidades)
    const i = Number(it.importe)
    const t = it.closure.turnoNombre as 'ALMUERZO' | 'CENA' | 'OTRO'
    const cur = map.get(key) ?? {
      ALMUERZO_u: 0, ALMUERZO_i: 0, CENA_u: 0, CENA_i: 0, OTRO_u: 0, OTRO_i: 0,
    }
    cur[`${t}_u` as keyof Bucket] += u
    cur[`${t}_i` as keyof Bucket] += i
    map.set(key, cur)
    totalU += u
    totalI += i
    porTurno[t].unidades += u
    porTurno[t].importe += i
  }

  const series = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, b]) => ({
      fecha,
      ALMUERZO_u: b.ALMUERZO_u,
      ALMUERZO_i: b.ALMUERZO_i,
      CENA_u: b.CENA_u,
      CENA_i: b.CENA_i,
      OTRO_u: b.OTRO_u,
      OTRO_i: b.OTRO_i,
      unidades: b.ALMUERZO_u + b.CENA_u + b.OTRO_u,
      importe: b.ALMUERZO_i + b.CENA_i + b.OTRO_i,
    }))

  return NextResponse.json({
    codigo,
    nombre: items[0]?.nombre ?? null,
    rubroNombre: items[0]?.rubroNombre ?? null,
    series,
    totals: { unidades: totalU, importe: totalI },
    porTurno,
  })
}
