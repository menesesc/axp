import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * PIN de los usuarios del punto de venta.
 *
 * Es un PIN de cuatro a seis dígitos que se tipea en una tablet, no una
 * contraseña: el espacio de búsqueda es chico y lo que lo protege es el
 * límite de intentos, no la fuerza del secreto. Igual se guarda derivado con
 * scrypt y sal propia, para que el que lea la base no se lleve los PIN de
 * todos los mozos.
 *
 * scrypt viene en node:crypto y no hace falta sumar una dependencia.
 */

const LARGO_SAL = 16
const LARGO_CLAVE = 32
// N=16384 tarda unos 50 ms: suficiente contra fuerza bruta offline sin que el
// cajero espere al apretar el PIN.
const COSTO = 16_384

export function hashearPin(pin: string): string {
  const sal = randomBytes(LARGO_SAL)
  const clave = scryptSync(pin, sal, LARGO_CLAVE, { N: COSTO })
  return `scrypt$${COSTO}$${sal.toString('base64')}$${clave.toString('base64')}`
}

export function verificarPin(pin: string, hash: string | null): boolean {
  if (!hash) return false
  const partes = hash.split('$')
  if (partes.length !== 4 || partes[0] !== 'scrypt') return false
  const costo = Number(partes[1])
  if (!Number.isInteger(costo) || costo < 1024) return false

  try {
    const sal = Buffer.from(partes[2]!, 'base64')
    const esperado = Buffer.from(partes[3]!, 'base64')
    const calculado = scryptSync(pin, sal, esperado.length, { N: costo })
    // timingSafeEqual exige el mismo largo: si no coincide, no es este hash.
    return esperado.length === calculado.length && timingSafeEqual(esperado, calculado)
  } catch {
    return false
  }
}

/** Un PIN de 4 a 6 dígitos, sin secuencias ni repeticiones obvias. */
export function pinValido(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'El PIN son 4 a 6 dígitos'
  if (/^(\d)\1+$/.test(pin)) return 'El PIN no puede ser todo el mismo número'
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'El PIN no puede ser una secuencia'
  return null
}
