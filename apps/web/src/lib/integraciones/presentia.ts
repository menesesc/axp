/**
 * Presentia: horas y sueldos.
 *
 * Es el sistema de presentismo de la misma casa, así que la integración es
 * directa: una clave de API y una URL. De ahí sale el costo de personal del
 * mes, que es el gasto más grande después de la mercadería; sin eso el
 * resultado que muestra finanzas miente por mucho.
 *
 * Lo que cambia entre instalaciones —la ruta y cómo se llaman los campos—
 * está en la config de la integración y no acá, para no tocar código cuando
 * la API cambie de forma.
 */

export interface ConfigPresentia {
  /** Ruta del endpoint de costos, relativa a la base. */
  ruta?: string
  /** Cómo viaja la clave: header Authorization: Bearer, o X-Api-Key. */
  auth?: 'bearer' | 'apikey'
  /** Nombres de los campos en la respuesta, si no son los esperados. */
  campos?: { periodo?: string; importe?: string; empleados?: string }
  /** Día del mes siguiente en que se pagan los sueldos. */
  diaPago?: number
}

export interface CostoPeriodo {
  /** Mes trabajado, YYYY-MM. */
  periodo: string
  importe: number
  empleados: number | null
}

export const RUTA_POR_DEFECTO = '/api/costos/mensual'

/**
 * Trae el costo de personal por mes.
 *
 * Espera una lista de objetos con el período y el total del mes. Acepta que
 * venga envuelta en `data` o en `items`, que es lo que hace casi todo el
 * mundo, y permite renombrar los campos desde la config.
 */
export async function costosDePresentia(
  baseUrl: string,
  apiKey: string,
  desde: string,
  hasta: string,
  config: ConfigPresentia = {}
): Promise<CostoPeriodo[]> {
  const url = new URL((config.ruta || RUTA_POR_DEFECTO).replace(/^\//, ''), baseUrl.replace(/\/?$/, '/'))
  url.searchParams.set('desde', desde)
  url.searchParams.set('hasta', hasta)

  const headers: Record<string, string> =
    config.auth === 'apikey' ? { 'X-Api-Key': apiKey } : { Authorization: `Bearer ${apiKey}` }

  const r = await fetch(url, { headers, cache: 'no-store' })
  const texto = await r.text()
  if (!r.ok) throw new Error(`Presentia respondió ${r.status}: ${texto.slice(0, 160)}`)

  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('Presentia no devolvió JSON')
  }

  const lista = Array.isArray(json)
    ? json
    : Array.isArray((json as { data?: unknown[] }).data)
      ? (json as { data: unknown[] }).data
      : Array.isArray((json as { items?: unknown[] }).items)
        ? (json as { items: unknown[] }).items
        : null
  if (!lista) throw new Error('La respuesta no trae una lista de períodos')

  const cPeriodo = config.campos?.periodo || 'periodo'
  const cImporte = config.campos?.importe || 'total'
  const cEmpleados = config.campos?.empleados || 'empleados'

  return lista
    .map((x) => {
      const o = x as Record<string, unknown>
      return {
        periodo: String(o[cPeriodo] ?? '').slice(0, 7),
        importe: Number(o[cImporte] ?? 0),
        empleados: o[cEmpleados] != null ? Number(o[cEmpleados]) : null,
      }
    })
    .filter((c) => /^\d{4}-\d{2}$/.test(c.periodo) && isFinite(c.importe) && c.importe > 0)
}

/** El día en que sale la plata: por defecto, el 5 del mes siguiente. */
export function fechaDePago(periodo: string, diaPago = 5): string {
  const [a, m] = periodo.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(a, m, Math.min(Math.max(diaPago, 1), 28))).toISOString().slice(0, 10)
}
