import { prisma } from '@/lib/prisma'

interface ResolvedSender {
  clienteId: string
  bucket: string
  clienteCuit: string
  userId: string
}

/**
 * Resolve an inbound email sender to a client by looking up the sender email
 * in the usuarios table.
 *
 * Flow: Proveedor sends invoice to client → client forwards to inbox@axp.com.ar
 * So the sender is a user of the client company, not the proveedor.
 *
 * Returns null if no active user matches the sender email.
 */
export async function resolveSender(senderEmail: string): Promise<ResolvedSender | null> {
  const email = senderEmail.toLowerCase().trim()

  // Look up active users with this email
  const usuario = await prisma.usuarios.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      activo: true,
      clienteId: { not: null },
    },
    select: {
      id: true,
      clienteId: true,
      clientes: {
        select: {
          cuit: true,
        },
      },
    },
  })

  if (!usuario?.clienteId || !usuario.clientes?.cuit) {
    return null
  }

  return {
    clienteId: usuario.clienteId,
    userId: usuario.id,
    bucket: `axp-client-${usuario.clientes.cuit}`,
    clienteCuit: usuario.clientes.cuit,
  }
}
