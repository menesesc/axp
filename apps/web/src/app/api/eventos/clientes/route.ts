import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { esUuid, mensajeError, numero, texto, type ClienteEvento } from '@/lib/eventos/db'

export const dynamic = 'force-dynamic'

/*
 * Clientes de eventos: particulares y agencias. Se cargan una vez y se usan
 * en todas sus reservas; las facturas (etapa 4) salen a su nombre.
 */

export async function GET(request: NextRequest) {
  const { clienteId, verImportes, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS)
  if (error) return error
  const q = request.nextUrl.searchParams.get('q')?.trim()
  const patron = q ? `%${q}%` : null
  const clientes = await prisma.$queryRaw<ClienteEvento[]>`
    SELECT c.id, c.tipo, c.nombre, c.cuit, c."condicionIva", c.telefono, c.email,
           c."comisionPct"::float8 AS "comisionPct", c.notas, c.activo,
           COALESCE(x.reservas, 0)::int AS reservas, x."ultimaFecha",
           COALESCE(x.total, 0)::float8 AS facturado
      FROM evento_clientes c
      LEFT JOIN LATERAL (
        SELECT count(*) AS reservas, to_char(max(r.fecha), 'YYYY-MM-DD') AS "ultimaFecha", sum(t.total) AS total
          FROM reservas r JOIN reserva_totales t ON t."reservaId" = r.id
         WHERE r."titularId" = c.id AND r.estado NOT IN ('RECHAZADO', 'CANCELADO')
      ) x ON true
     WHERE c."clienteId" = ${clienteId}::uuid
       AND (${patron}::text IS NULL OR c.nombre ILIKE ${patron} OR c.cuit ILIKE ${patron}
            OR c.telefono ILIKE ${patron} OR c.email ILIKE ${patron})
     ORDER BY c.activo DESC, c.nombre
     LIMIT 1000
  `
  return NextResponse.json({ clientes: verImportes ? clientes : clientes.map((c) => ({ ...c, facturado: 0 })) })
}

function leer(b: Record<string, unknown>) {
  const tipo = b.tipo === 'AGENCIA' ? 'AGENCIA' : 'PARTICULAR'
  const condicionIva = ['CF', 'RI', 'MT', 'EX'].includes(b.condicionIva as string) ? (b.condicionIva as string) : 'CF'
  const cuit = texto(b.cuit, 13)?.replace(/\D/g, '') || null
  const comision = numero(b.comisionPct) ?? 0
  return {
    tipo,
    nombre: texto(b.nombre, 160),
    cuit,
    condicionIva,
    telefono: texto(b.telefono, 40),
    email: texto(b.email, 160),
    comisionPct: Math.min(comision, 100),
    notas: texto(b.notas, 2000),
  }
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'Faltan los datos' }, { status: 400 })
  const c = leer(b)
  if (!c.nombre) return NextResponse.json({ error: 'Poné el nombre' }, { status: 400 })
  if (c.cuit && c.cuit.length !== 11) return NextResponse.json({ error: 'El CUIT tiene 11 dígitos' }, { status: 400 })
  try {
    const [r] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO evento_clientes ("clienteId", tipo, nombre, cuit, "condicionIva", telefono, email, "comisionPct", notas)
      VALUES (${clienteId}::uuid, ${c.tipo}, ${c.nombre}, ${c.cuit}, ${c.condicionIva}, ${c.telefono}, ${c.email},
              ${c.comisionPct}::numeric, ${c.notas})
      RETURNING id
    `
    return NextResponse.json({ id: r!.id })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.EVENTOS_RESERVAS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || !esUuid(b.id)) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  // Sólo activar/desactivar, o el formulario entero.
  if (Object.keys(b).length === 2 && typeof b.activo === 'boolean') {
    await prisma.$executeRaw`
      UPDATE evento_clientes SET activo = ${b.activo}, "updatedAt" = now()
       WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    return NextResponse.json({ ok: true })
  }
  const c = leer(b)
  if (!c.nombre) return NextResponse.json({ error: 'Poné el nombre' }, { status: 400 })
  if (c.cuit && c.cuit.length !== 11) return NextResponse.json({ error: 'El CUIT tiene 11 dígitos' }, { status: 400 })
  try {
    await prisma.$executeRaw`
      UPDATE evento_clientes SET tipo = ${c.tipo}, nombre = ${c.nombre}, cuit = ${c.cuit}, "condicionIva" = ${c.condicionIva},
             telefono = ${c.telefono}, email = ${c.email}, "comisionPct" = ${c.comisionPct}::numeric, notas = ${c.notas},
             "updatedAt" = now()
       WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensajeError(e) }, { status: 400 })
  }
}
