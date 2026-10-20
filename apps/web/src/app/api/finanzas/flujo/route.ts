import { NextRequest, NextResponse } from 'next/server'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Lo que entra y lo que sale, día por día.
 *
 * Finanzas mostraba sólo pagos: la mitad de la película. Sin las ventas al
 * lado, "este mes pagué doce millones" no dice si el mes estuvo bien o mal.
 *
 * Entra: los cierres de caja (Maxirest) y, cuando se venda con el POS
 * propio, los cobros de las mesas. Hoy no se pisan —el cierre de Maxirest no
 * conoce las ventas del POS— así que se suman.
 *
 * Sale: lo que efectivamente movió la cuenta. Un cheque entregado sale el
 * día que se debita, no el día que se firmó, y por eso la fecha efectiva se
 * calcula igual que en el calendario.
 */

const TZ = 'America/Argentina/Buenos_Aires'

interface Dia {
  fecha: string
  ventas: number
  pos: number
  efectivo: number
  tarjetas: number
  ctaCte: number
  pagado: number
  comprometido: number
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO)
  if (error) return error
  if (!user?.clienteId) return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })

  const desde = request.nextUrl.searchParams.get('desde')
  const hasta = request.nextUrl.searchParams.get('hasta')
  if (!desde || !hasta) {
    return NextResponse.json({ error: 'Parámetros desde y hasta requeridos' }, { status: 400 })
  }

  const clienteId = user.clienteId

  const [ventas, pos, egresos] = await Promise.all([
    prisma.$queryRaw<Array<{ fecha: string; ventas: number; efectivo: number; tarjetas: number; ctaCte: number }>>`
      SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha,
             COALESCE(sum("totalVentas"), 0)::float8 AS ventas,
             COALESCE(sum(efectivo), 0)::float8 AS efectivo,
             COALESCE(sum(tarjetas), 0)::float8 AS tarjetas,
             COALESCE(sum("ctaCte"), 0)::float8 AS "ctaCte"
        FROM sales_closures
       WHERE "clienteId" = ${clienteId}::uuid AND fecha BETWEEN ${desde}::date AND ${hasta}::date
       GROUP BY fecha
    `,
    prisma.$queryRaw<Array<{ fecha: string; pos: number }>>`
      SELECT to_char((p."cerradoAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS fecha,
             COALESCE(sum(g."importeArs"), 0)::float8 AS pos
        FROM pos_pagos g
        JOIN pos_cobros c ON c.id = g."cobroId"
        JOIN pos_pedidos p ON p.id = c."pedidoId"
       WHERE p."clienteId" = ${clienteId}::uuid
         AND p.estado = 'cerrado'
         AND (p."cerradoAt" AT TIME ZONE ${TZ})::date BETWEEN ${desde}::date AND ${hasta}::date
       GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ fecha: string; pagado: number; comprometido: number }>>`
      SELECT to_char(
               CASE
                 WHEN pm.tipo IN ('CHEQUE', 'ECHEQ') AND pm.meta->>'fecha' IS NOT NULL
                   THEN (pm.meta->>'fecha')::date
                 ELSE p.fecha
               END, 'YYYY-MM-DD') AS fecha,
             COALESCE(sum(CASE WHEN p.estado = 'PAGADO' THEN pm.monto ELSE 0 END), 0)::float8 AS pagado,
             COALESCE(sum(CASE WHEN p.estado IN ('BORRADOR', 'EMITIDA') THEN pm.monto ELSE 0 END), 0)::float8 AS comprometido
        FROM pago_metodos pm
        JOIN pagos p ON pm."pagoId" = p.id
       WHERE p."clienteId" = ${clienteId}::uuid
         AND p.estado IN ('BORRADOR', 'EMITIDA', 'PAGADO')
         AND CASE
               WHEN pm.tipo IN ('CHEQUE', 'ECHEQ') AND pm.meta->>'fecha' IS NOT NULL
                 THEN (pm.meta->>'fecha')::date
               ELSE p.fecha
             END BETWEEN ${desde}::date AND ${hasta}::date
       GROUP BY 1
    `,
  ])

  const dias = new Map<string, Dia>()
  const dia = (f: string) => {
    let d = dias.get(f)
    if (!d) {
      d = { fecha: f, ventas: 0, pos: 0, efectivo: 0, tarjetas: 0, ctaCte: 0, pagado: 0, comprometido: 0 }
      dias.set(f, d)
    }
    return d
  }
  for (const v of ventas) Object.assign(dia(v.fecha), { ventas: v.ventas, efectivo: v.efectivo, tarjetas: v.tarjetas, ctaCte: v.ctaCte })
  for (const p of pos) dia(p.fecha).pos = p.pos
  for (const e of egresos) Object.assign(dia(e.fecha), { pagado: e.pagado, comprometido: e.comprometido })

  const lista = [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const suma = (f: (d: Dia) => number) => lista.reduce((s, d) => s + f(d), 0)
  const conVenta = lista.filter((d) => d.ventas + d.pos > 0)

  return NextResponse.json({
    dias: lista,
    resumen: {
      ingresos: suma((d) => d.ventas + d.pos),
      ventas: suma((d) => d.ventas),
      pos: suma((d) => d.pos),
      efectivo: suma((d) => d.efectivo),
      tarjetas: suma((d) => d.tarjetas),
      ctaCte: suma((d) => d.ctaCte),
      pagado: suma((d) => d.pagado),
      comprometido: suma((d) => d.comprometido),
      // El promedio se calcula sobre los días que hubo servicio: dividir por
      // 30 cuando se abre 22 miente hacia abajo.
      diasConVenta: conVenta.length,
      promedioDia: conVenta.length ? suma((d) => d.ventas + d.pos) / conVenta.length : 0,
    },
  })
}
