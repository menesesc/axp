import { prisma } from '@/lib/prisma'

export interface Deposito {
  id: string
  nombre: string
  esCentral: boolean
  orden: number
  activo: boolean
}

export const DEPOSITOS_DEFAULT = [
  { nombre: 'Depósito', esCentral: true, orden: 10 },
  { nombre: 'Cocina', esCentral: false, orden: 20 },
  { nombre: 'Barra', esCentral: false, orden: 30 },
  { nombre: 'Salón', esCentral: false, orden: 40 },
]

/** Depósitos del cliente (activos primero, por orden). Crea los iniciales si no tiene. */
export async function getDepositos(clienteId: string, soloActivos = false): Promise<Deposito[]> {
  const buscar = () =>
    prisma.depositos.findMany({
      where: { clienteId, ...(soloActivos ? { activo: true } : {}) },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      select: { id: true, nombre: true, esCentral: true, orden: true, activo: true },
    })
  let deps = await buscar()
  if (deps.length === 0 && !(await prisma.depositos.count({ where: { clienteId } }))) {
    await prisma.depositos.createMany({
      data: DEPOSITOS_DEFAULT.map((d) => ({ clienteId, ...d })),
      skipDuplicates: true,
    })
    deps = await buscar()
  }
  return deps
}

/** Depósito central del cliente (el que recibe las compras). */
export async function getCentral(clienteId: string): Promise<Deposito> {
  const deps = await getDepositos(clienteId)
  const central = deps.find((d) => d.esCentral) ?? deps[0]
  if (!central) throw new Error('El cliente no tiene depósitos')
  return central
}

/**
 * Depósitos en los que un usuario puede contar stock.
 *
 * `usuarios.depositos` vacío = todos (encargado). Con una lista cargada, solo
 * esos: el de barra ve Barra y nada más. Los admin no se filtran.
 *
 * Se resuelve en el servidor y se usa tanto para armar el selector como para
 * validar el guardado: ocultar el depósito en la UI no alcanza.
 */
export async function getDepositosPermitidos(
  clienteId: string,
  usuarioId: string | null | undefined,
  esAdmin: boolean,
  soloActivos = true
): Promise<Deposito[]> {
  const todos = await getDepositos(clienteId, soloActivos)
  if (esAdmin || !usuarioId) return todos

  const u = await prisma.usuarios.findUnique({
    where: { id: usuarioId },
    select: { depositos: true },
  })
  const permitidos = u?.depositos ?? []
  if (permitidos.length === 0) return todos

  const set = new Set(permitidos)
  return todos.filter((d) => set.has(d.id))
}
