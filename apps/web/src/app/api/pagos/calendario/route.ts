import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface CalendarRow {
  fecha_efectiva: Date
  pago_id: string
  numero: number
  estado: string
  tipo: string
  monto: number
  proveedor: string
}

export async function GET(request: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  if (!desde || !hasta) {
    return NextResponse.json(
      { error: 'Parámetros desde y hasta requeridos' },
      { status: 400 }
    )
  }

  const rows = await prisma.$queryRaw<CalendarRow[]>`
    SELECT
      CASE
        WHEN pm.tipo IN ('CHEQUE', 'ECHEQ') AND pm.meta->>'fecha' IS NOT NULL
          THEN (pm.meta->>'fecha')::date
        ELSE p.fecha
      END as fecha_efectiva,
      p.id as pago_id,
      p.numero,
      p.estado::text,
      pm.tipo::text,
      pm.monto::float,
      pr."razonSocial" as proveedor
    FROM pago_metodos pm
    JOIN pagos p ON pm."pagoId" = p.id
    JOIN proveedores pr ON p."proveedorId" = pr.id
    WHERE p."clienteId" = ${user.clienteId}::uuid
      AND p.estado IN ('BORRADOR', 'EMITIDA')
      AND CASE
        WHEN pm.tipo IN ('CHEQUE', 'ECHEQ') AND pm.meta->>'fecha' IS NOT NULL
          THEN (pm.meta->>'fecha')::date
        ELSE p.fecha
      END BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY fecha_efectiva ASC
  `

  // Agrupar por fecha
  const eventosPorFecha = new Map<string, {
    fecha: string
    total: number
    items: { pagoId: string; numero: number; proveedor: string; estado: string; monto: number; tipo: string }[]
  }>()

  for (const row of rows) {
    const fechaKey = new Date(row.fecha_efectiva).toISOString().split('T')[0]!
    if (!eventosPorFecha.has(fechaKey)) {
      eventosPorFecha.set(fechaKey, { fecha: fechaKey, total: 0, items: [] })
    }
    const evento = eventosPorFecha.get(fechaKey)!
    evento.total += row.monto
    evento.items.push({
      pagoId: row.pago_id,
      numero: row.numero,
      proveedor: row.proveedor,
      estado: row.estado,
      monto: row.monto,
      tipo: row.tipo,
    })
  }

  return NextResponse.json({
    eventos: Array.from(eventosPorFecha.values()),
  })
}
