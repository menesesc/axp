import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Cifrado de secretos de terceros (claves de API de otros sistemas).
 *
 * No es lo mismo que una contraseña: una clave de API hay que poder usarla,
 * así que se cifra y se descifra, no se hashea. Lo que evita es que alguien
 * con una copia de la base se lleve las llaves de los sistemas conectados.
 *
 * La clave del servidor sale del entorno. Si no está, no se cifra nada: se
 * avisa y la integración queda sin guardar, que es mejor que escribir un
 * secreto en claro en una tabla.
 */

const ALGO = 'aes-256-gcm'

function claveMaestra(): Buffer | null {
  const base = process.env.APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) return null
  // Sal fija: la clave maestra ya es un secreto largo, y una sal aleatoria
  // habría que guardarla al lado del dato, que no aporta nada acá.
  return scryptSync(base, 'axp-integraciones', 32)
}

export function hayClaveMaestra(): boolean {
  return claveMaestra() !== null
}

export function cifrar(texto: string): string | null {
  const clave = claveMaestra()
  if (!clave) return null
  const iv = randomBytes(12)
  const c = createCipheriv(ALGO, clave, iv)
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [ALGO, iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join('$')
}

export function descifrar(guardado: string | null): string | null {
  const clave = claveMaestra()
  if (!clave || !guardado) return null
  const [algo, iv, tag, datos] = guardado.split('$')
  if (algo !== ALGO || !iv || !tag || !datos) return null
  try {
    const d = createDecipheriv(ALGO, clave, Buffer.from(iv, 'base64'))
    d.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
