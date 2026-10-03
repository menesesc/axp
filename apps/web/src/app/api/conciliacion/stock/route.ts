import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { hoyAR, sumarDias } from '@/lib/fechas'
import { stockEsperadoPorInsumo } from '@/lib/conciliacion/stock'
import { getDepositos } from '@/lib/stock/depositos'

export const dynamic = 'force-dynamic'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Planilla de stock de un depósito para una fecha
 * (?fecha=YYYY-MM-DD, default hoy; ?depositoId=, default el central):
 * cada insumo activo con su conteo de ese día (si ya se cargó), el último
 * conteo anterior, el stock esperado a la mañana, el stock actual estimado
 * (incluye los movimientos del día), el stock seguro y la categoría con la que
 * se agrupa (la propia del insumo, o el rubro del producto si es venta directa). Además, las últimas
 * fechas con conteos del depósito. Solo cantidades.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_STOCK)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const fechaParam = sp.get('fecha') || ''
  const fecha = FECHA_RE.test(fechaParam) ? fechaParam : hoyAR()

  const depositos = await getDepositos(clienteId, true)
  const deposito = depositos.find((d) => d.id === sp.get('depositoId')) ?? depositos.find((d) => d.esCentral) ?? depositos[0]
  if (!deposito) return NextResponse.json({ error: 'No hay depósitos configurados' }, { status: 400 })

  const [insumos, conteosDia, esperados, actuales, seguros, fechas] = await Promise.all([
    prisma.insumos.findMany({
      where: { clienteId, activo: true },
      select: {
        id: true,
        nombre: true,
        unidadBase: true,
        categoria: true,
        subcategoria: true,
        // Los insumos de venta directa heredan el rubro del producto, así la
        // planilla se agrupa sin tener que cargar la categoría a mano en 133
        // vinos y bebidas.
        productMaster: { select: { rubroNombre: true } },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.insumo_stock.findMany({
      where: { fecha: new Date(fecha), depositoId: deposito.id, insumo: { clienteId } },
      select: { insumoId: true, cantidad: true, nota: true },
    }),
    stockEsperadoPorInsumo(clienteId, fecha, deposito.id),
    // "Actual" = a la mañana del día siguiente: incluye los movimientos de hoy.
    stockEsperadoPorInsumo(clienteId, sumarDias(hoyAR(), 1), deposito.id),
    prisma.insumo_deposito.findMany({
      where: { depositoId: deposito.id, insumo: { clienteId } },
      select: { insumoId: true, stockSeguro: true },
    }),
    prisma.$queryRawUnsafe<Array<{ fecha: string; insumos: bigint }>>(
      `SELECT to_char(s.fecha, 'YYYY-MM-DD') AS fecha, COUNT(*)::bigint AS insumos
         FROM insumo_stock s JOIN insumos i ON i.id = s."insumoId"
        WHERE i."clienteId" = $1::uuid AND s."depositoId" = $2::uuid
        GROUP BY s.fecha ORDER BY s.fecha DESC LIMIT 12`,
      clienteId,
      deposito.id
    ),
  ])

  const conteoDe = new Map(conteosDia.map((c) => [c.insumoId, c]))
  const seguroDe = new Map(seguros.map((s) => [s.insumoId, s.stockSeguro != null ? Number(s.stockSeguro) : null]))

  return NextResponse.json({
    fecha,
    deposito,
    depositos,
    insumos: insumos.map((i) => {
      const c = conteoDe.get(i.id)
      const e = esperados.get(i.id)
      const a = actuales.get(i.id)
      return {
        id: i.id,
        nombre: i.nombre,
        unidadBase: i.unidadBase,
        categoria: i.categoria ?? i.productMaster?.rubroNombre ?? null,
        subcategoria: i.subcategoria,
        conteo: c ? Number(c.cantidad) : null,
        nota: c?.nota ?? null,
        ultimoConteoFecha: e?.ultimoConteoFecha ?? null,
        ultimoConteo: e?.ultimoConteo ?? null,
        esperado: e?.esperado ?? null,
        actual: a?.esperado ?? null,
        stockSeguro: seguroDe.get(i.id) ?? null,
      }
    }),
    fechas: fechas.map((f) => ({ fecha: f.fecha, insumos: Number(f.insumos) })),
  })
}

/**
 * Guarda conteos y/o stock seguro de un depósito.
 * Body: {
 *   fecha, depositoId,
 *   conteos?: [{ insumoId, cantidad, nota? }],   // cantidad null borra el conteo
 *   seguros?: [{ insumoId, stockSeguro }],       // stockSeguro null lo quita
 * }
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_STOCK, 'edit')
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const fecha = String(body?.fecha || '')
  const conteos: Array<{ insumoId: string; cantidad: number | null; nota?: string | null }> = Array.isArray(body?.conteos)
    ? body.conteos
    : []
  const seguros: Array<{ insumoId: string; stockSeguro: number | null }> = Array.isArray(body?.seguros) ? body.seguros : []

  const deposito = await prisma.depositos.findFirst({ where: { id: String(body?.depositoId || ''), clienteId } })
  if (!deposito) return NextResponse.json({ error: 'Depósito no encontrado' }, { status: 404 })
  if (conteos.length > 0) {
    if (!FECHA_RE.test(fecha)) return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 })
    if (fecha > hoyAR()) return NextResponse.json({ error: 'No se puede contar stock en una fecha futura' }, { status: 400 })
  }
  if (conteos.length === 0 && seguros.length === 0) {
    return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
  }

  const invalido = (v: unknown) => v !== null && (!Number.isFinite(Number(v)) || Number(v) < 0)
  if (conteos.some((c) => invalido(c.cantidad)) || seguros.some((s) => invalido(s.stockSeguro))) {
    return NextResponse.json({ error: 'Hay cantidades inválidas' }, { status: 400 })
  }

  // Solo insumos del cliente.
  const propios = new Set(
    (
      await prisma.insumos.findMany({
        where: { clienteId, id: { in: [...conteos, ...seguros].map((c) => c.insumoId) } },
        select: { id: true },
      })
    ).map((i) => i.id)
  )
  const d = fecha ? new Date(fecha) : null
  const depositoId = deposito.id

  await prisma.$transaction([
    ...conteos
      .filter((c) => propios.has(c.insumoId))
      .map((c) =>
        c.cantidad === null
          ? prisma.insumo_stock.deleteMany({ where: { insumoId: c.insumoId, depositoId, fecha: d! } })
          : prisma.insumo_stock.upsert({
              where: { insumoId_depositoId_fecha: { insumoId: c.insumoId, depositoId, fecha: d! } },
              create: { insumoId: c.insumoId, depositoId, fecha: d!, cantidad: Number(c.cantidad), nota: c.nota?.trim() || null },
              update: { cantidad: Number(c.cantidad), nota: c.nota?.trim() || null },
            })
      ),
    ...seguros
      .filter((s) => propios.has(s.insumoId))
      .map((s) =>
        prisma.insumo_deposito.upsert({
          where: { insumoId_depositoId: { insumoId: s.insumoId, depositoId } },
          create: { insumoId: s.insumoId, depositoId, stockSeguro: s.stockSeguro },
          update: { stockSeguro: s.stockSeguro },
        })
      ),
  ])

  return NextResponse.json({ guardados: conteos.length + seguros.length })
}
