/** Normaliza un teléfono argentino a formato wa.me (54 9 + área + número). */
export function waPhone(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  let d = telefono.replace(/\D/g, '')
  if (!d) return null
  d = d.replace(/^0+/, '') // sacar 0 inicial (área)
  // Asumimos números ya sin 15 y con área. Prefijo país 54 + 9 (celular).
  if (d.startsWith('54')) {
    const rest = d.slice(2)
    return rest.startsWith('9') ? d : `549${rest}`
  }
  return `549${d}`
}

/** Link de WhatsApp (abre la app o WhatsApp Web) con el mensaje prellenado. */
export function waLink(telefono: string | null | undefined, mensaje?: string): string | null {
  const phone = waPhone(telefono)
  if (!phone) return null
  return `https://wa.me/${phone}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`
}

/**
 * Teléfono para temas administrativos (pagos): Administración y, si no hay,
 * Pedidos 1. `telefono` es el campo legado de antes de separar contactos.
 */
export function telefonoAdmin(p: {
  adminTelefono?: string | null
  pedidos1Telefono?: string | null
  telefono?: string | null
}): string | null {
  return p.adminTelefono || p.pedidos1Telefono || p.telefono || null
}
