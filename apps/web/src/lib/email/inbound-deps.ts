/**
 * Implementación real de InboundDeps (prisma, R2, Resend) para el webhook.
 * La lógica vive en inbound.ts; esto es solo el cableado.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2/client'
import { ingestMaxirestPdf, isMaxirestEmail } from '@/lib/sales/maxirest-ingest'
import { resolveSender } from './resolve-sender'
import { fetchInboundPdfAttachments, fetchReceivedEmail } from './resend-attachments'
import type { InboundDeps, RegistroEmail } from './inbound'

async function registrarEmail(row: RegistroEmail): Promise<void> {
  try {
    const extra = JSON.stringify(row.extra ?? {})
    if (row.emailId) {
      // Upsert: si Resend reintenta el webhook queda el último resultado.
      await prisma.$executeRaw`
        INSERT INTO "email_recibidos"
          ("clienteId", "fecha", "remitente", "destinatario", "asunto", "emailId",
           "resultado", "detalle", "adjuntos", "extra")
        VALUES
          (${row.clienteId}::uuid, ${row.fecha}, ${row.remitente.slice(0, 320)}, ${row.destinatario},
           ${row.asunto}, ${row.emailId}, ${row.resultado}, ${row.detalle}, ${row.adjuntos}, ${extra}::jsonb)
        ON CONFLICT ("emailId") WHERE "emailId" IS NOT NULL DO UPDATE SET
          "clienteId" = COALESCE(EXCLUDED."clienteId", "email_recibidos"."clienteId"),
          "resultado" = EXCLUDED."resultado",
          "detalle"   = EXCLUDED."detalle",
          "adjuntos"  = EXCLUDED."adjuntos",
          "extra"     = EXCLUDED."extra"
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO "email_recibidos"
          ("clienteId", "fecha", "remitente", "destinatario", "asunto", "emailId",
           "resultado", "detalle", "adjuntos", "extra")
        VALUES
          (${row.clienteId}::uuid, ${row.fecha}, ${row.remitente.slice(0, 320)}, ${row.destinatario},
           ${row.asunto}, NULL, ${row.resultado}, ${row.detalle}, ${row.adjuntos}, ${extra}::jsonb)
      `
    }
  } catch (err) {
    // El registro es informativo: nunca debe frenar el procesamiento.
    console.error('No se pudo registrar en email_recibidos:', err)
  }
}

export const inboundDeps: InboundDeps = {
  async buscarClientePorCasilla(slugs) {
    if (slugs.length === 0) return null
    const rows = await prisma.$queryRaw<Array<{ id: string; cuit: string; casillaEmail: string }>>`
      SELECT "id", "cuit", "casillaEmail"
        FROM "clientes"
       WHERE "activo" = true
         AND "casillaEmail" IN (${Prisma.join(slugs)})
    `
    // Respetar el orden de prioridad de los slugs (to antes que headers).
    for (const s of slugs) {
      const r = rows.find((x) => x.casillaEmail === s)
      if (r) return { clienteId: r.id, cuit: r.cuit, casilla: r.casillaEmail }
    }
    return null
  },

  async resolverRemitente(email) {
    const r = await resolveSender(email)
    return r ? { clienteId: r.clienteId, cuit: r.clienteCuit, userId: r.userId } : null
  },

  obtenerEmail: fetchReceivedEmail,
  descargarPdfs: fetchInboundPdfAttachments,

  async existeDocumentoConHash(clienteId, sha256) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "documentos"
       WHERE "clienteId" = ${clienteId}::uuid AND "hashSha256" = ${sha256}
       LIMIT 1
    `
    return rows.length > 0
  },

  subirAInbox: (bucket, key, buffer, metadata) => uploadToR2(bucket, key, buffer, metadata),

  esMaxirest: ({ from, subject }) => isMaxirestEmail({ from, subject }),
  ingestMaxirest: (buffer, opts) => ingestMaxirestPdf(buffer, opts),

  async logProcesamiento({ clienteId, level, source, message, details }) {
    await prisma.processing_logs
      .create({
        data: {
          cliente_id: clienteId,
          level,
          source,
          message,
          details: details as Prisma.InputJsonValue,
        },
      })
      .catch(() => {})
  },

  registrar: registrarEmail,
}
