import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { jsonImportes } from '@/lib/importes'
import { SECCION } from '@/lib/permisos'
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
  const { user, error, verImportes } = await requireSeccion(SECCION.FINANZAS_CALENDARIO)
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')
  // El calendario muestra todo lo que mueve la cuenta, incluidas las
  // transferencias ya pagadas. El widget de "próximos pagos" del inicio pide
  // `pendientes=1`, porque ahí lo que importa es lo que falta pagar.
  const soloPendientes = searchParams.get('pendientes') === '1'

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
      -- Un cheque o eCheq entregado (orden PAGADO) se debita recién en su
      -- fecha, así que va al día que corresponde y no al de la orden.
      AND (
        p.estado IN ('BORRADOR', 'EMITIDA')
        OR (p.estado = 'PAGADO' AND (NOT ${soloPendientes} OR pm.tipo IN ('CHEQUE', 'ECHEQ')))
      )
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

  return jsonImportes({
    eventos: Array.from(eventosPorFecha.values()),
  }, !!verImportes)
}
