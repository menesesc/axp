type Frecuencia = 'DIARIA' | 'SEMANAL' | 'MENSUAL'

/**
 * Calcula el rango de fechas del informe a enviar "ahora", asumiendo que el
 * informe cubre el período cerrado anterior. La fecha de referencia se pasa
 * en zona local del cliente (sin conversion); por simplicidad trabajamos
 * sobre componentes año/mes/día.
 *
 * Ejemplos (refDate = 27/05/2026):
 *   DIARIA  → 26/05 a 26/05
 *   SEMANAL → si refDate es lunes, semana cerrada anterior lun-dom = 18-24/05
 *             si refDate es martes, igualmente la semana anterior cerrada
 *   MENSUAL → mes anterior completo (01-30/04 en este caso si refDate=mayo)
 */
export function computeReportRange(
  frecuencia: Frecuencia,
  refDate: Date
): { from: string; to: string } {
  const y = refDate.getFullYear()
  const m = refDate.getMonth()
  const d = refDate.getDate()

  if (frecuencia === 'DIARIA') {
    const ayer = new Date(y, m, d - 1)
    const iso = toISODate(ayer)
    return { from: iso, to: iso }
  }

  if (frecuencia === 'SEMANAL') {
    // Semana ISO: lunes a domingo. Tomamos la semana cerrada anterior.
    // refDate dow: 0=Dom, 1=Lun, ..., 6=Sab. ISO: lunes=1, domingo=7.
    const dow = refDate.getDay() === 0 ? 7 : refDate.getDay()
    // Domingo anterior (último día de la semana anterior).
    const ultimoDom = new Date(y, m, d - dow)
    const primerLun = new Date(y, m, d - dow - 6)
    return { from: toISODate(primerLun), to: toISODate(ultimoDom) }
  }

  // MENSUAL: mes anterior completo.
  const primerDiaEsteMes = new Date(y, m, 1)
  const ultimoDiaMesAnterior = new Date(primerDiaEsteMes.getTime() - 24 * 60 * 60 * 1000)
  const primerDiaMesAnterior = new Date(ultimoDiaMesAnterior.getFullYear(), ultimoDiaMesAnterior.getMonth(), 1)
  return { from: toISODate(primerDiaMesAnterior), to: toISODate(ultimoDiaMesAnterior) }
}

function toISODate(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0')
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function labelForFrecuencia(frecuencia: Frecuencia): string {
  if (frecuencia === 'DIARIA') return 'diario'
  if (frecuencia === 'SEMANAL') return 'semanal'
  return 'mensual'
}

export function formatRangeHuman(from: string, to: string): string {
  // YYYY-MM-DD → DD/MM/YYYY (es-AR)
  const f = (s: string) => {
    const parts = s.split('-')
    if (parts.length !== 3) return s
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  if (from === to) return f(from)
  return `${f(from)} al ${f(to)}`
}
