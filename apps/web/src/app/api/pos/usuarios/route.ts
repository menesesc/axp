import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { usuariosDe } from '@/lib/pos/db'
import { hashearPin, pinValido } from '@/lib/pos/pin'

export const dynamic = 'force-dynamic'

const ROLES = ['admin', 'supervisor', 'cajero', 'mozo']

export async function GET() {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error

  const [usuarios, permisos, mozosDeCierres] = await Promise.all([
    usuariosDe(clienteId!),
    prisma.$queryRaw<Array<{ rol: string; accion: string; permitido: boolean; requiereAutorizacion: boolean; limite: number | null }>>`
      SELECT rol, accion, permitido, "requiereAutorizacion", limite::float8 AS limite
        FROM pos_permisos WHERE "clienteId" = ${clienteId}::uuid
    `,
    // Los mozos que ya aparecen en los cierres de Maxirest y todavía no están
    // cargados: es la lista con la que se siembra sin tipear.
    prisma.$queryRaw<Array<{ codigo: string; nombre: string; ventas: number }>>`
      SELECT w.codigo, (ARRAY_AGG(w.nombre ORDER BY c.fecha DESC))[1] AS nombre,
             count(*)::int AS ventas
        FROM sales_closure_waiters w
        JOIN sales_closures c ON c.id = w."closureId"
       WHERE c."clienteId" = ${clienteId}::uuid
         AND NOT EXISTS (SELECT 1 FROM pos_usuarios u WHERE u."clienteId" = c."clienteId" AND u.codigo = w.codigo)
       GROUP BY w.codigo ORDER BY count(*) DESC
    `,
  ])
  return NextResponse.json({ usuarios, permisos, mozosDeCierres })
}

interface Cuerpo {
  id?: string
  codigo?: string
  nombre?: string
  rol?: string
  pin?: string | null
  activo?: boolean
  usuarioId?: string | null
}

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as (Cuerpo & { sembrar?: Array<{ codigo: string; nombre: string }> }) | null
  if (!b) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Alta en lote de los mozos que ya vienen en los cierres.
  if (Array.isArray(b.sembrar)) {
    let n = 0
    for (const m of b.sembrar) {
      if (!m.codigo?.trim() || !m.nombre?.trim()) continue
      n += await prisma.$executeRaw`
        INSERT INTO pos_usuarios ("clienteId", codigo, nombre, rol)
        VALUES (${clienteId}::uuid, ${m.codigo.trim()}, ${m.nombre.trim()}, 'mozo')
        ON CONFLICT ("clienteId", codigo) DO NOTHING
      `
    }
    return NextResponse.json({ creados: n })
  }

  if (!b.codigo?.trim()) return NextResponse.json({ error: 'Poné un código' }, { status: 400 })
  if (!b.nombre?.trim()) return NextResponse.json({ error: 'Poné un nombre' }, { status: 400 })
  if (b.rol && !ROLES.includes(b.rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  if (b.pin) {
    const mal = pinValido(b.pin)
    if (mal) return NextResponse.json({ error: mal }, { status: 400 })
  }

  try {
    const [u] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO pos_usuarios ("clienteId", codigo, nombre, rol, "pinHash", "usuarioId")
      VALUES (${clienteId}::uuid, ${b.codigo.trim()}, ${b.nombre.trim()}, ${b.rol ?? 'mozo'},
              ${b.pin ? hashearPin(b.pin) : null}, ${b.usuarioId || null}::uuid)
      RETURNING id
    `
    return NextResponse.json({ id: u!.id })
  } catch {
    return NextResponse.json({ error: 'Ya existe un usuario con ese código' }, { status: 409 })
  }
}

export async function PATCH(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.POS, 'edit')
  if (error) return error
  const b = (await request.json().catch(() => null)) as
    | (Cuerpo & { permisos?: Array<{ rol: string; accion: string; permitido: boolean; requiereAutorizacion: boolean; limite?: number | null }> })
    | null
  if (!b) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  // Matriz de permisos: llega entera y se guarda fila por fila.
  if (Array.isArray(b.permisos)) {
    for (const p of b.permisos) {
      if (!ROLES.includes(p.rol) || !p.accion) continue
      await prisma.$executeRaw`
        INSERT INTO pos_permisos ("clienteId", rol, accion, permitido, "requiereAutorizacion", limite)
        VALUES (${clienteId}::uuid, ${p.rol}, ${p.accion}, ${p.permitido}, ${p.requiereAutorizacion}, ${p.limite ?? null})
        ON CONFLICT ("clienteId", rol, accion)
        DO UPDATE SET permitido = EXCLUDED.permitido,
                      "requiereAutorizacion" = EXCLUDED."requiereAutorizacion",
                      limite = EXCLUDED.limite,
                      "updatedAt" = now()
      `
    }
    return NextResponse.json({ ok: true })
  }

  if (!b.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
  if (b.rol && !ROLES.includes(b.rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  if (b.pin) {
    const mal = pinValido(b.pin)
    if (mal) return NextResponse.json({ error: mal }, { status: 400 })
  }

  try {
    await prisma.$executeRaw`
      UPDATE pos_usuarios SET
        codigo = COALESCE(${b.codigo?.trim() ?? null}, codigo),
        nombre = COALESCE(${b.nombre?.trim() ?? null}, nombre),
        rol    = COALESCE(${b.rol ?? null}, rol),
        activo = COALESCE(${b.activo ?? null}, activo),
        "pinHash" = COALESCE(${b.pin ? hashearPin(b.pin) : null}, "pinHash"),
        "updatedAt" = now()
      WHERE id = ${b.id}::uuid AND "clienteId" = ${clienteId}::uuid
    `
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Ya existe un usuario con ese código' }, { status: 409 })
  }
}
