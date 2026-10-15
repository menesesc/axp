import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * El mapa de mesas con el estado de cada una.
 *
 * Es la pantalla que tiene que estar siempre a la vista en un restaurante: de
 * un vistazo se ve qué mesa está libre, cuál pidió la cuenta y cuál lleva
 * veinte minutos esperando un plato. El estado no se guarda, se deduce del
 * pedido y de la cocina, que son la verdad; una columna de estado se
 * desincroniza en cuanto alguien toca algo por otro lado.
 *
 * Trae todas las mesas de la sucursal, no las del salón de la caja: cualquier
 * caja puede cobrar cualquier mesa, así que el cajero de planta baja tiene que
 * poder ver y cobrar una del primer piso.
 */
export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS)
  if (error) return error

  const sucursalId = request.nextUrl.searchParams.get('sucursalId')

  const [sectores, mesas] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; nombre: string; sucursalId: string; mesas: number }>>`
      SELECT se.id, se.nombre, se."sucursalId",
             (SELECT count(*)::int FROM pos_mesas m WHERE m."sectorId" = se.id AND m.activa) AS mesas
        FROM pos_sectores se
       WHERE se."clienteId" = ${clienteId}::uuid AND se.activo
         AND (${sucursalId}::uuid IS NULL OR se."sucursalId" = ${sucursalId}::uuid)
       ORDER BY se.orden, se.nombre
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT mesa_id AS id, sector_id AS "sectorId", nombre, capacidad,
             x::float8 AS x, y::float8 AS y,
             pedido_id AS "pedidoId", pedido_numero AS "pedidoNumero",
             comensales, total::float8 AS total, mozo, mozo_id AS "mozoId", estado,
             round(extract(epoch FROM (now() - desde)) / 60)::int AS minutos,
             en_cocina AS "enCocina",
             round(extract(epoch FROM (now() - espera_desde)) / 60)::int AS "minutosCocina"
        FROM pos_mesa_estado
       WHERE cliente_id = ${clienteId}::uuid
         AND (${sucursalId}::uuid IS NULL OR sucursal_id = ${sucursalId}::uuid)
       ORDER BY nombre
    `,
  ])

  return NextResponse.json({ sectores, mesas })
}

/** Alta y edición de mesas, incluido arrastrarlas en el plano. */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { sucursalId?: string; sectorId?: string; nombre?: string; capacidad?: number; desde?: number; hasta?: number }
    | null
  if (!b?.sucursalId || !b.sectorId) return NextResponse.json({ error: 'Falta el salón' }, { status: 400 })

  // Alta por rango: cargar treinta mesas de a una no es razonable.
  if (b.desde != null && b.hasta != null) {
    if (b.hasta < b.desde || b.hasta - b.desde > 200) {
      return NextResponse.json({ error: 'Rango inválido' }, { status: 400 })
    }
    let n = 0
    for (let i = b.desde; i <= b.hasta; i++) {
      n += await prisma.$executeRaw`
        INSERT INTO pos_mesas ("clienteId", "sucursalId", "sectorId", nombre, capacidad)
        VALUES (${clienteId}::uuid, ${b.sucursalId}::uuid, ${b.sectorId}::uuid, ${String(i)}, ${b.capacidad ?? 4})
        ON CONFLICT ("sucursalId", nombre) DO NOTHING
      `
    }
    return NextResponse.json({ creadas: n })
  }

  if (!b.nombre?.trim()) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })
  try {
    const [m] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_mesas ("clienteId", "sucursalId", "sectorId", nombre, capacidad)
      VALUES (${clienteId}::uuid, ${b.sucursalId}::uuid, ${b.sectorId}::uuid, ${b.nombre.trim()}, ${b.capacidad ?? 4})
      RETURNING id
    `
    return NextResponse.json({ id: m!.id })
  } catch {
    return NextResponse.json({ error: 'Ya hay una mesa con ese nombre' }, { status: 409 })
  }
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { id?: string; nombre?: string; capacidad?: number; x?: number; y?: number; sectorId?: string; activa?: boolean }
    | null
  if (!b?.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  await prisma.$executeRaw`
    UPDATE pos_mesas SET
      nombre      = COALESCE(${b.nombre?.trim() ?? null}, nombre),
      capacidad   = COALESCE(${b.capacidad ?? null}, capacidad),
      x           = COALESCE(${b.x ?? null}, x),
      y           = COALESCE(${b.y ?? null}, y),
      "sectorId"  = COALESCE(${b.sectorId ?? null}::uuid, "sectorId"),
      activa      = COALESCE(${b.activa ?? null}, activa)
    WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}
