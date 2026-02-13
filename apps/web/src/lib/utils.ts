import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const tipoDocLabels: Record<string, string> = {
  FACTURA: 'FACTURA',
  NOTA_CREDITO: 'NOTA DE CREDITO',
  REMITO: 'REMITO',
}

export function formatTipoDocumento(tipo: string): string {
  return tipoDocLabels[tipo] || tipo
}

export function formatNumeroOrden(numero: number): string {
  return String(numero).padStart(6, '0')
}

export function formatCurrency(amount: number | null): string {
  if (amount === null) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount)
}

/**
 * Formatea una fecha para mostrar en la UI.
 * IMPORTANTE: Las fechas se guardan en timezone Argentina (GMT-3).
 * Extraemos solo la parte de fecha (YYYY-MM-DD) para evitar problemas de timezone.
 */
export function formatDate(date: string | Date | null): string {
  if (!date) return '-'

  // Si es string, extraer solo la parte de fecha (antes de T o espacio)
  if (typeof date === 'string') {
    const datePart = date.split('T')[0] || date.split(' ')[0] || date
    // Parsear como fecha local (sin timezone conversion)
    const parts = datePart.split('-')
    const year = parseInt(parts[0] || '0', 10)
    const month = parseInt(parts[1] || '0', 10)
    const day = parseInt(parts[2] || '0', 10)
    if (year && month && day) {
      return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`
    }
  }

  // Fallback para Date objects
  const d = new Date(date)
  return d.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}
