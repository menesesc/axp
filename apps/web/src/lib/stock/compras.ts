import { prisma } from '@/lib/prisma'
import { convert } from '@/lib/conciliacion/units'
import { ESTADOS_COMPRA } from '@/app/api/conciliacion/_range'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { stockEsperadoPorInsumo } from '@/lib/conciliacion/stock'
import { getCentral } from '@/lib/stock/depositos'

/**
 * Compras sugeridas a proveedores, sobre el stock del depósito central.
 *
 * Por insumo:
 *   - stock actual del central (último conteo + movimientos, incluye hoy)
 *   - en camino: pedidos a proveedor enviados y todavía no recibidos
 *   - demanda diaria: lo que sale del central por día en las últimas `ventana`
 *     jornadas = máx(consumo por ventas de todo el local, despachos a otros
 *     depósitos + consumo propio del central). El máximo cubre tanto los
 *     insumos con receta como los que solo se mueven por pedidos internos.
 *   - estado: 'pedir' (disponible ≤ stock seguro), 'pronto' (llegaría al
 *     seguro antes de que entregue el proveedor), 'ok' o 'sin_datos'.
 *   - sugerido: lo necesario para cubrir la entrega + `diasObjetivo` días
 *     por encima del stock seguro.
 * Y los proveedores que lo vendieron (última compra de cada uno, 180 días),
 * con precio por unidad de factura y por unidad base.
 */

export interface ProveedorInsumo {
  proveedorId: string
  razonSocial: string
  diasEntrega: number | null
  telefono: string | null
  contacto: string | null
  ultimaFecha: string
  descripcion: string
  factor: number
  precioUnitario: number | null
  precioBase: number | null
  compras: number
}

export interface Sugerencia {
  insumoId: string
  nombre: string
  unidad: string
  stock: number | null
  ultimoConteoFecha: string | null
  seguro: number | null
  enCamino: number
  demandaDiaria: number
  diasCobertura: number | null
  diasEntrega: number
  estado: 'pedir' | 'pronto' | 'ok' | 'sin_datos'
  sugeridoBase: number
  proveedorSugeridoId: string | null
  proveedores: ProveedorInsumo[]
}

/** Días de entrega si el proveedor no lo tiene cargado. */
const ENTREGA_DEFAULT = 1

export async function calcularSugerencias(
  clienteId: string,
  opts: { diasObjetivo?: number; ventana?: number } = {}
): Promise<Sugerencia[]> {
  const diasObjetivo = Math.max(1, Math.min(60, opts.diasObjetivo ?? 7))
  const ventana = Math.max(7, Math.min(90, opts.ventana ?? 28))
  const hoy = hoyAR()
  const desde = sumarDias(hoy, -ventana)
  const central = await getCentral(clienteId)

  const [insumos, stock, seguros, consumoRows, despachoRows, enCaminoRows, compraRows] = await Promise.all([
    prisma.insumos.findMany({
      where: { clienteId, activo: true },
      select: { id: true, nombre: true, unidadBase: true },
      orderBy: { nombre: 'asc' },
    }),
    // Mañana a la mañana = incluye los movimientos de hoy.
    stockEsperadoPorInsumo(clienteId, sumarDias(hoy, 1), central.id),
    prisma.insumo_deposito.findMany({
      where: { depositoId: central.id, insumo: { clienteId } },
      select: { insumoId: true, stockSeguro: true },
    }),
    // Consumo por ventas en la ventana: total y el que sale directo del central.
    prisma.$queryRawUnsafe<Array<{ insumo_id: string; unidad: string; total: number; central: number }>>(
      `SELECT cv.insumo_id, cv.unidad,
              SUM(cv.qty)::float8 AS total,
              SUM(CASE WHEN COALESCE(cv.deposito_id, $4::uuid) = $4::uuid
                       THEN cv.qty ELSE 0 END)::float8 AS central
         FROM insumo_consumo_linea cv
        WHERE cv.cliente_id = $1::uuid AND cv.fecha >= $2::date AND cv.fecha < $3::date
        GROUP BY 1, 2`,
      clienteId,
      desde,
      hoy,
      central.id
    ),
    // Despachos del central a otros depósitos en la ventana.
    prisma.$queryRawUnsafe<Array<{ insumo_id: string; qty: number }>>(
      `SELECT it."insumoId" AS insumo_id, SUM(it."cantidadEnviada")::float8 AS qty
         FROM pedido_interno_items it
         JOIN pedidos_internos p ON p.id = it."pedidoId"
        WHERE p."clienteId" = $1::uuid AND p.estado = 'enviado' AND p."origenId" = $4::uuid
          AND p."fechaEnvio" >= $2::date AND p."fechaEnvio" < $3::date
        GROUP BY 1`,
      clienteId,
      desde,
      hoy,
      central.id
    ),
    // En camino: pedidos enviados sin factura posterior del proveedor y no vencidos.
    prisma.$queryRawUnsafe<Array<{ insumo_id: string; qty: number }>>(
      `SELECT it."insumoId" AS insumo_id, SUM(it."cantidadBase")::float8 AS qty
         FROM pedido_proveedor_items it
         JOIN pedidos_proveedor p ON p.id = it."pedidoId"
        WHERE p."clienteId" = $1::uuid AND p.estado = 'enviado' AND it."insumoId" IS NOT NULL
          AND COALESCE(p."fechaEsperada", p.fecha) + 3 >= $2::date
          AND NOT EXISTS (
            SELECT 1 FROM documentos d
             WHERE d."clienteId" = p."clienteId" AND d."proveedorId" = p."proveedorId"
               AND d."fechaEmision" >= p.fecha AND d."createdAt" >= p."createdAt")
        GROUP BY 1`,
      clienteId,
      hoy
    ),
    // Última compra de cada insumo por proveedor (180 días).
    prisma.$queryRawUnsafe<Array<{
      insumo_id: string
      proveedor_id: string
      razon_social: string
      dias_entrega: number | null
      telefono: string | null
      contacto: string | null
      fecha: string
      descripcion: string
      factor: number
      precio_unitario: number | null
      precio_base: number | null
      compras: bigint
    }>>(
      // Las notas de crédito no sirven para fijar el precio de referencia ni
      // para elegir proveedor: son devoluciones, no compras.
      `WITH lineas AS (
         SELECT co.insumo_id, p.id AS proveedor_id, p."razonSocial" AS razon_social,
                p."diasEntrega" AS dias_entrega,
                COALESCE(p."pedidos1Telefono", p."pedidos2Telefono", p.telefono) AS telefono,
                CASE WHEN p."pedidos1Telefono" IS NOT NULL THEN p."pedidos1Nombre" ELSE p."pedidos2Nombre" END AS contacto,
                co.fecha AS fecha, co.descripcion, co.factor_base::float8 AS factor,
                co.precio_unitario::float8 AS precio_unitario,
                CASE WHEN co.qty_base > 0 AND co.subtotal IS NOT NULL
                     THEN (co.subtotal / co.qty_base)::float8
                     WHEN co.precio_unitario IS NOT NULL THEN (co.precio_unitario / co.factor_base)::float8
                END AS precio_base,
                ROW_NUMBER() OVER (PARTITION BY co.insumo_id, p.id ORDER BY co.fecha DESC, co.linea) AS rn,
                COUNT(*) OVER (PARTITION BY co.insumo_id, p.id) AS compras
           FROM insumo_compra_linea co
           JOIN proveedores p ON p.id = co.proveedor_id
          WHERE co.cliente_id = $1::uuid AND co.fecha >= $2::date
            AND co.estado_revision::text = ANY($3::text[])
            AND co.tipo <> 'NOTA_CREDITO'
       )
       SELECT insumo_id, proveedor_id, razon_social, dias_entrega, telefono, contacto,
              to_char(fecha, 'YYYY-MM-DD') AS fecha, descripcion, factor, precio_unitario, precio_base, compras
         FROM lineas WHERE rn = 1`,
      clienteId,
      sumarDias(hoy, -180),
      [...ESTADOS_COMPRA]
    ),
  ])

  const baseDe = new Map(insumos.map((i) => [i.id, i.unidadBase]))
  const seguroDe = new Map(seguros.map((s) => [s.insumoId, s.stockSeguro != null ? Number(s.stockSeguro) : null]))
  const despachoDe = new Map(despachoRows.map((d) => [d.insumo_id, Number(d.qty) || 0]))
  const enCaminoDe = new Map(enCaminoRows.map((e) => [e.insumo_id, Number(e.qty) || 0]))
  const consumoTotal = new Map<string, number>()
  const consumoCentral = new Map<string, number>()
  for (const r of consumoRows) {
    const base = baseDe.get(r.insumo_id)
    if (!base) continue
    try {
      consumoTotal.set(r.insumo_id, (consumoTotal.get(r.insumo_id) ?? 0) + convert(Number(r.total), r.unidad, base))
      consumoCentral.set(r.insumo_id, (consumoCentral.get(r.insumo_id) ?? 0) + convert(Number(r.central), r.unidad, base))
    } catch {
      /* unidad de receta incompatible */
    }
  }
  const provDe = new Map<string, ProveedorInsumo[]>()
  for (const c of compraRows) {
    const lista = provDe.get(c.insumo_id) ?? []
    lista.push({
      proveedorId: c.proveedor_id,
      razonSocial: c.razon_social,
      diasEntrega: c.dias_entrega,
      telefono: c.telefono,
      contacto: c.contacto,
      ultimaFecha: c.fecha,
      descripcion: c.descripcion,
      factor: Number(c.factor) || 1,
      precioUnitario: c.precio_unitario != null ? Number(c.precio_unitario) : null,
      precioBase: c.precio_base != null ? Number(c.precio_base) : null,
      compras: Number(c.compras),
    })
    provDe.set(c.insumo_id, lista)
  }

  return insumos.map((i) => {
    const s = stock.get(i.id)
    const seguro = seguroDe.get(i.id) ?? null
    const enCamino = enCaminoDe.get(i.id) ?? 0
    const salida = Math.max(consumoTotal.get(i.id) ?? 0, (despachoDe.get(i.id) ?? 0) + (consumoCentral.get(i.id) ?? 0))
    const demandaDiaria = salida / ventana
    // El proveedor sugerido es el de la compra más reciente; el resto, por precio.
    const proveedores = (provDe.get(i.id) ?? []).sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha))
    const sugerido = proveedores[0] ?? null
    const resto = proveedores.slice(1).sort((a, b) => (a.precioBase ?? Infinity) - (b.precioBase ?? Infinity))
    const diasEntrega = sugerido?.diasEntrega ?? ENTREGA_DEFAULT

    let estado: Sugerencia['estado'] = 'sin_datos'
    let sugeridoBase = 0
    const stockActual = s?.esperado ?? null
    if (stockActual !== null && seguro !== null) {
      const disponible = stockActual + enCamino
      const alLlegar = disponible - demandaDiaria * diasEntrega
      estado = disponible <= seguro ? 'pedir' : alLlegar <= seguro ? 'pronto' : 'ok'
      const objetivo = seguro + demandaDiaria * (diasEntrega + diasObjetivo)
      sugeridoBase = Math.max(0, objetivo - disponible)
    }

    return {
      insumoId: i.id,
      nombre: i.nombre,
      unidad: i.unidadBase,
      stock: stockActual,
      ultimoConteoFecha: s?.ultimoConteoFecha ?? null,
      seguro,
      enCamino,
      demandaDiaria,
      diasCobertura: stockActual !== null && demandaDiaria > 0 ? (stockActual + enCamino) / demandaDiaria : null,
      diasEntrega,
      estado,
      sugeridoBase,
      proveedorSugeridoId: sugerido?.proveedorId ?? null,
      proveedores: sugerido ? [sugerido, ...resto] : [],
    }
  })
}
