import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createAdminClient } from '@/lib/supabase/admin'

// Payload de creación/edición. recipients siempre es la lista completa
// (no diff): si se omite un email existente, se elimina.
export const subscriptionPayloadSchema = z.object({
  nombre: z.string().min(1).max(120),
  frecuencia: z.enum(['DIARIA', 'SEMANAL', 'MENSUAL']),
  diaSemana: z.number().int().min(1).max(7).nullable().optional(),
  diaMes: z.number().int().min(1).max(31).nullable().optional(),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM').default('07:00'),
  tz: z.string().default('America/Argentina/Buenos_Aires'),
  sucursal: z.string().nullable().optional(),
  topN: z.number().int().min(1).max(200).default(10),
  activo: z.boolean().default(true),
  recipients: z
    .array(
      z.object({
        email: z.string().email(),
        nombre: z.string().optional().nullable(),
      })
    )
    .min(1, 'Al menos un destinatario'),
})

export type SubscriptionPayload = z.infer<typeof subscriptionPayloadSchema>

/**
 * Día de disparo según frecuencia. No es configurable: el informe cubre el
 * período cerrado anterior, así que debe dispararse apenas cierra.
 *   SEMANAL → lunes (diaSemana=1): cubre la semana lun-dom recién cerrada.
 *   MENSUAL → día 1 (diaMes=1): cubre el mes anterior completo.
 *   DIARIA  → sin día fijo (corre todos los días).
 */
export function scheduleDaysFor(
  frecuencia: 'DIARIA' | 'SEMANAL' | 'MENSUAL'
): { diaSemana: number | null; diaMes: number | null } {
  if (frecuencia === 'SEMANAL') return { diaSemana: 1, diaMes: null }
  if (frecuencia === 'MENSUAL') return { diaSemana: null, diaMes: 1 }
  return { diaSemana: null, diaMes: null }
}

/**
 * Resuelve un destinatario a un usuarioId si ya existe como usuario del cliente,
 * lo invita como VIEWER si no existe (cuenta nueva en Supabase + fila en
 * usuarios), o lo deja sin usuarioId si pertenece a otro cliente (no podemos
 * "robarlo" de otra empresa).
 *
 * Devuelve el usuarioId o null.
 */
export async function resolveOrInviteRecipient(args: {
  email: string
  nombre?: string | null
  clienteId: string
}): Promise<{ usuarioId: string | null; invited: boolean; reason?: string }> {
  const { email, nombre, clienteId } = args
  const normalizedEmail = email.trim().toLowerCase()
  const displayName = (nombre ?? normalizedEmail.split('@')[0] ?? '').trim() || normalizedEmail

  const existing = await prisma.usuarios.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, clienteId: true, activo: true },
  })

  if (existing) {
    if (existing.clienteId === clienteId) {
      return { usuarioId: existing.id, invited: false }
    }
    // Usuario de otra empresa: no lo asignamos pero igual recibe el mail.
    return {
      usuarioId: null,
      invited: false,
      reason: 'Email pertenece a otra empresa; recibirá el informe pero sin acceso a la vista web.',
    }
  }

  // Invitar como VIEWER del cliente actual.
  const adminClient = createAdminClient()
  const { data: authData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { data: { nombre: displayName, full_name: displayName } }
  )

  if (inviteError || !authData?.user) {
    // El email ya existe en auth.users pero no en nuestra tabla — race o limpieza
    // pasada. Buscamos por email en auth via listUsers como fallback no implementado.
    throw new Error(`No se pudo invitar a ${normalizedEmail}: ${inviteError?.message ?? 'sin user'}`)
  }

  const authUserId = authData.user.id
  await prisma.$executeRaw`
    INSERT INTO usuarios (id, email, nombre, rol, tipo_acceso, "clienteId", activo, "updatedAt")
    VALUES (${authUserId}::uuid, ${normalizedEmail}, ${displayName}, 'USER'::"Rol", 'VIEWER'::"TipoAcceso", ${clienteId}::uuid, true, NOW())
    ON CONFLICT (email) DO UPDATE
      SET id = ${authUserId}::uuid,
          nombre = ${displayName},
          tipo_acceso = 'VIEWER'::"TipoAcceso",
          "clienteId" = ${clienteId}::uuid,
          activo = true,
          "updatedAt" = NOW()
  `

  return { usuarioId: authUserId, invited: true }
}

export interface SubscriptionDTO {
  id: string
  nombre: string
  frecuencia: 'DIARIA' | 'SEMANAL' | 'MENSUAL'
  diaSemana: number | null
  diaMes: number | null
  hora: string
  tz: string
  sucursal: string | null
  topN: number
  activo: boolean
  recipients: Array<{ id: string; email: string; nombre: string | null; usuarioId: string | null }>
  createdAt: string
  updatedAt: string
  lastRun?: { ejecutadoEn: string; status: 'OK' | 'FAIL' | 'SKIP' } | null
}

export async function fetchSubscriptionsForCliente(clienteId: string): Promise<SubscriptionDTO[]> {
  const subs = await prisma.sales_report_subscriptions.findMany({
    where: { clienteId },
    include: {
      recipients: { orderBy: { createdAt: 'asc' } },
      runs: { orderBy: { ejecutadoEn: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  })
  return subs.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    frecuencia: s.frecuencia,
    diaSemana: s.diaSemana,
    diaMes: s.diaMes,
    hora: s.hora,
    tz: s.tz,
    sucursal: s.sucursal,
    topN: s.topN,
    activo: s.activo,
    recipients: s.recipients.map((r) => ({
      id: r.id,
      email: r.email,
      nombre: r.nombre,
      usuarioId: r.usuarioId,
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    lastRun: s.runs[0]
      ? { ejecutadoEn: s.runs[0].ejecutadoEn.toISOString(), status: s.runs[0].status }
      : null,
  }))
}
