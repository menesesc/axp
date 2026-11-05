/**
 * Presentia: horas y sueldos.
 *
 * Es el sistema de presentismo de la misma casa, así que la integración es
 * directa: una clave de API y una URL. De ahí sale el costo de personal del
 * mes, que es el gasto más grande después de la mercadería; sin eso el
 * resultado que muestra finanzas miente por mucho.
 *
 * El importe que trae es lo que cobra el empleado. Las cargas sociales no
 * están en Presentia, que no lleva impuestos: entran a AXP como
 * obligaciones, igual que ARCA o Rentas. Sumarlas acá las contaría dos
 * veces.
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
  /** Lo que se le paga al empleado, sin cargas sociales. */
  importe: number
  empleados: number | null
}

export const RUTA_POR_DEFECTO = '/api/v1/data/payroll/monthly'

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

  // Presentia responde en inglés (period, total, employees); se aceptan
  // también los nombres en castellano por si la ruta apunta a otro lado.
  const cPeriodo = config.campos?.periodo
  const cImporte = config.campos?.importe
  const cEmpleados = config.campos?.empleados

  return lista
    .map((x) => {
      const o = x as Record<string, unknown>
      return {
        periodo: String((cPeriodo ? o[cPeriodo] : o.period ?? o.periodo) ?? '').slice(0, 7),
        importe: Number((cImporte ? o[cImporte] : o.total) ?? 0),
        empleados: (() => {
          const v = cEmpleados ? o[cEmpleados] : o.employees ?? o.empleados
          return v != null ? Number(v) : null
        })(),
      }
    })
    .filter((c) => /^\d{4}-\d{2}$/.test(c.periodo) && isFinite(c.importe) && c.importe > 0)
}

export type MetodoPago = 'bank' | 'cash' | 'in_kind' | 'unspecified'

/** Un movimiento de nómina tal como lo devuelve Presentia. */
export interface MovimientoPresentia {
  date: string
  period: string
  kind: 'advance' | 'salary_balance'
  /** Tipo de adelanto (bank, cash, loan…) o de recibo (monthly, sac, final…). */
  type: string
  method: MetodoPago
  amount: number
  employee: { id: string; name: string }
  description: string | null
}

export const RUTA_MOVIMIENTOS = '/api/v1/data/payroll/movements'

/** Presentia acepta hasta 366 días por pedido. */
const MAX_DIAS = 366

/**
 * La plata que salió por la nómina, día por día.
 *
 * Cada adelanto en su fecha y el saldo de cada recibo el día que se pagó. Es
 * lo que el flujo de caja necesita: el total del mes con una fecha estimada
 * no muestra que la mitad del sueldo ya se fue en adelantos el día 15.
 *
 * Los rangos de más de un año se piden en tramos: Presentia corta en 366
 * días por pedido.
 */
export async function movimientosDePresentia(
  baseUrl: string,
  apiKey: string,
  desde: string,
  hasta: string,
  config: ConfigPresentia = {}
): Promise<MovimientoPresentia[]> {
  const out: MovimientoPresentia[] = []
  let inicio = desde
  while (inicio <= hasta) {
    const fin = sumarDias(inicio, MAX_DIAS - 1) < hasta ? sumarDias(inicio, MAX_DIAS - 1) : hasta
    const url = new URL(RUTA_MOVIMIENTOS.replace(/^\//, ''), baseUrl.replace(/\/?$/, '/'))
    url.searchParams.set('from', inicio)
    url.searchParams.set('to', fin)

    const headers: Record<string, string> =
      config.auth === 'apikey' ? { 'X-Api-Key': apiKey } : { Authorization: `Bearer ${apiKey}` }
    const r = await fetch(url, { headers, cache: 'no-store' })
    const texto = await r.text()
    if (!r.ok) throw new Error(`Presentia respondió ${r.status}: ${texto.slice(0, 160)}`)

    const json = JSON.parse(texto) as { data?: MovimientoPresentia[] }
    if (!Array.isArray(json.data)) throw new Error('La respuesta de movimientos no trae `data`')
    out.push(...json.data)

    inicio = sumarDias(fin, 1)
  }
  return out
}

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** El día en que sale la plata: por defecto, el 5 del mes siguiente. */
export function fechaDePago(periodo: string, diaPago = 5): string {
  const [a, m] = periodo.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(a, m, Math.min(Math.max(diaPago, 1), 28))).toISOString().slice(0, 10)
}
