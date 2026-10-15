import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { estructuraDe } from '@/lib/pos/db'

export const dynamic = 'force-dynamic'

/** Sucursales con sus cajas, y los depósitos para poder elegir de dónde descuenta. */
export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error

  const [sucursales, depositos] = await Promise.all([
    estructuraDe(clienteId!),
    prisma.$queryRaw<Array<{ id: string; nombre: string }>>`
      SELECT id, nombre FROM depositos WHERE "clienteId" = ${clienteId}::uuid ORDER BY nombre
    `,
  ])
  return NextResponse.json({ sucursales, depositos })
}

interface Cuerpo {
  tipo: 'sucursal' | 'caja'
  id?: string
  nombre?: string
  direccion?: string | null
  depositoId?: string | null
  sucursalId?: string
  puntoVenta?: number | null
  activa?: boolean
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.nombre?.trim()) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })

  try {
    if (b.tipo === 'sucursal') {
      const [s] = await prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO pos_sucursales ("clienteId", nombre, direccion, "depositoId")
        VALUES (${clienteId}::uuid, ${b.nombre.trim()}, ${b.direccion?.trim() || null}, ${b.depositoId || null}::uuid)
        RETURNING id
      `
      return NextResponse.json({ id: s!.id })
    }
    if (!b.sucursalId) return NextResponse.json({ error: 'Falta la sucursal' }, { status: 400 })
    const [c] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_cajas ("clienteId", "sucursalId", nombre, "puntoVenta")
      VALUES (${clienteId}::uuid, ${b.sucursalId}::uuid, ${b.nombre.trim()}, ${b.puntoVenta ?? null})
      RETURNING id
    `
    return NextResponse.json({ id: c!.id })
  } catch (e) {
    return NextResponse.json({ error: mensaje(e) }, { status: 409 })
  }
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.CONFIGURACION, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as Cuerpo | null
  if (!b?.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  try {
    if (b.tipo === 'sucursal') {
      await prisma.$executeRaw`
        UPDATE pos_sucursales SET
          nombre = COALESCE(${b.nombre?.trim() ?? null}, nombre),
          direccion = COALESCE(${b.direccion?.trim() ?? null}, direccion),
          "depositoId" = COALESCE(${b.depositoId ?? null}::uuid, "depositoId"),
          activa = COALESCE(${b.activa ?? null}, activa),
          "updatedAt" = now()
        WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
      `
    } else {
      // El punto de venta no se cambia con la caja operando: la numeración
      // fiscal ya emitida quedaría colgada de otro PV.
      const [abierta] = await prisma.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM pos_sesiones WHERE "cajaId" = ${b.id}::uuid AND "cerradaAt" IS NULL
      `
      if (b.puntoVenta !== undefined && (abierta?.n ?? 0) > 0) {
        return NextResponse.json({ error: 'Cerrá la caja antes de cambiarle el punto de venta' }, { status: 409 })
      }
      await prisma.$executeRaw`
        UPDATE pos_cajas SET
          nombre = COALESCE(${b.nombre?.trim() ?? null}, nombre),
          "puntoVenta" = COALESCE(${b.puntoVenta ?? null}, "puntoVenta"),
          activa = COALESCE(${b.activa ?? null}, activa),
          "updatedAt" = now()
        WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
      `
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: mensaje(e) }, { status: 409 })
  }
}

function mensaje(e: unknown): string {
  const t = e instanceof Error ? e.message : ''
  if (t.includes('pos_cajas_pv_unico')) return 'Ese punto de venta ya lo usa otra caja'
  if (t.includes('pos_cajas_nombre_unica')) return 'Ya hay una caja con ese nombre en la sucursal'
  if (t.includes('pos_sucursales_nombre_unica')) return 'Ya existe una sucursal con ese nombre'
  return 'No se pudo guardar'
}
