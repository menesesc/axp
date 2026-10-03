import { prisma } from '@/lib/prisma'

/**
 * CBU/CVU del proveedor (columna `proveedores.cbu`, agregada por SQL directo).
 * Se lee y escribe con SQL crudo para no depender de que el cliente Prisma
 * desplegado esté regenerado con el campo.
 */

/** Deja solo dígitos (el usuario pega con espacios o guiones). */
export function limpiarCbu(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * Valida los dos dígitos verificadores del CBU (bloque 1: entidad+sucursal,
 * bloque 2: cuenta). Los CVU de billeteras usan el mismo algoritmo.
 */
export function cbuValido(cbu: string): boolean {
  if (!/^\d{22}$/.test(cbu)) return false
  const d = cbu.split('').map(Number)
  const w1 = [7, 1, 3, 9, 7, 1, 3]
  const s1 = w1.reduce((s, w, i) => s + w * d[i]!, 0)
  if ((10 - (s1 % 10)) % 10 !== d[7]) return false
  const w2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]
  const s2 = w2.reduce((s, w, i) => s + w * d[8 + i]!, 0)
  return (10 - (s2 % 10)) % 10 === d[21]
}

/** CBU por proveedor del cliente (solo los que tienen). */
export async function cbusDelCliente(clienteId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<Array<{ id: string; cbu: string }>>`
    SELECT id, cbu FROM proveedores WHERE "clienteId" = ${clienteId}::uuid AND cbu IS NOT NULL
  `
  return new Map(rows.map((r) => [r.id, r.cbu]))
}

export async function guardarCbu(clienteId: string, proveedorId: string, cbu: string | null): Promise<void> {
  await prisma.$executeRaw`
    UPDATE proveedores SET cbu = ${cbu}, "updatedAt" = NOW()
    WHERE id = ${proveedorId}::uuid AND "clienteId" = ${clienteId}::uuid
  `
}

/** Normaliza y valida el CBU de un body. undefined = no tocar; null = borrar. */
export function parseCbuInput(v: unknown): { cbu?: string | null; error?: string } {
  if (v === undefined) return {}
  if (v === null || v === '') return { cbu: null }
  if (typeof v !== 'string') return { error: 'CBU inválido' }
  const cbu = limpiarCbu(v)
  if (!cbuValido(cbu)) return { error: 'El CBU/CVU no es válido (22 dígitos con verificador)' }
  return { cbu }
}
