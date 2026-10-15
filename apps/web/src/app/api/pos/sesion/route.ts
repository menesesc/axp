import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

/**
 * Sesión de caja: el turno que habilita a vender.
 *
 * Sin turno abierto no se cobra, como en Maxirest. Es lo que deja un cajero
 * responsable de cada peso que entró, y lo que después se arquea.
 */

export async function GET(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS)
  if (error) return error

  const cajaId = request.nextUrl.searchParams.get('cajaId')

  const [cajas, abierta] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; nombre: string; sucursal: string; sucursalId: string; puntoVenta: number | null }>>`
      SELECT c.id, c.nombre, s.nombre AS sucursal, s.id AS "sucursalId", c."puntoVenta"
        FROM pos_cajas c JOIN pos_sucursales s ON s.id = c."sucursalId"
       WHERE c."clienteId" = ${clienteId}::uuid AND c.activa AND s.activa
       ORDER BY s.orden, c.nombre
    `,
    cajaId
      ? prisma.$queryRaw<Array<{
          id: string; numero: number; fondoInicial: number; abiertaAt: string
          usuarioId: string | null; usuario: string | null; pedidos: number; vendido: number
        }>>`
          SELECT ses.id, ses.numero, ses."fondoInicial"::float8 AS "fondoInicial",
                 to_char(ses."abiertaAt", 'YYYY-MM-DD"T"HH24:MI:SS') AS "abiertaAt",
                 ses."usuarioId", u.nombre AS usuario,
                 (SELECT count(*)::int FROM pos_pedidos p WHERE p."sesionId" = ses.id) AS pedidos,
                 COALESCE((SELECT sum(p.total) FROM pos_pedidos p
                            WHERE p."sesionId" = ses.id AND p.estado = 'cerrado'), 0)::float8 AS vendido
            FROM pos_sesiones ses
            LEFT JOIN pos_usuarios u ON u.id = ses."usuarioId"
           WHERE ses."cajaId" = ${cajaId}::uuid AND ses."cerradaAt" IS NULL
             AND ses."clienteId" = ${clienteId}::uuid
        `
      : Promise.resolve([]),
  ])

  return NextResponse.json({ cajas, sesion: abierta[0] ?? null })
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { cajaId?: string; usuarioId?: string | null; fondoInicial?: number }
    | null
  if (!b?.cajaId) return NextResponse.json({ error: 'Elegí una caja' }, { status: 400 })

  try {
    // El número de turno es por caja y consecutivo. Se calcula adentro del
    // insert para que dos aperturas simultáneas no saquen el mismo.
    const [s] = await prisma.$queryRaw<Array<{ id: string; numero: number }>>`
      INSERT INTO pos_sesiones ("clienteId", "cajaId", "usuarioId", numero, "fondoInicial")
      SELECT ${clienteId}::uuid, ${b.cajaId}::uuid, ${b.usuarioId || null}::uuid,
             COALESCE((SELECT max(numero) FROM pos_sesiones WHERE "cajaId" = ${b.cajaId}::uuid), 0) + 1,
             ${b.fondoInicial ?? 0}
      RETURNING id, numero
    `
    return NextResponse.json({ id: s!.id, numero: s!.numero })
  } catch (e) {
    const t = e instanceof Error ? e.message : ''
    if (t.includes('pos_sesiones_una_abierta')) {
      return NextResponse.json({ error: 'Esa caja ya tiene un turno abierto' }, { status: 409 })
    }
    return NextResponse.json({ error: 'No se pudo abrir la caja' }, { status: 500 })
  }
}

/** Cierre con arqueo. Lo declarado por moneda llega desde la pantalla. */
export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const b = (await request.json().catch(() => null)) as
    | { sesionId?: string; usuarioId?: string | null; arqueo?: Array<{ moneda: string; declarado: number; cotizacion?: number }>; nota?: string }
    | null
  if (!b?.sesionId) return NextResponse.json({ error: 'Falta la sesión' }, { status: 400 })

  const [abierta] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM pos_sesiones
     WHERE id = ${b.sesionId}::uuid AND "clienteId" = ${clienteId}::uuid AND "cerradaAt" IS NULL
  `
  if (!abierta) return NextResponse.json({ error: 'Esa sesión ya está cerrada' }, { status: 409 })

  // Un pedido abierto al cerrar la caja es plata que nadie cobró.
  const [pendientes] = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pos_pedidos
     WHERE "sesionId" = ${b.sesionId}::uuid AND estado IN ('abierto', 'bloqueado')
  `
  if ((pendientes?.n ?? 0) > 0) {
    return NextResponse.json(
      { error: `Quedan ${pendientes!.n} pedidos sin cerrar. Cobralos o anulalos antes.` },
      { status: 409 }
    )
  }

  for (const a of b.arqueo ?? []) {
    const [esperado] = await prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COALESCE(sum(pg.importe), 0)::float8 AS total
        FROM pos_pagos pg
        JOIN pos_cobros co ON co.id = pg."cobroId"
        JOIN pos_pedidos pe ON pe.id = co."pedidoId"
       WHERE pe."sesionId" = ${b.sesionId}::uuid AND pg.forma = 'efectivo' AND pg.moneda = ${a.moneda}
    `
    const base = a.moneda === 'ARS' ? (esperado?.total ?? 0) : (esperado?.total ?? 0)
    await prisma.$executeRaw`
      INSERT INTO pos_sesion_arqueo ("sesionId", moneda, cotizacion, esperado, declarado, diferencia)
      VALUES (${b.sesionId}::uuid, ${a.moneda}, ${a.cotizacion ?? 1}, ${base}, ${a.declarado},
              ${a.declarado - base})
      ON CONFLICT ("sesionId", moneda) DO UPDATE
        SET declarado = EXCLUDED.declarado, esperado = EXCLUDED.esperado,
            diferencia = EXCLUDED.diferencia, cotizacion = EXCLUDED.cotizacion
    `
  }

  await prisma.$executeRaw`
    UPDATE pos_sesiones
       SET "cerradaAt" = now(), "cerradaPor" = ${b.usuarioId || null}::uuid, nota = ${b.nota?.trim() || null}
     WHERE id = ${b.sesionId}::uuid
  `
  return NextResponse.json({ ok: true })
}
