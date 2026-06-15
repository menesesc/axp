/** Rango por defecto (últimos 30 días, YYYY-MM-DD). Uso server-side en las rutas. */
export function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { from, to }
}

/**
 * Estados de factura que la conciliación cuenta como compra real: confirmadas
 * y pagadas (ambas ya revisadas). Se excluyen PENDIENTE (sin revisar, posible
 * error de OCR), ERROR y DUPLICADO. Una factura PAGADO es una compra confirmada
 * y además pagada, por lo que debe contar igual que CONFIRMADO.
 */
export const ESTADOS_COMPRA = ['CONFIRMADO', 'PAGADO'] as const
