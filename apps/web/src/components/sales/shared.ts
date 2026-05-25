export function fmtAR(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(num)
}

export function fmtNumAR(n: number | string | null | undefined, decimals = 0): string {
  if (n == null || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(num)
}

export function fmtFecha(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

/**
 * Devuelve rango de fechas por defecto (últimos 30 días en formato YYYY-MM-DD).
 */
export function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { from, to }
}

export const TURNO_LABEL: Record<string, string> = {
  ALMUERZO: 'Almuerzo',
  CENA: 'Cena',
  OTRO: 'Otro',
}

export const TURNO_BADGE: Record<string, string> = {
  ALMUERZO: 'bg-amber-100 text-amber-700 border-amber-200',
  CENA: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  OTRO: 'bg-slate-100 text-slate-600 border-slate-200',
}
