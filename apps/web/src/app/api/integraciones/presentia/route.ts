import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { descifrar } from '@/lib/cripto'
import { costosDePresentia, fechaDePago, type ConfigPresentia } from '@/lib/integraciones/presentia'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Trae de Presentia el costo de personal y lo guarda.
 *
 * Se guarda acá y no se consulta en vivo: el flujo de caja se mira todos los
 * días y no puede depender de que el otro sistema esté arriba. Además, el
 * sueldo de un mes cerrado no cambia.
 *
 * Con `probar=1` no guarda nada: sólo dice si la conexión anda y qué trajo.
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { desde?: string; hasta?: string; probar?: boolean }
    | null

  const [cfg] = await prisma.$queryRaw<
    Array<{ baseUrl: string | null; apiKeyEnc: string | null; config: ConfigPresentia }>
  >`
    SELECT "baseUrl", "apiKeyEnc", config FROM integraciones
     WHERE "clienteId" = ${clienteId}::uuid AND sistema = 'presentia'
  `
  if (!cfg?.baseUrl) return NextResponse.json({ error: 'Falta la URL de Presentia' }, { status: 400 })
  const apiKey = descifrar(cfg.apiKeyEnc)
  if (!apiKey) return NextResponse.json({ error: 'Falta la clave de API' }, { status: 400 })

  // Por defecto, los últimos seis meses: alcanza para el gráfico y no hace
  // trabajar de más al otro sistema.
  const hoy = new Date()
  const hasta = b?.hasta || hoy.toISOString().slice(0, 10)
  const desde =
    b?.desde || new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 5, 1)).toISOString().slice(0, 10)

  let costos
  try {
    costos = await costosDePresentia(cfg.baseUrl, apiKey, desde, hasta, cfg.config ?? {})
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300)
    await prisma.$executeRaw`
      UPDATE integraciones SET "ultimoError" = ${msg}, "updatedAt" = now()
       WHERE "clienteId" = ${clienteId}::uuid AND sistema = 'presentia'
    `
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (b?.probar) {
    return NextResponse.json({ ok: true, periodos: costos.length, muestra: costos.slice(0, 3) })
  }

  const diaPago = Number(cfg.config?.diaPago ?? 5)
  for (const c of costos) {
    await prisma.$executeRaw`
      INSERT INTO costos_personal ("clienteId", periodo, concepto, importe, empleados, "fechaPago", origen, "externoId")
      VALUES (${clienteId}::uuid, ${`${c.periodo}-01`}::date, 'Sueldos', ${c.importe}, ${c.empleados},
              ${fechaDePago(c.periodo, diaPago)}::date, 'presentia', ${c.periodo})
      ON CONFLICT ("clienteId", periodo, concepto, origen) DO UPDATE SET
        importe = EXCLUDED.importe,
        empleados = EXCLUDED.empleados,
        "fechaPago" = EXCLUDED."fechaPago",
        "updatedAt" = now()
    `
  }

  await prisma.$executeRaw`
    UPDATE integraciones SET "ultimaSync" = now(), "ultimoError" = NULL, "updatedAt" = now()
     WHERE "clienteId" = ${clienteId}::uuid AND sistema = 'presentia'
  `
  return NextResponse.json({ ok: true, periodos: costos.length })
}
