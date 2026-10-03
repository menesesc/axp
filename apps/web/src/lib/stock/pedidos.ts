import { prisma } from '@/lib/prisma'
import { convert } from '@/lib/conciliacion/units'
import { getCentral, getDepositos } from '@/lib/stock/depositos'

/**
 * Consumo teórico de un día de ventas (ventas × receta + merma), en la
 * unidadBase de cada insumo, agrupado por depósito de salida del producto.
 * Los productos sin depósito asignado se imputan al central.
 */
export async function consumoVentasPorDeposito(
  clienteId: string,
  fecha: string
): Promise<Map<string, Map<string, number>>> {
  const central = await getCentral(clienteId)
  const rows = await prisma.$queryRawUnsafe<
    Array<{ deposito_id: string; insumo_id: string; unidad: string; base: string; qty: number }>
  >(
    `SELECT COALESCE(cv.deposito_id, $3::uuid) AS deposito_id,
            cv.insumo_id, cv.unidad, i."unidadBase" AS base,
            SUM(cv.qty)::float8 AS qty
       FROM insumo_consumo_linea cv
       JOIN insumos i ON i.id = cv.insumo_id AND i.activo = true
      WHERE cv.cliente_id = $1::uuid AND cv.fecha = $2::date
      GROUP BY 1, 2, 3, 4`,
    clienteId,
    fecha,
    central.id
  )

  const out = new Map<string, Map<string, number>>()
  for (const r of rows) {
    let q: number
    try {
      q = convert(Number(r.qty), r.unidad, r.base)
    } catch {
      continue // unidad de receta incompatible con el insumo
    }
    const dep = out.get(r.deposito_id) ?? new Map<string, number>()
    dep.set(r.insumo_id, (dep.get(r.insumo_id) ?? 0) + q)
    out.set(r.deposito_id, dep)
  }
  return out
}

/** Redondea hacia arriba a 3 decimales (no pedir de menos por redondeo). */
export function redondearPedido(q: number): number {
  return Math.ceil(q * 1000 - 1e-6) / 1000
}

/**
 * Crea o actualiza los pedidos automáticos ('ventas') de un día para cada
 * depósito no central: cantidad pedida = consumo de lo vendido ese día.
 * Solo toca pedidos pendientes, y dentro de ellos solo las líneas que nadie
 * editó a mano. Se llama al ingerir cada cierre (turno), así el pedido crece a
 * medida que llegan los turnos del día.
 */
export async function sincronizarPedidosVentas(
  clienteId: string,
  fecha: string
): Promise<{ creados: number; actualizados: number }> {
  const [deps, central, consumo] = await Promise.all([
    getDepositos(clienteId, true),
    getCentral(clienteId),
    consumoVentasPorDeposito(clienteId, fecha),
  ])
  let creados = 0
  let actualizados = 0

  for (const dep of deps) {
    if (dep.id === central.id) continue
    const items = consumo.get(dep.id)
    if (!items || items.size === 0) continue

    const existente = await prisma.pedidos_internos.findFirst({
      where: { clienteId, destinoId: dep.id, origen: 'ventas', fechaVentas: new Date(fecha) },
      include: { items: true },
    })
    if (existente && existente.estado !== 'pendiente') continue

    if (!existente) {
      // Dos cierres del mismo día procesados a la vez pueden competir por crear
      // el pedido: el índice único (destino, fechaVentas) deja pasar a uno solo.
      await prisma.pedidos_internos.create({
        data: {
          clienteId,
          origenId: central.id,
          destinoId: dep.id,
          fechaVentas: new Date(fecha),
          origen: 'ventas',
          items: {
            create: [...items.entries()].map(([insumoId, q]) => ({
              insumoId,
              cantidadVendida: q,
              cantidadPedida: redondearPedido(q),
            })),
          },
        },
      }).catch((e: { code?: string }) => {
        if (e?.code !== 'P2002') throw e
      })
      creados++
      continue
    }

    const porInsumo = new Map(existente.items.map((it) => [it.insumoId, it]))
    const ops = []
    for (const [insumoId, q] of items) {
      const it = porInsumo.get(insumoId)
      if (!it) {
        ops.push(
          prisma.pedido_interno_items.create({
            data: { pedidoId: existente.id, insumoId, cantidadVendida: q, cantidadPedida: redondearPedido(q) },
          })
        )
      } else if (Math.abs(Number(it.cantidadVendida ?? 0) - q) > 1e-6) {
        ops.push(
          prisma.pedido_interno_items.update({
            where: { id: it.id },
            // La línea editada a mano conserva lo pedido; solo se actualiza la referencia.
            data: it.manual ? { cantidadVendida: q } : { cantidadVendida: q, cantidadPedida: redondearPedido(q) },
          })
        )
      }
    }
    if (ops.length) {
      await prisma.$transaction([
        ...ops,
        prisma.pedidos_internos.update({ where: { id: existente.id }, data: { updatedAt: new Date() } }),
      ])
      actualizados++
    }
  }
  return { creados, actualizados }
}

/** Include estándar para devolver un pedido con sus líneas y depósitos. */
export const PEDIDO_INCLUDE = {
  items: { include: { insumo: { select: { nombre: true, unidadBase: true } } } },
  origenDeposito: { select: { id: true, nombre: true } },
  destinoDeposito: { select: { id: true, nombre: true } },
} as const

type PedidoConItems = Awaited<ReturnType<typeof cargarPedido>>

export function cargarPedido(id: string, clienteId: string) {
  return prisma.pedidos_internos.findFirst({ where: { id, clienteId }, include: PEDIDO_INCLUDE })
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const num = (d: unknown) => (d === null || d === undefined ? null : Number(d))

export function serializarPedido(p: NonNullable<PedidoConItems>) {
  return {
    id: p.id,
    numero: p.numero,
    origen: p.origen,
    estado: p.estado,
    nota: p.nota,
    fechaVentas: iso(p.fechaVentas),
    fechaEnvio: iso(p.fechaEnvio),
    enviadoAt: p.enviadoAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    origenDeposito: p.origenDeposito,
    destinoDeposito: p.destinoDeposito,
    items: p.items
      .map((it) => ({
        insumoId: it.insumoId,
        nombre: it.insumo.nombre,
        unidad: it.insumo.unidadBase,
        cantidadVendida: num(it.cantidadVendida),
        cantidadPedida: Number(it.cantidadPedida),
        cantidadEnviada: num(it.cantidadEnviada),
        manual: it.manual,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }
}

/**
 * Líneas sugeridas para un pedido nuevo de `destinoId`: el consumo de lo
 * vendido en `fechaVentas` (si se indica) combinado con una plantilla (si se
 * indica). Si un insumo está en ambas, se toma la cantidad mayor.
 */
export async function lineasSugeridas(
  clienteId: string,
  destinoId: string,
  fechaVentas: string | null,
  plantillaId: string | null
): Promise<Array<{ insumoId: string; cantidadVendida: number | null; cantidadPedida: number; manual: boolean }>> {
  const out = new Map<string, { insumoId: string; cantidadVendida: number | null; cantidadPedida: number; manual: boolean }>()
  if (fechaVentas) {
    const consumo = (await consumoVentasPorDeposito(clienteId, fechaVentas)).get(destinoId)
    for (const [insumoId, q] of consumo ?? []) {
      out.set(insumoId, { insumoId, cantidadVendida: q, cantidadPedida: redondearPedido(q), manual: false })
    }
  }
  if (plantillaId) {
    const plantilla = await prisma.pedido_plantillas.findFirst({
      where: { id: plantillaId, clienteId },
      include: { items: true },
    })
    for (const it of plantilla?.items ?? []) {
      const q = Number(it.cantidad)
      const prev = out.get(it.insumoId)
      if (!prev) out.set(it.insumoId, { insumoId: it.insumoId, cantidadVendida: null, cantidadPedida: q, manual: true })
      else if (q > prev.cantidadPedida) prev.cantidadPedida = q
    }
  }
  return [...out.values()]
}
