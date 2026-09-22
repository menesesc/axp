/**
 * Fechas de calendario en horario argentino.
 *
 * El problema que resuelve: `new Date().toISOString().slice(0, 10)` devuelve la
 * fecha en UTC. Como Argentina es UTC-3, entre las 21:00 y la medianoche eso ya
 * es el día siguiente — el servidor corre en UTC, así que un informe abierto a
 * las 21:30 del 21/09 arrancaba mostrando el 22/09.
 *
 * Todo lo que sea "qué día es hoy / ayer / este mes" tiene que pasar por acá.
 *
 * Distinto es formatear una fecha que viene de la base: las columnas `@db.Date`
 * (`sales_closures.fecha`, `documentos.fechaEmision`) llegan como medianoche UTC
 * del día guardado, así que ahí `toISOString().slice(0, 10)` es lo correcto y no
 * hay que tocarlo.
 */

export const TZ_AR = 'America/Argentina/Buenos_Aires'

/** en-CA formatea como YYYY-MM-DD, que es justo lo que usamos en los filtros. */
const FMT_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ_AR,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Fecha de un instante en Argentina, como YYYY-MM-DD. */
export function isoAR(d: Date = new Date()): string {
  return FMT_ISO.format(d)
}

/** Hoy en Argentina (YYYY-MM-DD). */
export function hoyAR(): string {
  return isoAR()
}

/** Ayer en Argentina (YYYY-MM-DD). */
export function ayerAR(): string {
  return sumarDias(hoyAR(), -1)
}

/**
 * Suma (o resta) días a una fecha YYYY-MM-DD.
 *
 * La cuenta va en UTC a propósito: son fechas de calendario, sin hora, así que
 * no hay que arrastrar el huso. Argentina además no aplica horario de verano,
 * con lo cual no hay días de 23 o 25 horas que compensar.
 */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + dias * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** Días transcurridos entre dos fechas YYYY-MM-DD (to - from). */
export function diasEntre(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** Rango de los últimos `dias` días en Argentina, terminando hoy. */
export function ultimosDiasAR(dias: number): { from: string; to: string } {
  const to = hoyAR()
  return { from: sumarDias(to, -(dias - 1)), to }
}

/** Primer día del mes actual en Argentina. */
export function inicioDeMesAR(ref: string = hoyAR()): string {
  return `${ref.slice(0, 7)}-01`
}

/** Primer y último día del mes anterior al de `ref`, en Argentina. */
export function mesAnteriorAR(ref: string = hoyAR()): { from: string; to: string } {
  const primeroEsteMes = inicioDeMesAR(ref)
  const ultimoMesPasado = sumarDias(primeroEsteMes, -1)
  return { from: inicioDeMesAR(ultimoMesPasado), to: ultimoMesPasado }
}
