import { prisma } from '@/lib/prisma'

export interface PlantillaValida {
  nombre: string
  destinoId: string | null
  items: Array<{ insumoId: string; cantidad: number }>
}

/** Valida el body de una plantilla contra los datos del cliente. */
export async function validarPlantilla(clienteId: string, body: any): Promise<PlantillaValida | { error: string }> {
  const nombre = String(body?.nombre || '').trim().slice(0, 80)
  if (!nombre) return { error: 'El nombre es obligatorio' }
  let destinoId: string | null = body?.destinoId ? String(body.destinoId) : null
  if (destinoId && !(await prisma.depositos.findFirst({ where: { id: destinoId, clienteId } }))) destinoId = null
  const raw: Array<{ insumoId: string; cantidad: number }> = Array.isArray(body?.items) ? body.items : []
  if (raw.some((i) => !Number.isFinite(Number(i.cantidad)) || Number(i.cantidad) <= 0)) {
    return { error: 'Las cantidades deben ser mayores a 0' }
  }
  const propios = new Set(
    (await prisma.insumos.findMany({ where: { clienteId, id: { in: raw.map((i) => i.insumoId) } }, select: { id: true } })).map(
      (i) => i.id
    )
  )
  const items = [...new Map(raw.filter((i) => propios.has(i.insumoId)).map((i) => [i.insumoId, Number(i.cantidad)]))].map(
    ([insumoId, cantidad]) => ({ insumoId, cantidad })
  )
  return { nombre, destinoId, items }
}

/** Reemplaza las líneas de una plantilla. */
export async function guardarItemsPlantilla(plantillaId: string, items: PlantillaValida['items']) {
  await prisma.$transaction([
    prisma.pedido_plantilla_items.deleteMany({ where: { plantillaId } }),
    prisma.pedido_plantilla_items.createMany({ data: items.map((i) => ({ plantillaId, ...i })) }),
  ])
}
