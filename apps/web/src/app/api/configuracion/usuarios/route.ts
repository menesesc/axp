import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PERMISOS_DISPONIBLES } from '@/lib/permisos'

const PERMISOS_VALIDOS = new Set(PERMISOS_DISPONIBLES.map((p) => p.value as string))

/** Filtra a solo permisos conocidos y sin duplicados. */
function sanitizePermisos(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((p): p is string => typeof p === 'string' && PERMISOS_VALIDOS.has(p)))]
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const usuarios = await prisma.usuarios.findMany({
      where: { clienteId },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        tipo_acceso: true,
        permisos: true,
        activo: true,
      },
      orderBy: { nombre: 'asc' },
    })

    const usuariosWithExtras = usuarios.map((u) => ({
      ...u,
      tipo_acceso: u.tipo_acceso || (u.rol === 'ADMIN' || u.rol === 'SUPERADMIN' ? 'ADMIN' : 'VIEWER'),
      permisos: u.permisos ?? [],
      telefono: null,
      canSendDocs: true,
    }))

    return NextResponse.json({ usuarios: usuariosWithExtras })
  } catch (error) {
    console.error('Error fetching usuarios:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes empresa asignada' }, { status: 403 })
    }

    const body = await request.json()
    const { email, nombre, tipo_acceso } = body
    const permisos = sanitizePermisos(body.permisos)

    if (!email || !nombre) {
      return NextResponse.json({ error: 'Email y nombre son requeridos' }, { status: 400 })
    }

    // Check if user already exists
    const existing = await prisma.usuarios.findUnique({
      where: { email },
    })

    if (existing) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 })
    }

    // Check user limit according to plan
    const suscripcion = await prisma.$queryRaw<
      { usuarios_limite: number | null }[]
    >`
      SELECT p.usuarios_limite
      FROM suscripciones s
      JOIN planes p ON s.plan_id = p.id
      WHERE s."clienteId" = ${clienteId}::uuid
      LIMIT 1
    `

    if (suscripcion[0]?.usuarios_limite) {
      const usuariosActivos = await prisma.usuarios.count({
        where: { clienteId, activo: true },
      })
      if (usuariosActivos >= suscripcion[0].usuarios_limite) {
        return NextResponse.json(
          { error: `Tu plan permite hasta ${suscripcion[0].usuarios_limite} usuarios. Mejora tu plan para agregar más.` },
          { status: 400 }
        )
      }
    }

    // Invite user via Supabase Auth — creates auth.users record and sends invitation email
    const adminClient = createAdminClient()
    const { data: authData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { nombre, full_name: nombre },
    })

    if (inviteError) {
      console.error('Error inviting user:', inviteError)
      return NextResponse.json({ error: inviteError.message }, { status: 400 })
    }

    const authUserId = authData.user.id
    // Un usuario restringido (con permisos) nunca es admin.
    const rol = tipo_acceso === 'ADMIN' && permisos.length === 0 ? 'ADMIN' : 'USER'
    const tipoAcceso = permisos.length > 0 ? 'VIEWER' : tipo_acceso || 'VIEWER'

    // Upsert into public.usuarios using the Supabase Auth UUID.
    // rol es enum "RolUsuario"; tipo_acceso es varchar (sin cast a enum).
    await prisma.$executeRaw`
      INSERT INTO usuarios (id, email, nombre, rol, tipo_acceso, permisos, "clienteId", activo, "updatedAt")
      VALUES (${authUserId}::uuid, ${email}, ${nombre}, ${rol}::"RolUsuario", ${tipoAcceso}, ${permisos}::text[], ${clienteId}::uuid, true, NOW())
      ON CONFLICT (email) DO UPDATE
        SET id = ${authUserId}::uuid,
            nombre = ${nombre},
            rol = ${rol}::"RolUsuario",
            tipo_acceso = ${tipoAcceso},
            permisos = ${permisos}::text[],
            "clienteId" = ${clienteId}::uuid,
            activo = true,
            "updatedAt" = NOW()
    `

    return NextResponse.json({
      usuario: {
        id: authUserId,
        email,
        nombre,
        rol,
        tipo_acceso: tipoAcceso,
        permisos,
        activo: true,
        telefono: null,
        canSendDocs: true,
      },
    })
  } catch (error) {
    console.error('Error creating usuario:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
