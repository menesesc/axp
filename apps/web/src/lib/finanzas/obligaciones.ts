/**
 * Proyección de vencimientos periódicos.
 *
 * Lo que vence todos los meses —UTHGRA, ARCA, la luz— se anota una vez y el
 * calendario lo muestra hacia adelante, estimado, hasta que llega la boleta
 * real de ese período y la reemplaza. Sin esto, un impuesto sólo aparece
 * cuando ya hay papel, que suele ser tarde.
 *
 * Sin base ni red, para poder probarlo solo.
 */

export type Periodicidad = 'MENSUAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'

export const MESES_DE: Record<Periodicidad, number> = {
  MENSUAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
}

export interface Obligacion {
  periodicidad: Periodicidad
  /** Día del mes. Si el mes es más corto, vence el último día. */
  diaVencimiento: number
  /** Mes de referencia (1-12) para lo que no es mensual. */
  mesAncla?: number | null
}

const ultimoDiaDe = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

/**
 * Fechas en que vence la obligación dentro de [desde, hasta], ambas YYYY-MM-DD.
 *
 * El recorrido va mes a mes y no sumando períodos desde el ancla: así no
 * importa si el ancla quedó años atrás ni si el rango empieza en la mitad de
 * un bimestre.
 */
export function vencimientosEntre(o: Obligacion, desde: string, hasta: string): string[] {
  if (desde > hasta) return []
  const paso = MESES_DE[o.periodicidad] ?? 1
  const ancla = o.mesAncla && o.mesAncla >= 1 && o.mesAncla <= 12 ? o.mesAncla : 1

  const [anioD, mesD] = desde.split('-').map(Number) as [number, number]
  const [anioH, mesH] = hasta.split('-').map(Number) as [number, number]

  const out: string[] = []
  let anio = anioD
  let mes = mesD
  // Un mes de más a cada lado no hace falta: el rango se compara por fecha.
  while (anio < anioH || (anio === anioH && mes <= mesH)) {
    // Para lo no mensual, sólo los meses que caen en el ciclo del ancla.
    // El +12000 evita el módulo negativo cuando el ancla es posterior.
    const enCiclo = paso === 1 || (mes - ancla + 12_000) % paso === 0
    if (enCiclo) {
      const dia = Math.min(o.diaVencimiento, ultimoDiaDe(anio, mes))
      const f = iso(anio, mes, dia)
      if (f >= desde && f <= hasta) out.push(f)
    }
    mes++
    if (mes > 12) {
      mes = 1
      anio++
    }
  }
  return out
}

/**
 * ¿A qué período corresponde una fecha? Se usa para cruzar el comprobante
 * real con el vencimiento estimado: si ya hay una boleta de la luz que vence
 * en septiembre, el estimado de septiembre no se muestra.
 */
export function periodoDe(fecha: string): string {
  return fecha.slice(0, 7)
}
