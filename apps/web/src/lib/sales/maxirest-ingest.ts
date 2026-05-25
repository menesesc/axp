import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2/client'
import { parseMaxirestClosure, ParsedClosure } from './maxirest-parser'

/**
 * Senders reconocidos como origen oficial de cierres Maxirest.
 */
export const MAXIREST_SENDERS = new Set([
  'fdtmaxisistemas@gmail.com',
])

/**
 * Subject típico de un cierre Maxirest: "MaxiREST - Fin de turno - 24/05/2026 Almuerzo".
 * Detectamos por subject para permitir reenvíos desde cualquier email (ej. cargar cierres
 * históricos manualmente).
 */
const MAXIREST_SUBJECT_RX = /maxirest.*fin\s+de\s+turno/i

export function isMaxirestSender(email: string | undefined | null): boolean {
  if (!email) return false
  return MAXIREST_SENDERS.has(email.toLowerCase().trim())
}

export function isMaxirestSubject(subject: string | undefined | null): boolean {
  if (!subject) return false
  return MAXIREST_SUBJECT_RX.test(subject)
}

/**
 * True si el email es un cierre Maxirest (sender oficial o subject que matchea).
 */
export function isMaxirestEmail(args: {
  from?: string | null | undefined
  subject?: string | null | undefined
}): boolean {
  return isMaxirestSender(args.from) || isMaxirestSubject(args.subject)
}

/**
 * Extrae texto plano de un PDF usando pdf-parse v1.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const mod = await import('pdf-parse')
  const pdfParse =
    (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default ??
    (mod as unknown as (b: Buffer) => Promise<{ text: string }>)
  const result = await pdfParse(buffer)
  return result.text
}

export interface IngestResult {
  status: 'OK' | 'NO_CLIENT' | 'PARSE_ERROR' | 'UPLOAD_ERROR'
  closureId?: string
  clienteId?: string
  cuit?: string
  fecha?: string
  nroCierre?: number
  message: string
}

interface IngestOptions {
  source?: 'EMAIL' | 'MANUAL' | 'REPARSE'
  forwardedBy?: string
  filename?: string
  /** Fuerza el clienteId (upload manual / reparse). Sino se resuelve por CUIT. */
  forceClienteId?: string
}

/**
 * Recibe el buffer de un PDF Maxirest, extrae texto, parsea, resuelve cliente
 * por CUIT, upsert idempotente del cierre y sube PDF a R2.
 */
export async function ingestMaxirestPdf(
  pdfBuffer: Buffer,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const source = options.source ?? 'EMAIL'

  let text: string
  try {
    text = await extractPdfText(pdfBuffer)
  } catch (err) {
    return {
      status: 'PARSE_ERROR',
      message: `Error extrayendo texto del PDF: ${(err as Error).message}`,
    }
  }

  let parsed: ParsedClosure
  try {
    parsed = parseMaxirestClosure(text)
  } catch (err) {
    return {
      status: 'PARSE_ERROR',
      message: `Error parseando cierre Maxirest: ${(err as Error).message}`,
    }
  }

  // Resolver cliente
  let clienteId: string | null = options.forceClienteId ?? null
  let clienteCuit: string | null = null
  let bucket: string | null = null

  if (clienteId) {
    const cliente = await prisma.clientes.findUnique({
      where: { id: clienteId },
      select: { id: true, cuit: true },
    })
    if (cliente) {
      clienteCuit = cliente.cuit
      bucket = `axp-client-${cliente.cuit}`
    }
  } else {
    const cliente = await prisma.clientes.findUnique({
      where: { cuit: parsed.cuit },
      select: { id: true, cuit: true },
    })
    if (cliente) {
      clienteId = cliente.id
      clienteCuit = cliente.cuit
      bucket = `axp-client-${cliente.cuit}`
    }
  }

  if (!clienteId || !bucket) {
    try {
      const unresolvedBucket = process.env.R2_UNRESOLVED_BUCKET ?? 'axp-unresolved'
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const key = `unresolved/maxirest/${parsed.cuit}_${ts}_${
        options.filename ?? 'cierre.pdf'
      }`
      await uploadToR2(unresolvedBucket, key, pdfBuffer, {
        source,
        cuit: parsed.cuit,
        forwardedBy: options.forwardedBy ?? '',
      })
    } catch {
      // No interrumpir si falla el upload "unresolved"
    }
    return {
      status: 'NO_CLIENT',
      cuit: parsed.cuit,
      message: `No se encontró cliente activo con CUIT ${parsed.cuitFormateado} (${parsed.empresa})`,
    }
  }

  // Subir PDF a R2 (best-effort, no inbox/ para que el worker OCR no lo agarre)
  const fechaIso = parsed.fecha.toISOString().slice(0, 10)
  const pdfR2Key = `sales/maxirest/${fechaIso}_t${parsed.turnoNumero}_c${parsed.nroCierre}.pdf`
  if (clienteCuit) {
    try {
      await uploadToR2(bucket, pdfR2Key, pdfBuffer, {
        source,
        cuit: clienteCuit,
        nroCierre: String(parsed.nroCierre),
        fecha: fechaIso,
      })
    } catch (err) {
      console.error('Error subiendo PDF Maxirest a R2:', err)
    }
  }

  // Upsert + reemplazo de hijas
  const closureId = await persistParsedClosure({
    parsed,
    clienteId,
    pdfR2Key,
    source,
    rawText: text,
  })

  return {
    status: 'OK',
    closureId,
    clienteId,
    cuit: parsed.cuit,
    fecha: fechaIso,
    nroCierre: parsed.nroCierre,
    message: `Cierre #${parsed.nroCierre} del ${fechaIso} (${parsed.turnoNombre}) procesado: ${parsed.articulos.length} artículos, ${parsed.mozos.length} mozos, ${parsed.pagos.length} formas de pago, ${parsed.auditoria.length} eventos auditoría`,
  }
}

/**
 * Re-parsea un cierre ya existente: toma su rawText, lo pasa por el parser actual
 * y reemplaza todas las hijas. Útil cuando se mejora el parser (ej. se agrega
 * la sección de auditoría) para actualizar cierres viejos sin reenviar PDFs.
 *
 * Mantiene clienteId / pdfR2Key originales. El source pasa a 'REPARSE'.
 */
export async function reparseClosure(closureId: string): Promise<IngestResult> {
  const closure = await prisma.sales_closures.findUnique({
    where: { id: closureId },
    select: {
      id: true,
      clienteId: true,
      pdfR2Key: true,
      rawText: true,
      nroCierre: true,
      fecha: true,
    },
  })
  if (!closure) {
    return { status: 'PARSE_ERROR', message: 'Cierre no encontrado' }
  }
  if (!closure.rawText) {
    return { status: 'PARSE_ERROR', message: 'El cierre no tiene rawText guardado' }
  }

  let parsed: ParsedClosure
  try {
    parsed = parseMaxirestClosure(closure.rawText)
  } catch (err) {
    return {
      status: 'PARSE_ERROR',
      message: `Error parseando rawText: ${(err as Error).message}`,
    }
  }

  await persistParsedClosure({
    parsed,
    clienteId: closure.clienteId,
    pdfR2Key: closure.pdfR2Key,
    source: 'REPARSE',
    rawText: closure.rawText,
  })

  return {
    status: 'OK',
    closureId: closure.id,
    clienteId: closure.clienteId,
    cuit: parsed.cuit,
    fecha: closure.fecha.toISOString().slice(0, 10),
    nroCierre: closure.nroCierre,
    message: `Cierre #${closure.nroCierre} re-parseado: ${parsed.articulos.length} artículos, ${parsed.mozos.length} mozos, ${parsed.pagos.length} formas de pago, ${parsed.auditoria.length} eventos auditoría`,
  }
}

/**
 * Persiste un ParsedClosure en DB con upsert idempotente por
 * (clienteId, fecha, nroCierre). Reemplaza todas las hijas. Devuelve closureId.
 */
async function persistParsedClosure(args: {
  parsed: ParsedClosure
  clienteId: string
  pdfR2Key: string | null
  source: string
  rawText: string
}): Promise<string> {
  const { parsed, clienteId, pdfR2Key, source, rawText } = args

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.sales_closures.findUnique({
        where: {
          clienteId_fecha_nroCierre: {
            clienteId,
            fecha: parsed.fecha,
            nroCierre: parsed.nroCierre,
          },
        },
        select: { id: true },
      })

      const baseData = {
        clienteId,
        fecha: parsed.fecha,
        nroCierre: parsed.nroCierre,
        turnoNombre: parsed.turnoNombre,
        turnoNumero: parsed.turnoNumero || null,
        sucursal: parsed.sucursal,
        empresaNombre: parsed.empresa,
        cuit: parsed.cuit,
        domicilio: parsed.domicilio,
        usuarioApertura: parsed.apertura?.usuario ?? null,
        horaApertura: parsed.apertura?.hora ?? null,
        usuarioCierre: parsed.cierre?.usuario ?? null,
        horaCierre: parsed.cierre?.hora ?? null,
        totalIngresos: sumByTipo(parsed.movimientos, 'INGRESO'),
        totalEgresos: sumByTipo(parsed.movimientos, 'EGRESO'),
        saldoCaja: null,
        totalVentas: parsed.resumen.totalVentas,
        cantTickets: parsed.resumen.cantTickets,
        efectivo: parsed.resumen.efectivo,
        ctaCte: parsed.resumen.ctaCte,
        tarjetas: parsed.resumen.tarjetas,
        facturaAElectronica: parsed.resumen.facturaAElectronica,
        cantFacturaAElectronica: parsed.resumen.cantFacturaAElectronica,
        facturaBElectronica: parsed.resumen.facturaBElectronica,
        cantFacturaBElectronica: parsed.resumen.cantFacturaBElectronica,
        facturaB: parsed.resumen.facturaB,
        cantFacturaB: parsed.resumen.cantFacturaB,
        notaCreditoAElectronica: parsed.resumen.notaCreditoAElectronica,
        cantNotaCreditoAElectronica: parsed.resumen.cantNotaCreditoAElectronica,
        notaCreditoBElectronica: parsed.resumen.notaCreditoBElectronica,
        cantNotaCreditoBElectronica: parsed.resumen.cantNotaCreditoBElectronica,
        notaCreditoB: parsed.resumen.notaCreditoB,
        cantNotaCreditoB: parsed.resumen.cantNotaCreditoB,
        descuentoTotal: parsed.resumen.descuentoTotal,
        cantCubiertos: parsed.resumen.cantCubiertos,
        promedioCubierto: parsed.resumen.promedioCubierto,
        netoGravado: parsed.resumen.netoGravado,
        ivaTotal: parsed.resumen.ivaTotal,
        pdfR2Key,
        rawText,
        source,
      }

      let closure
      if (existing) {
        await tx.sales_closure_payments.deleteMany({ where: { closureId: existing.id } })
        await tx.sales_closure_items.deleteMany({ where: { closureId: existing.id } })
        await tx.sales_closure_waiters.deleteMany({ where: { closureId: existing.id } })
        await tx.sales_closure_movements.deleteMany({ where: { closureId: existing.id } })
        await tx.sales_closure_audit_events.deleteMany({ where: { closureId: existing.id } })
        closure = await tx.sales_closures.update({
          where: { id: existing.id },
          data: baseData,
        })
      } else {
        closure = await tx.sales_closures.create({ data: baseData })
      }

      if (parsed.pagos.length > 0) {
        await tx.sales_closure_payments.createMany({
          data: parsed.pagos.map((p) => ({
            closureId: closure.id,
            formaCobro: p.formaCobro,
            sigla: p.sigla,
            total: p.total,
            cantidad: p.cantidad,
          })),
        })
      }

      if (parsed.mozos.length > 0) {
        await tx.sales_closure_waiters.createMany({
          data: parsed.mozos.map((m) => ({
            closureId: closure.id,
            codigo: m.codigo,
            nombre: m.nombre,
            importe: m.importe,
            cantVentas: m.cantVentas,
            cantCubiertos: m.cantCubiertos,
          })),
        })
      }

      if (parsed.movimientos.length > 0) {
        await tx.sales_closure_movements.createMany({
          data: parsed.movimientos.map((mv) => ({
            closureId: closure.id,
            tipo: mv.tipo,
            conceptoCodigo: mv.conceptoCodigo,
            detalle: mv.detalle,
            total: mv.total,
          })),
        })
      }

      if (parsed.auditoria.length > 0) {
        await tx.sales_closure_audit_events.createMany({
          data: parsed.auditoria.map((a) => ({
            closureId: closure.id,
            fuente: a.fuente,
            tipo: a.tipo,
            mesa: a.mesa,
            mozo: a.mozo,
            comprobante: a.comprobante,
            importeMesa: a.importeMesa,
            horaApertura: a.horaApertura,
            hora: a.hora,
            detalle: a.detalle.slice(0, 1000),
            monto: a.monto,
            porcentaje: a.porcentaje,
            productoCodigo: a.productoCodigo,
            productoNombre: a.productoNombre,
          })),
        })
      }

      // Resolver product_master en bulk
      const codigos = parsed.articulos.map((a) => a.codigo)
      const existingMasters = codigos.length > 0
        ? await tx.sales_product_master.findMany({
            where: { clienteId, codigoMaxirest: { in: codigos } },
            select: { id: true, codigoMaxirest: true },
          })
        : []
      const masterByCodigo = new Map<string, string>(
        existingMasters.map((m) => [m.codigoMaxirest, m.id])
      )

      const faltantes = parsed.articulos.filter((a) => !masterByCodigo.has(a.codigo))
      if (faltantes.length > 0) {
        const uniqByCodigo = new Map<string, ParsedClosure['articulos'][number]>()
        for (const a of faltantes) if (!uniqByCodigo.has(a.codigo)) uniqByCodigo.set(a.codigo, a)
        await tx.sales_product_master.createMany({
          data: Array.from(uniqByCodigo.values()).map((a) => ({
            clienteId,
            codigoMaxirest: a.codigo,
            nombre: a.nombre,
            rubroCodigo: a.rubroCodigo,
            rubroNombre: a.rubroNombre,
            lastSeenAt: new Date(),
          })),
          skipDuplicates: true,
        })
        const justCreated = await tx.sales_product_master.findMany({
          where: { clienteId, codigoMaxirest: { in: Array.from(uniqByCodigo.keys()) } },
          select: { id: true, codigoMaxirest: true },
        })
        for (const m of justCreated) masterByCodigo.set(m.codigoMaxirest, m.id)
      }

      const existingCodigos = new Set(existingMasters.map((m) => m.codigoMaxirest))
      for (const a of parsed.articulos) {
        if (!existingCodigos.has(a.codigo)) continue
        await tx.sales_product_master.update({
          where: { clienteId_codigoMaxirest: { clienteId, codigoMaxirest: a.codigo } },
          data: {
            nombre: a.nombre,
            rubroCodigo: a.rubroCodigo,
            rubroNombre: a.rubroNombre,
            lastSeenAt: new Date(),
          },
        })
      }

      if (parsed.articulos.length > 0) {
        await tx.sales_closure_items.createMany({
          data: parsed.articulos.map((a) => ({
            closureId: closure.id,
            productMasterId: masterByCodigo.get(a.codigo) ?? null,
            rubroCodigo: a.rubroCodigo,
            rubroNombre: a.rubroNombre,
            codigo: a.codigo,
            nombre: a.nombre,
            unidades: a.unidades,
            importe: a.importe,
          })),
        })
      }

      return closure.id
    },
    {
      timeout: 60_000,
      maxWait: 15_000,
    }
  )
}

function sumByTipo(
  movs: ParsedClosure['movimientos'],
  tipo: 'INGRESO' | 'EGRESO'
): number {
  return movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.total, 0)
}
