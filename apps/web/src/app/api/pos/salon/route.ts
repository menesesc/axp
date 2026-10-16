import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * El plano del salón: mesas con su estado y todo lo que no es mesa.
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

  const [sectores, mesas, elementos] = await Promise.all([
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
             forma, ancho::float8 AS ancho, alto::float8 AS alto,
             rotacion, cabeceras,
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
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id, "sectorId", tipo, etiqueta, x::float8 AS x, y::float8 AS y,
             ancho::float8 AS ancho, alto::float8 AS alto, rotacion, color
        FROM pos_elementos
       WHERE "clienteId" = ${clienteId}::uuid
         AND (${sucursalId}::uuid IS NULL OR "sucursalId" = ${sucursalId}::uuid)
       ORDER BY "createdAt"
    `,
  ])

  return NextResponse.json({ sectores, mesas, elementos })
}

interface CuerpoMesa {
  id?: string
  nombre?: string
  capacidad?: number
  x?: number | null
  y?: number | null
  forma?: string
  ancho?: number
  alto?: number
  rotacion?: number
  cabeceras?: number
  sectorId?: string
  activa?: boolean
}

const FORMAS = ['rect', 'redonda', 'cuadrada']

/** Alta de mesas: una sola, o por rango cuando se carga el salón entero. */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | (CuerpoMesa & { sucursalId?: string; desde?: number; hasta?: number })
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
  const forma = FORMAS.includes(b.forma ?? '') ? b.forma! : 'rect'
  try {
    const [m] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_mesas ("clienteId", "sucursalId", "sectorId", nombre, capacidad,
                             x, y, forma, ancho, alto, rotacion, cabeceras)
      VALUES (${clienteId}::uuid, ${b.sucursalId}::uuid, ${b.sectorId}::uuid,
              ${b.nombre.trim().slice(0, 30)}, ${b.capacidad ?? 4},
              ${b.x ?? null}, ${b.y ?? null}, ${forma},
              ${b.ancho ?? 70}, ${b.alto ?? 70}, ${b.rotacion ?? 0}, ${b.cabeceras ?? 0})
      RETURNING id
    `
    return NextResponse.json({ id: m!.id })
  } catch {
    return NextResponse.json({ error: 'Ya hay una mesa con ese nombre' }, { status: 409 })
  }
}

/**
 * Edita mesas. Acepta una o varias: arrastrar en el plano manda la posición
 * de todo lo que se movió junto, en una sola llamada.
 */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const body = (await request.json().catch(() => null)) as (CuerpoMesa & { mesas?: CuerpoMesa[] }) | null
  const cambios = body?.mesas ?? (body ? [body] : [])
  if (cambios.length === 0 || cambios.some((c) => !c.id)) {
    return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  }

  for (const c of cambios) {
    const forma = c.forma && FORMAS.includes(c.forma) ? c.forma : null
    try {
      await prisma.$executeRaw`
        UPDATE pos_mesas SET
          nombre      = COALESCE(${c.nombre?.trim()?.slice(0, 30) ?? null}, nombre),
          capacidad   = COALESCE(${c.capacidad ?? null}, capacidad),
          x           = COALESCE(${c.x ?? null}, x),
          y           = COALESCE(${c.y ?? null}, y),
          forma       = COALESCE(${forma}, forma),
          ancho       = COALESCE(${c.ancho ?? null}, ancho),
          alto        = COALESCE(${c.alto ?? null}, alto),
          rotacion    = COALESCE(${c.rotacion ?? null}, rotacion),
          cabeceras   = COALESCE(${c.cabeceras ?? null}, cabeceras),
          "sectorId"  = COALESCE(${c.sectorId ?? null}::uuid, "sectorId"),
          activa      = COALESCE(${c.activa ?? null}, activa)
        WHERE id = ${c.id}::uuid AND "clienteId" = ${clienteId}::uuid
      `
    } catch {
      return NextResponse.json({ error: `Ya hay una mesa llamada ${c.nombre}` }, { status: 409 })
    }
  }
  return NextResponse.json({ ok: true })
}

/**
 * Saca una mesa del salón.
 *
 * No se borra: se desactiva. Los pedidos viejos apuntan a ella y el histórico
 * tiene que seguir diciendo en qué mesa se consumió. Si tiene un pedido
 * abierto no se toca.
 */
export async function DELETE(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  const [abierto] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM pos_pedidos
     WHERE "mesaId" = ${id}::uuid AND estado IN ('abierto', 'bloqueado') LIMIT 1
  `
  if (abierto) return NextResponse.json({ error: 'La mesa tiene un consumo abierto' }, { status: 409 })

  await prisma.$executeRaw`
    UPDATE pos_mesas SET activa = false WHERE id = ${id}::uuid AND "clienteId" = ${clienteId}::uuid
  `
  return NextResponse.json({ ok: true })
}
