export function fmtAR(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—'
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
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
    // Renderizar en UTC para que no se "corra un día" en zonas con offset negativo (GMT-3 Argentina).
    // La columna en DB es @db.Date (solo día), guardada como 00:00 UTC.
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return iso
  }
}

/**
 * Versión corta (DD/MM) para ejes de gráficos.
 */
export function fmtFechaShort(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    })
  } catch {
    return iso
  }
}

/**
 * Compactar números grandes para ejes: 1.234.567 → "1,2M", 12.345 → "12k".
 */
export function fmtCompactAR(n: number): string {
  if (n == null || isNaN(n)) return ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(Math.round(n))
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

/**
 * Hook utilitario de orden por columna para tablas client-side.
 */
import { useState, useMemo } from 'react'

export type SortDir = 'asc' | 'desc'

export function useSort<T, K extends string>(
  items: T[],
  getValue: (item: T, key: K) => number | string | null | undefined,
  initial: { key: K; dir: SortDir }
) {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>(initial)

  const sorted = useMemo(() => {
    const arr = [...items]
    arr.sort((a, b) => {
      const va = getValue(a, sort.key)
      const vb = getValue(b, sort.key)
      const na = va == null ? '' : va
      const nb = vb == null ? '' : vb
      let cmp: number
      if (typeof na === 'number' && typeof nb === 'number') {
        cmp = na - nb
      } else {
        cmp = String(na).localeCompare(String(nb), 'es', { numeric: true, sensitivity: 'base' })
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [items, sort, getValue])

  function toggle(key: K) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  return { sorted, sort, toggle }
}
