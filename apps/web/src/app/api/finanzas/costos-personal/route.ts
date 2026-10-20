import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * El costo de personal por mes.
 *
 * Lo puede traer Presentia o cargarlo alguien a mano: mientras la
 * integración no esté conectada, un número cargado una vez por mes ya hace
 * que el resultado de caja deje de mentir.
 *
 * `periodo` es el mes trabajado y `fechaPago` el día en que sale la plata.
 * No son el mismo mes, y para el flujo importa el segundo.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO)
  if (error) return error

  const desde = request.nextUrl.searchParams.get('desde')
  const hasta = request.nextUrl.searchParams.get('hasta')

  const filas = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, to_char(periodo, 'YYYY-MM') AS periodo, concepto, importe::float8 AS importe,
           empleados, to_char("fechaPago", 'YYYY-MM-DD') AS "fechaPago", pagado, origen
      FROM costos_personal
     WHERE "clienteId" = ${clienteId}::uuid
       AND (${desde}::date IS NULL OR periodo >= date_trunc('month', ${desde}::date))
       AND (${hasta}::date IS NULL OR periodo <= ${hasta}::date)
     ORDER BY periodo DESC, concepto
  `
  return NextResponse.json({ costos: filas })
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { periodo?: string; concepto?: string; importe?: number; empleados?: number | null; fechaPago?: string | null; pagado?: boolean }
    | null
  if (!b?.periodo || !/^\d{4}-\d{2}$/.test(b.periodo)) {
    return NextResponse.json({ error: 'Período inválido (YYYY-MM)' }, { status: 400 })
  }
  if (!(Number(b.importe) > 0)) return NextResponse.json({ error: 'Poné el importe' }, { status: 400 })

  const concepto = b.concepto?.trim()?.slice(0, 60) || 'Sueldos'
  // Si no dicen cuándo se paga, el 5 del mes siguiente, que es lo habitual.
  const [a, m] = b.periodo.split('-').map(Number) as [number, number]
  const fechaPago = b.fechaPago || new Date(Date.UTC(a, m, 5)).toISOString().slice(0, 10)

  await prisma.$executeRaw`
    INSERT INTO costos_personal ("clienteId", periodo, concepto, importe, empleados, "fechaPago", pagado, origen)
    VALUES (${clienteId}::uuid, ${`${b.periodo}-01`}::date, ${concepto}, ${b.importe}, ${b.empleados ?? null},
            ${fechaPago}::date, ${b.pagado ?? false}, 'manual')
    ON CONFLICT ("clienteId", periodo, concepto, origen) DO UPDATE SET
      importe = EXCLUDED.importe, empleados = EXCLUDED.empleados,
      "fechaPago" = EXCLUDED."fechaPago", pagado = EXCLUDED.pagado, "updatedAt" = now()
  `
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.FINANZAS_CALENDARIO, 'edit')
  if (error) return error
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  await prisma.$executeRaw`
    DELETE FROM costos_personal WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}
