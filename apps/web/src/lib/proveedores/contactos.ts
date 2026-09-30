/** Campos de contacto del proveedor: dos para pedidos y uno de administración. */
export const CAMPOS_CONTACTO = [
  'pedidos1Nombre',
  'pedidos1Telefono',
  'pedidos2Nombre',
  'pedidos2Telefono',
  'adminNombre',
  'adminTelefono',
] as const

type CampoContacto = (typeof CAMPOS_CONTACTO)[number]

/**
 * Extrae del body solo los campos de contacto presentes (los ausentes no se
 * tocan en un PATCH). Strings vacíos se guardan como null.
 */
export function contactosDesde(body: Record<string, unknown>) {
  const out: Partial<Record<CampoContacto, string | null>> & { diasEntrega?: number | null } = {}
  for (const campo of CAMPOS_CONTACTO) {
    if (body[campo] === undefined) continue
    const v = typeof body[campo] === 'string' ? (body[campo] as string).trim() : ''
    out[campo] = v ? v.slice(0, campo.endsWith('Telefono') ? 30 : 100) : null
  }
  if (body.diasEntrega !== undefined) {
    const n = body.diasEntrega === null || body.diasEntrega === '' ? null : Number(body.diasEntrega)
    out.diasEntrega = n === null || !Number.isFinite(n) ? null : Math.max(0, Math.min(60, Math.round(n)))
  }
  return out
}
