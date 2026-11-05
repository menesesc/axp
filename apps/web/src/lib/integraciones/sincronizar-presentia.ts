import { prisma } from '@/lib/prisma'
import { descifrar } from '@/lib/cripto'
import {
  costosDePresentia,
  fechaDePago,
  movimientosDePresentia,
  type ConfigPresentia,
} from './presentia'

/**
 * Trae de Presentia el costo de personal y la plata que salió por la nómina,
 * y lo guarda.
 *
 * Se guarda acá y no se consulta en vivo: el flujo de caja se mira todos los
 * días y no puede depender de que el otro sistema esté arriba.
 *
 * Dos cosas distintas:
 *  - el costo por mes trabajado (/payroll/monthly), que es la referencia de
 *    cuánto cuesta el personal;
 *  - los movimientos (/payroll/movements), cada adelanto y cada saldo pagado
 *    en su día, que es lo que usa el flujo de caja.
 *
 * Los movimientos se reemplazan enteros en el rango pedido: un adelanto que
 * se borró en Presentia tiene que desaparecer acá también, y comparar fila
 * por fila sin un id estable no tiene sentido.
 */
export async function sincronizarPresentia(
  clienteId: string,
  opts: { desde?: string; hasta?: string; probar?: boolean } = {}
): Promise<{ periodos: number; movimientos: number; muestra?: unknown }> {
  const [cfg] = await prisma.$queryRaw<
    Array<{ baseUrl: string | null; apiKeyEnc: string | null; config: ConfigPresentia }>
  >`
    SELECT "baseUrl", "apiKeyEnc", config FROM integraciones
     WHERE "clienteId" = ${clienteId}::uuid AND sistema = 'presentia'
  `
  if (!cfg?.baseUrl) throw new Error('Falta la URL de Presentia')
  const apiKey = descifrar(cfg.apiKeyEnc)
  if (!apiKey) throw new Error('Falta la clave de API')

  // Por defecto, desde el primero de hace seis meses hasta hoy.
  const hoy = new Date()
  const hasta = opts.hasta || hoy.toISOString().slice(0, 10)
  const desde =
    opts.desde || new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 5, 1)).toISOString().slice(0, 10)

  try {
    const [costos, movimientos] = await Promise.all([
      costosDePresentia(cfg.baseUrl, apiKey, desde, hasta, cfg.config ?? {}),
      movimientosDePresentia(cfg.baseUrl, apiKey, desde, hasta, cfg.config ?? {}),
    ])

    if (opts.probar) {
      return { periodos: costos.length, movimientos: movimientos.length, muestra: movimientos.slice(0, 3) }
    }

    const diaPago = Number(cfg.config?.diaPago ?? 5)
    await prisma.$transaction(
      async (tx) => {
        for (const c of costos) {
          await tx.$executeRaw`
            INSERT INTO costos_personal ("clienteId", periodo, concepto, importe, empleados, "fechaPago", origen, "externoId")
            VALUES (${clienteId}::uuid, ${`${c.periodo}-01`}::date, 'Sueldos', ${c.importe}, ${c.empleados},
                    ${fechaDePago(c.periodo, diaPago)}::date, 'presentia', ${c.periodo})
            ON CONFLICT ("clienteId", periodo, concepto, origen) DO UPDATE SET
              importe = EXCLUDED.importe, empleados = EXCLUDED.empleados,
              "fechaPago" = EXCLUDED."fechaPago", "updatedAt" = now()
          `
        }

        await tx.$executeRaw`
          DELETE FROM pagos_personal
           WHERE "clienteId" = ${clienteId}::uuid AND origen = 'presentia'
             AND fecha BETWEEN ${desde}::date AND ${hasta}::date
        `
        for (const m of movimientos) {
          await tx.$executeRaw`
            INSERT INTO pagos_personal ("clienteId", fecha, periodo, tipo, subtipo, metodo, importe,
                                        "empleadoId", empleado, descripcion, origen)
            VALUES (${clienteId}::uuid, ${m.date}::date, ${m.period?.slice(0, 7) ?? null}, ${m.kind},
                    ${m.type?.slice(0, 30) ?? null}, ${m.method}, ${m.amount},
                    ${m.employee?.id ?? null}, ${m.employee?.name?.slice(0, 150) ?? null},
                    ${m.description?.slice(0, 200) ?? null}, 'presentia')
          `
        }
      },
      // Seis meses de nómina son cientos de filas, y el pooler agrega
      // latencia a cada insert: el default de 5 s no alcanza.
      { timeout: 60_000 }
    )

    await prisma.$executeRaw`
      UPDATE integraciones SET "ultimaSync" = now(), "ultimoError" = NULL, "updatedAt" = now()
       WHERE "clienteId" = ${clienteId}::uuid AND sistema = 'presentia'
    `
    return { periodos: costos.length, movimientos: movimientos.length }
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300)
    await prisma.$executeRaw`
      UPDATE integraciones SET "ultimoError" = ${msg}, "updatedAt" = now()
       WHERE "clienteId" = ${clienteId}::uuid AND sistema = 'presentia'
    `
    throw e
  }
}

/**
 * Sincroniza si hace más de `horas` que no se hace, sin esperar.
 *
 * Lo llama el flujo de caja: así los sueldos están al día sin que nadie
 * tenga que acordarse de apretar "Sincronizar". No bloquea la pantalla; si
 * falla, el error queda en la integración y se ve en Configuración.
 */
export async function sincronizarSiHaceFalta(clienteId: string, horas = 6): Promise<void> {
  // También si todavía no hay ningún movimiento guardado: es el caso de la
  // primera vez, o de una instalación que sólo había sincronizado el costo
  // por mes, y no tiene sentido esperar seis horas para mostrar sueldos.
  const [i] = await prisma.$queryRaw<Array<{ vieja: boolean }>>`
    SELECT ("ultimaSync" IS NULL
            OR "ultimaSync" < now() - make_interval(hours => ${horas}::int)
            OR NOT EXISTS (SELECT 1 FROM pagos_personal p WHERE p."clienteId" = i."clienteId")) AS vieja
      FROM integraciones i
     WHERE i."clienteId" = ${clienteId}::uuid AND i.sistema = 'presentia' AND i.activa
  `
  if (!i?.vieja) return
  void sincronizarPresentia(clienteId).catch((e) =>
    console.error('[presentia] sincronización automática', (e as Error).message)
  )
}
