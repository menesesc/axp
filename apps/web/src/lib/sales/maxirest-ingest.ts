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
 * Devuelve true si el email es un cierre Maxirest, sea por sender oficial o por subject.
 * El subject match permite reenviar cierres viejos desde cualquier casilla.
 */
export function isMaxirestEmail(args: {
  from?: string | null | undefined
  subject?: string | null | undefined
}): boolean {
  return isMaxirestSender(args.from) || isMaxirestSubject(args.subject)
}

/**
 * Extrae texto plano de un PDF usando pdf-parse v1.
 * pdf-parse no tiene un default export tipado uniformemente, por eso el cast.
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
  /** Origen del PDF: EMAIL (webhook), MANUAL (upload directo) */
  source?: 'EMAIL' | 'MANUAL'
  /** Email del que reenvió, para logs */
  forwardedBy?: string
  /** Nombre original del archivo */
  filename?: string
  /** Si se conoce, fuerza el clienteId (para upload manual). Sino, se resuelve por CUIT. */
  forceClienteId?: string
}

/**
 * Función principal: recibe el buffer de un PDF Maxirest, extrae texto, parsea,
 * resuelve cliente por CUIT, upsert idempotente del cierre y sube PDF a R2.
 *
 * - Si no encuentra cliente por CUIT, NO falla: guarda PDF en R2 unresolved/ y devuelve NO_CLIENT.
 * - Si el parser falla, devuelve PARSE_ERROR sin tocar la DB.
 * - Reenviar el mismo cierre lo actualiza (no duplica) gracias al unique (clienteId, fecha, nroCierre).
 */
export async function ingestMaxirestPdf(
  pdfBuffer: Buffer,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const source = options.source ?? 'EMAIL'

  // 1. Extraer texto del PDF
  let text: string
  try {
    text = await extractPdfText(pdfBuffer)
  } catch (err) {
    return {
      status: 'PARSE_ERROR',
      message: `Error extrayendo texto del PDF: ${(err as Error).message}`,
    }
  }

  // 2. Parsear contenido
  let parsed: ParsedClosure
  try {
    parsed = parseMaxirestClosure(text)
  } catch (err) {
    return {
      status: 'PARSE_ERROR',
      message: `Error parseando cierre Maxirest: ${(err as Error).message}`,
    }
  }

  // 3. Resolver cliente por CUIT (o usar el forzado)
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

  // 4. Si no hay cliente, guardar PDF como "unresolved" y devolver
  if (!clienteId || !bucket) {
    try {
      // Bucket genérico para casos no resueltos
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

  // 5. Subir PDF original a R2 del cliente (best-effort)
  // Importante: NO usar prefijo `inbox/` — el worker OCR escanea inbox/* recursivamente
  // y procesaría el cierre Maxirest también como factura.
  const fechaIso = parsed.fecha.toISOString().slice(0, 10)
  const pdfR2Key = `sales/maxirest/${fechaIso}_t${parsed.turnoNumero}_c${parsed.nroCierre}.pdf`
  try {
    await uploadToR2(bucket, pdfR2Key, pdfBuffer, {
      source,
      cuit: clienteCuit ?? '',
      nroCierre: String(parsed.nroCierre),
      fecha: fechaIso,
    })
  } catch (err) {
    // Loguear pero no fallar el ingest — los datos sí se persisten igual
    console.error('Error subiendo PDF Maxirest a R2:', err)
  }

  // 6. Upsert idempotente del cierre + reemplazo de hijas en transacción
  const closureId = await prisma.$transaction(async (tx) => {
    const existing = await tx.sales_closures.findUnique({
      where: {
        clienteId_fecha_nroCierre: {
          clienteId: clienteId!,
          fecha: parsed.fecha,
          nroCierre: parsed.nroCierre,
        },
      },
      select: { id: true },
    })

    const baseData = {
      clienteId: clienteId!,
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
      saldoCaja: null, // se podría calcular: ingresos + egresos. Por ahora null.
      totalVentas: parsed.resumen.totalVentas,
      cantTickets: parsed.resumen.cantTickets,
      efectivo: parsed.resumen.efectivo,
      ctaCte: parsed.resumen.ctaCte,
      tarjetas: parsed.resumen.tarjetas,
      descuentoTotal: parsed.resumen.descuentoTotal,
      cantCubiertos: parsed.resumen.cantCubiertos,
      promedioCubierto: parsed.resumen.promedioCubierto,
      netoGravado: parsed.resumen.netoGravado,
      ivaTotal: parsed.resumen.ivaTotal,
      pdfR2Key,
      rawText: text,
      source,
    }

    let closure
    if (existing) {
      // Borrar hijas anteriores y reemplazar
      await tx.sales_closure_payments.deleteMany({ where: { closureId: existing.id } })
      await tx.sales_closure_items.deleteMany({ where: { closureId: existing.id } })
      await tx.sales_closure_waiters.deleteMany({ where: { closureId: existing.id } })
      await tx.sales_closure_movements.deleteMany({ where: { closureId: existing.id } })
      closure = await tx.sales_closures.update({
        where: { id: existing.id },
        data: baseData,
      })
    } else {
      closure = await tx.sales_closures.create({ data: baseData })
    }

    // Insertar formas de pago
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

    // Mozos
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

    // Movimientos de caja
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

    // Artículos: resolver product_master en bulk (find existentes + createMany faltantes)
    // y persistir líneas con createMany (1 query total). Muchísimo más rápido que upsert por ítem.
    const codigos = parsed.articulos.map((a) => a.codigo)
    const existingMasters = codigos.length > 0
      ? await tx.sales_product_master.findMany({
          where: { clienteId: clienteId!, codigoMaxirest: { in: codigos } },
          select: { id: true, codigoMaxirest: true },
        })
      : []
    const masterByCodigo = new Map<string, string>(
      existingMasters.map((m) => [m.codigoMaxirest, m.id])
    )

    const faltantes = parsed.articulos.filter((a) => !masterByCodigo.has(a.codigo))
    if (faltantes.length > 0) {
      // Deduplicar por código (un mismo código no debería aparecer dos veces, pero por las dudas)
      const uniqByCodigo = new Map<string, ParsedClosure['articulos'][number]>()
      for (const a of faltantes) if (!uniqByCodigo.has(a.codigo)) uniqByCodigo.set(a.codigo, a)
      await tx.sales_product_master.createMany({
        data: Array.from(uniqByCodigo.values()).map((a) => ({
          clienteId: clienteId!,
          codigoMaxirest: a.codigo,
          nombre: a.nombre,
          rubroCodigo: a.rubroCodigo,
          rubroNombre: a.rubroNombre,
          lastSeenAt: new Date(),
        })),
        skipDuplicates: true,
      })
      // Releer los ids recién creados
      const justCreated = await tx.sales_product_master.findMany({
        where: { clienteId: clienteId!, codigoMaxirest: { in: Array.from(uniqByCodigo.keys()) } },
        select: { id: true, codigoMaxirest: true },
      })
      for (const m of justCreated) masterByCodigo.set(m.codigoMaxirest, m.id)
    }

    // Actualizar metadata del master (nombre/rubro/lastSeenAt) con updateMany por código.
    // Lo dejamos sin tx para reducir tiempo de transacción — se ejecuta best-effort después.
    // Pero por consistencia lo incluimos: si el nombre cambió ahora se refleja.
    // updateMany no permite filtrar por unique compuesto en where, así que iteramos por código.
    // Solo actualizamos los que ya existían (para los nuevos, ya tienen el dato fresco).
    const existingCodigos = new Set(existingMasters.map((m) => m.codigoMaxirest))
    for (const a of parsed.articulos) {
      if (!existingCodigos.has(a.codigo)) continue
      await tx.sales_product_master.update({
        where: { clienteId_codigoMaxirest: { clienteId: clienteId!, codigoMaxirest: a.codigo } },
        data: {
          nombre: a.nombre,
          rubroCodigo: a.rubroCodigo,
          rubroNombre: a.rubroNombre,
          lastSeenAt: new Date(),
        },
      })
    }

    // Bulk insert de líneas (1 query)
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
  }, {
    // Cierres con muchos artículos pueden tardar; damos margen al pooler.
    timeout: 60_000,
    maxWait: 15_000,
  })

  return {
    status: 'OK',
    closureId,
    clienteId,
    cuit: parsed.cuit,
    fecha: fechaIso,
    nroCierre: parsed.nroCierre,
    message: `Cierre #${parsed.nroCierre} del ${fechaIso} (${parsed.turnoNombre}) procesado: ${parsed.articulos.length} artículos, ${parsed.mozos.length} mozos, ${parsed.pagos.length} formas de pago`,
  }
}

function sumByTipo(
  movs: ParsedClosure['movimientos'],
  tipo: 'INGRESO' | 'EGRESO'
): number {
  return movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.total, 0)
}
