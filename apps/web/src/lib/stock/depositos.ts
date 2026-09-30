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
