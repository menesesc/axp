import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireClienteId } from '@/lib/auth'
import { convert } from '@/lib/conciliacion/units'
import { defaultRange, ESTADOS_COMPRA } from '../../../_range'

export const dynamic = 'force-dynamic'

/**
 * Detalle de conciliación de un insumo en un período: serie semanal de consumo
 * teórico vs comprado (+ costo unitario), ranking de productos que más lo
 * consumen y diferencia acumulada. Compras sobre facturas confirmadas/pagadas.
 *
 * Query: ?from=&to=&sucursal=
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const insumo = await prisma.insumos.findFirst({
    where: { id: params.id, clienteId: clienteId! },
    select: { id: true, nombre: true, unidadBase: true },
  })
  if (!insumo) return NextResponse.json({ error: 'Insumo no encontrado' }, { status: 404 })

  const sp = request.nextUrl.searchParams
  const def = defaultRange()
  const from = sp.get('from') || def.from
  const to = sp.get('to') || def.to
  const sucursal = sp.get('sucursal') || null
  const base = insumo.unidadBase
  const insumoId = insumo.id

  // Consumo teórico semanal (ventas × receta + merma), por unidad de receta.
  const consumoRows = await prisma.$queryRawUnsafe<Array<{
    semana: string
    unidad_receta: string
    qty: number
  }>>(`
    SELECT to_char(date_trunc('week', c.fecha), 'YYYY-MM-DD') AS semana,
           ri.unidad AS unidad_receta,
           SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::numeric AS qty
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
    JOIN sales_recipe_items ri ON ri."recipeId" = r.id AND ri."insumoId" = $5::uuid
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
    GROUP BY semana, ri.unidad
    ORDER BY semana
  `, clienteId, from, to, sucursal, insumo.id)

  const consumoByWeek = new Map<string, number>()
  for (const row of consumoRows) {
    let q: number
    try { q = convert(Number(row.qty), row.unidad_receta, base) } catch { continue }
    const key = String(row.semana).slice(0, 10)
    consumoByWeek.set(key, (consumoByWeek.get(key) ?? 0) + q)
  }

  // Comprado semanal (líneas de factura × factorBase) + costo.
  const compradoRows = await prisma.$queryRawUnsafe<Array<{
    semana: string
    qty_base: number
    costo: number | null
  }>>(`
    SELECT to_char(date_trunc('week', d."fechaEmision"), 'YYYY-MM-DD') AS semana,
           SUM(di.cantidad * a."factorBase")::numeric AS qty_base,
           SUM(di.subtotal)::numeric AS costo
    FROM documento_items di
    JOIN documentos d ON d.id = di."documentoId"
    JOIN insumo_alias a ON di.descripcion ILIKE '%' || a.patron || '%'
    WHERE a."insumoId" = $5::uuid
      AND d."clienteId" = $1::uuid
      AND d."fechaEmision" >= $2::date AND d."fechaEmision" <= $3::date
      AND d."estadoRevision"::text = ANY($4::text[])
    GROUP BY semana
    ORDER BY semana
  `, clienteId, from, to, [...ESTADOS_COMPRA], insumo.id)

  const compradoByWeek = new Map<string, { qty: number; costo: number }>()
  for (const row of compradoRows) {
    const key = String(row.semana).slice(0, 10)
    compradoByWeek.set(key, {
      qty: Number(row.qty_base) || 0,
      costo: row.costo != null ? Number(row.costo) : 0,
    })
  }

  // Serie unificada de semanas, ordenada ascendente.
  const semanas = [...new Set([...consumoByWeek.keys(), ...compradoByWeek.keys()])].sort()
  let consumoAcum = 0
  let compradoAcum = 0
  const serie = semanas.map((semana) => {
    const consumo = consumoByWeek.get(semana) ?? 0
    const compra = compradoByWeek.get(semana) ?? { qty: 0, costo: 0 }
    consumoAcum += consumo
    compradoAcum += compra.qty
    return {
      semana,
      consumo,
      comprado: compra.qty,
      costo: compra.costo,
      costoUnitario: compra.qty > 0 ? compra.costo / compra.qty : null,
      costoUnitarioFill: null as number | null,
      difAcum: compradoAcum - consumoAcum,
      consumoAcum,
      compradoAcum,
    }
  })

  // Costo unitario rellenado con el último conocido (y el primero hacia atrás)
  // para que el gráfico nunca quede vacío en semanas sin compra.
  const primerCosto = serie.find((w) => w.costoUnitario != null)?.costoUnitario ?? null
  let ultimoCosto: number | null = primerCosto
  for (const w of serie) {
    if (w.costoUnitario != null) ultimoCosto = w.costoUnitario
    w.costoUnitarioFill = ultimoCosto
  }

  // Ranking de productos que más consumen el insumo en el período.
  const prodRows = await prisma.$queryRawUnsafe<Array<{
    pid: string
    nombre: string
    unidades: number
    unidad_receta: string
    qty: number
  }>>(`
    SELECT ci."productMasterId" AS pid,
           MAX(pm.nombre) AS nombre,
           SUM(ci.unidades)::numeric AS unidades,
           ri.unidad AS unidad_receta,
           SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::numeric AS qty
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
    JOIN sales_recipe_items ri ON ri."recipeId" = r.id AND ri."insumoId" = $5::uuid
    JOIN sales_product_master pm ON pm.id = ci."productMasterId"
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
    GROUP BY ci."productMasterId", ri.unidad
  `, clienteId, from, to, sucursal, insumo.id)

  const prodMap = new Map<string, { nombre: string; unidades: number; consumo: number }>()
  for (const row of prodRows) {
    let q: number
    try { q = convert(Number(row.qty), row.unidad_receta, base) } catch { continue }
    const prev = prodMap.get(row.pid) ?? { nombre: row.nombre, unidades: 0, consumo: 0 }
    prev.consumo += q
    prev.unidades += Number(row.unidades) || 0
    prodMap.set(row.pid, prev)
  }
  const productos = [...prodMap.entries()]
    .map(([productMasterId, v]) => ({ productMasterId, ...v }))
    .sort((a, b) => b.consumo - a.consumo)

  // Consumo teórico por día (evolución diaria, en unidadBase).
  const consumoDiaRows = await prisma.$queryRawUnsafe<Array<{ dia: string; unidad_receta: string; qty: number }>>(`
    SELECT to_char(c.fecha, 'YYYY-MM-DD') AS dia,
           ri.unidad AS unidad_receta,
           SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::numeric AS qty
    FROM sales_closure_items ci
    JOIN sales_closures c ON c.id = ci."closureId"
    JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
    JOIN sales_recipe_items ri ON ri."recipeId" = r.id AND ri."insumoId" = $5::uuid
    WHERE c."clienteId" = $1::uuid
      AND c.fecha >= $2::date AND c.fecha <= $3::date
      AND ($4::text IS NULL OR c.sucursal = $4)
    GROUP BY dia, ri.unidad
    ORDER BY dia
  `, clienteId, from, to, sucursal, insumo.id)
  const consumoDiaMap = new Map<string, number>()
  for (const row of consumoDiaRows) {
    let q: number
    try { q = convert(Number(row.qty), row.unidad_receta, base) } catch { continue }
    consumoDiaMap.set(row.dia, (consumoDiaMap.get(row.dia) ?? 0) + q)
  }
  const consumoPorDia = [...consumoDiaMap.entries()].sort().map(([fecha, consumo]) => ({ fecha, consumo }))

  // Comprado por día (en unidadBase), para el gráfico combinado y la serie de stock.
  const compradoDiaRows = await prisma.$queryRawUnsafe<Array<{ dia: string; qty: number | null }>>(`
    SELECT to_char(d."fechaEmision", 'YYYY-MM-DD') AS dia,
           SUM(di.cantidad * a."factorBase")::numeric AS qty
    FROM documento_items di
    JOIN documentos d ON d.id = di."documentoId"
    JOIN insumo_alias a ON di.descripcion ILIKE '%' || a.patron || '%'
    WHERE a."insumoId" = $5::uuid AND d."clienteId" = $1::uuid
      AND d."fechaEmision" >= $2::date AND d."fechaEmision" <= $3::date
      AND d."estadoRevision"::text = ANY($4::text[])
    GROUP BY dia
    ORDER BY dia
  `, clienteId, from, to, [...ESTADOS_COMPRA], insumo.id)
  const compradoDiaMap = new Map<string, number>()
  for (const row of compradoDiaRows) compradoDiaMap.set(row.dia, Number(row.qty) || 0)
  const compradoPorDia = [...compradoDiaMap.entries()].sort().map(([fecha, comprado]) => ({ fecha, comprado }))

  // Resumen del período.
  const consumoTeorico = [...consumoByWeek.values()].reduce((s, v) => s + v, 0)
  const compradoBase = [...compradoByWeek.values()].reduce((s, v) => s + v.qty, 0)
  const costoComprado = [...compradoByWeek.values()].reduce((s, v) => s + v.costo, 0)
  const diferencia = compradoBase - consumoTeorico

  // --- Stock físico: separar merma real de la variación de inventario ---
  // Helpers de fecha (strings 'YYYY-MM-DD').
  const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10)
  const listDays = (a: string, b: string) => {
    const out: string[] = []
    let c = a
    while (c <= b) { out.push(c); c = addDays(c, 1) }
    return out
  }

  // Conteo de stock = a la mañana (antes del consumo del día), así que el intervalo
  // [d1, d2) cuenta los movimientos de los días d1..d2-1 inclusive.
  // Consumo teórico (en unidadBase) en [d1, d2).
  async function consumoBetween(d1: string, d2: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<Array<{ unidad_receta: string; qty: number }>>(`
      SELECT ri.unidad AS unidad_receta,
             SUM(ci.unidades * ri.cantidad * (1 + ri."mermaPct" / 100.0))::numeric AS qty
      FROM sales_closure_items ci
      JOIN sales_closures c ON c.id = ci."closureId"
      JOIN sales_recipes r ON r."productMasterId" = ci."productMasterId" AND r.activa = true
      JOIN sales_recipe_items ri ON ri."recipeId" = r.id AND ri."insumoId" = $5::uuid
      WHERE c."clienteId" = $1::uuid AND c.fecha >= $2::date AND c.fecha < $3::date
        AND ($4::text IS NULL OR c.sucursal = $4)
      GROUP BY ri.unidad
    `, clienteId, d1, d2, sucursal, insumoId)
    let total = 0
    for (const r of rows) { try { total += convert(Number(r.qty), r.unidad_receta, base) } catch { /* unidad legada */ } }
    return total
  }
  // Comprado (en unidadBase) entre dos fechas (d1 exclusivo, d2 inclusivo).
  async function compradoBetween(d1: string, d2: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<Array<{ qty: number | null }>>(`
      SELECT SUM(di.cantidad * a."factorBase")::numeric AS qty
      FROM documento_items di
      JOIN documentos d ON d.id = di."documentoId"
      JOIN insumo_alias a ON di.descripcion ILIKE '%' || a.patron || '%'
      WHERE a."insumoId" = $4::uuid AND d."clienteId" = $1::uuid
        AND d."fechaEmision" >= $2::date AND d."fechaEmision" < $3::date
        AND d."estadoRevision"::text = ANY($5::text[])
    `, clienteId, d1, d2, insumoId, [...ESTADOS_COMPRA])
    return Number(rows[0]?.qty) || 0
  }

  // ¿Las recetas activas que usan este insumo tienen merma esperada configurada?
  // Si no, el desvío de stock incluye la merma esperada (recortes/cocción) y no
  // es "merma real" todavía.
  const mermaAgg = await prisma.sales_recipe_items.aggregate({
    where: { insumoId, recipe: { activa: true, productMaster: { clienteId: clienteId! } } },
    _max: { mermaPct: true },
  })
  const mermaRecetaConfigurada = Number(mermaAgg._max.mermaPct ?? 0) > 0

  const conteos = await prisma.insumo_stock.findMany({
    where: { insumoId: insumo.id },
    orderBy: { fecha: 'asc' },
    select: { id: true, fecha: true, cantidad: true, nota: true },
  })
  const conteosOut = conteos.map((c) => ({
    id: c.id,
    fecha: c.fecha.toISOString().slice(0, 10),
    cantidad: Number(c.cantidad),
    nota: c.nota,
  }))

  // Serie diaria de stock teórico, anclada al conteo más reciente ≤ from (o al
  // primer conteo del rango), más los conteos reales — para ver de un vistazo si
  // el stock real coincide con el teórico en cada fecha. El conteo es a la mañana,
  // así que el stock teórico de un día no incluye el consumo de ese mismo día.
  const countByDate = new Map(conteosOut.map((c) => [c.fecha, c.cantidad]))
  // Ancla: el conteo más reciente ≤ from (o el primero del rango). Desde el ancla
  // se proyecta el stock teórico hacia adelante Y hacia atrás (movimientos en
  // reversa), para que la línea cubra todo el rango aunque el conteo sea reciente.
  let anchorDate: string | null = null
  let anchorVal = 0
  for (const c of conteosOut) { if (c.fecha <= from) { anchorDate = c.fecha; anchorVal = c.cantidad } }
  if (!anchorDate && conteosOut.length > 0) { anchorDate = conteosOut[0]!.fecha; anchorVal = conteosOut[0]!.cantidad }
  const dayMov = (dd: string) => (compradoDiaMap.get(dd) ?? 0) - (consumoDiaMap.get(dd) ?? 0)
  const teoricoByDay = new Map<string, number>()
  if (anchorDate) {
    // Hacia adelante desde el ancla (stock a la mañana de cada día).
    let st = anchorVal
    let cur = anchorDate
    while (cur <= to) {
      if (cur >= from) teoricoByDay.set(cur, st)
      st += dayMov(cur)
      cur = addDays(cur, 1)
    }
    // Hacia atrás: stockMañana(prev) = stockMañana(cur) − movimiento(prev).
    st = anchorVal
    cur = anchorDate
    while (cur > from) {
      const prev = addDays(cur, -1)
      st -= dayMov(prev)
      if (prev >= from) teoricoByDay.set(prev, st)
      cur = prev
    }
  }
  const stockSerie = listDays(from, to).map((dd) => ({
    fecha: dd,
    teorico: teoricoByDay.has(dd) ? Number(teoricoByDay.get(dd)!.toFixed(4)) : null,
    conteo: countByDate.has(dd) ? countByDate.get(dd)! : null,
  }))

  const dias = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1)
  const consumoDiario = consumoTeorico / dias

  // Stock teórico a la fecha `to`, proyectado desde el último conteo ≤ to.
  let stockTeoricoActual: number | null = null
  let ultimoConteoFecha: string | null = null
  const ultimoConteo = [...conteos].reverse().find((c) => c.fecha.toISOString().slice(0, 10) <= to)
  if (ultimoConteo) {
    const f = ultimoConteo.fecha.toISOString().slice(0, 10)
    ultimoConteoFecha = f
    // Movimientos [f, to] inclusive (to+1 exclusivo).
    const toExcl = addDays(to, 1)
    const [comp, cons] = await Promise.all([compradoBetween(f, toExcl), consumoBetween(f, toExcl)])
    stockTeoricoActual = Number(ultimoConteo.cantidad) + comp - cons
  }
  const diasCobertura =
    consumoDiario > 0 && stockTeoricoActual != null ? stockTeoricoActual / consumoDiario : null

  // Merma real del último intervalo cerrado (los dos conteos más recientes).
  let mermaIntervalo: {
    desde: string
    hasta: string
    stockInicial: number
    comprado: number
    consumoTeorico: number
    stockFinal: number
    merma: number
    mermaPct: number | null
  } | null = null
  if (conteos.length >= 2) {
    const c1 = conteos[conteos.length - 2]!
    const c2 = conteos[conteos.length - 1]!
    const f1 = c1.fecha.toISOString().slice(0, 10)
    const f2 = c2.fecha.toISOString().slice(0, 10)
    const [comp, cons] = await Promise.all([compradoBetween(f1, f2), consumoBetween(f1, f2)])
    const merma = Number(c1.cantidad) + comp - cons - Number(c2.cantidad)
    mermaIntervalo = {
      desde: f1,
      hasta: f2,
      stockInicial: Number(c1.cantidad),
      comprado: comp,
      consumoTeorico: cons,
      stockFinal: Number(c2.cantidad),
      merma,
      mermaPct: cons > 0 ? (merma / cons) * 100 : null,
    }
  }

  return NextResponse.json({
    insumo,
    periodo: { from, to, sucursal },
    resumen: {
      consumoTeorico,
      compradoBase,
      costoComprado,
      costoUnitario: compradoBase > 0 ? costoComprado / compradoBase : null,
      diferencia,
      diferenciaPct: consumoTeorico > 0 ? (diferencia / consumoTeorico) * 100 : null,
    },
    serie,
    consumoPorDia,
    compradoPorDia,
    productos,
    stock: {
      conteos: conteosOut,
      ultimoConteoFecha,
      stockTeoricoActual,
      consumoDiario,
      diasCobertura,
      dias,
      mermaIntervalo,
      mermaRecetaConfigurada,
      stockSerie,
    },
  })
}
