/** Rango por defecto (últimos 30 días, YYYY-MM-DD). Uso server-side en las rutas. */
export function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { from, to }
}
