import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { hoyAR } from '@/lib/fechas'
import { stockEsperadoPorInsumo } from '@/lib/conciliacion/stock'

export const dynamic = 'force-dynamic'

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Planilla de conteo de stock para una fecha (?fecha=YYYY-MM-DD, default hoy):
 * cada insumo activo con su conteo de ese día (si ya se cargó), el último
 * conteo anterior y el stock esperado a la mañana de esa fecha. Además, las
 * últimas fechas con conteos para navegar el historial. Solo cantidades.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONCILIACION_STOCK)
  if (error) return error
  if (!clienteId) return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })

  const fechaParam = request.nextUrl.searchParams.get('fecha') || ''
  const fecha = FECHA_RE.test(fechaParam) ? fechaParam : hoyAR()

  const [insumos, conteosDia, esperados, fechas] = await Promise.all([
    prisma.insumos.findMany({
      where: { clienteId, activo: true },
      select: { id: true, nombre: true, unidadBase: true, categoria: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.insumo_stock.findMany({
      where: { fecha: new Date(fecha), insumo: { clienteId } },
      select: { insumoId: true, cantidad: true, nota: true },
    }),
    stockEsperadoPorInsumo(clienteId, fecha),
    prisma.$queryRawUnsafe<Array<{ fecha: string; insumos: bigint }>>(
      `SELECT to_char(s.fecha, 'YYYY-MM-DD') AS fecha, COUNT(*)::bigint AS insumos
         FROM insumo_stock s JOIN insumos i ON i.id = s."insumoId"
        WHERE i."clienteId" = $1::uuid
        GROUP BY s.fecha ORDER BY s.fecha DESC LIMIT 12`,
      clienteId
    ),
  ])

  const conteoDe = new Map(conteosDia.map((c) => [c.insumoId, c]))

  return NextResponse.json({
    fecha,
    insumos: insumos.map((i) => {
      const c = conteoDe.get(i.id)
      const e = esperados.get(i.id)
      return {
        id: i.id,
        nombre: i.nombre,
        unidadBase: i.unidadBase,
        categoria: i.categoria,
        conteo: c ? Number(c.cantidad) : null,
        nota: c?.nota ?? null,
        ultimoConteoFecha: e?.ultimoConteoFecha ?? null,
        ultimoConteo: e?.ultimoConteo ?? null,
        esperado: e?.esperado ?? null,
      }
    }),
    fechas: fechas.map((f) => ({ fecha: f.fecha, insumos: Number(f.insumos) })),
  })
}

/**
 * Guarda varios conteos de una fecha de una vez.
 * Body: { fecha, conteos: [{ insumoId, cantidad, nota? }] }
 * cantidad null borra el conteo de ese insumo en esa fecha.
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
  if (!FECHA_RE.test(fecha)) return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 })
  if (fecha > hoyAR()) return NextResponse.json({ error: 'No se puede contar stock en una fecha futura' }, { status: 400 })
  if (conteos.length === 0) return NextResponse.json({ error: 'No hay conteos para guardar' }, { status: 400 })

  for (const c of conteos) {
    if (c.cantidad !== null && (!Number.isFinite(Number(c.cantidad)) || Number(c.cantidad) < 0)) {
      return NextResponse.json({ error: 'Hay cantidades inválidas' }, { status: 400 })
    }
  }

  // Solo insumos del cliente.
  const propios = new Set(
    (
      await prisma.insumos.findMany({
        where: { clienteId, id: { in: conteos.map((c) => c.insumoId) } },
        select: { id: true },
      })
    ).map((i) => i.id)
  )
  const validos = conteos.filter((c) => propios.has(c.insumoId))
  const d = new Date(fecha)

  await prisma.$transaction(
    validos.map((c) =>
      c.cantidad === null
        ? prisma.insumo_stock.deleteMany({ where: { insumoId: c.insumoId, fecha: d } })
        : prisma.insumo_stock.upsert({
            where: { insumoId_fecha: { insumoId: c.insumoId, fecha: d } },
            create: { insumoId: c.insumoId, fecha: d, cantidad: Number(c.cantidad), nota: c.nota?.trim() || null },
            update: { cantidad: Number(c.cantidad), nota: c.nota?.trim() || null },
          })
    )
  )

  return NextResponse.json({ guardados: validos.length })
}
