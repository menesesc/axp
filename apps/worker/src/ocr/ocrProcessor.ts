/**
 * OCR Processor
 *
 * Procesa archivos de inbox/ con Claude Vision y los organiza por fecha real.
 *
 * Flujo:
 * 1. Lista archivos en inbox/
 * 2. Descarga PDF de R2
 * 3. Envía a Claude Vision (Anthropic API)
 * 4. Parsea resultados (fecha, proveedor, total, etc)
 * 5. Crea registro en tabla Documento
 * 6. Mueve archivo a carpeta por fecha real
 * 7. Actualiza Documento.pdfFinalKey
 */

import { prisma } from '../lib/prisma';

// Tipo para EstadoRevision
type EstadoRevision = 'PENDIENTE' | 'CONFIRMADO' | 'ERROR' | 'DUPLICADO';

// Helper para generar UUID (compatible con Bun)
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Parsea una fecha string (YYYY-MM-DD) a Date con timezone de Argentina (GMT-3).
 * Las facturas argentinas usan fechas locales de Argentina, así que las guardamos
 * explícitamente en GMT-3 para evitar problemas de conversión.
 * Si la fecha es futura, se usa la fecha actual.
 */
const parseLocalDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;

  let date: Date;

  // Si ya tiene timezone offset, parsearlo directamente
  if (dateStr.includes('+') || dateStr.includes('Z') || /-\d{2}:\d{2}$/.test(dateStr)) {
    date = new Date(dateStr);
  } else if (dateStr.includes('T') || dateStr.includes(' ')) {
    // Si tiene hora pero no timezone, asumir Argentina (GMT-3)
    const normalized = dateStr.replace(' ', 'T');
    date = new Date(`${normalized}-03:00`);
  } else {
    // Para fechas solo (YYYY-MM-DD), usar mediodía en Argentina (GMT-3)
    date = new Date(`${dateStr}T12:00:00-03:00`);
  }

  // Validar que la fecha sea válida (ej: "2026-02-00" produce Invalid Date)
  if (isNaN(date.getTime())) {
    return null;
  }

  // Validar que no sea fecha futura
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Fin del día actual
  if (date > today) {
    return new Date(); // Usar fecha actual si es futura
  }

  return date;
};
import { createLogger, generateR2Key, sleep, extractDateFromFilename } from '../utils/fileUtils';
import { createDbLogger, flushAllLogs } from '../utils/dbLogger';
import { listR2Objects, downloadFromR2, moveR2Object, deleteR2Object, getObjectMetadata } from '../processor/r2Client';
import { processWithClaudeVision, type ClaudeVisionResult } from './claudeVisionClient';
import { fetchCorrectionExamples } from './correctionExamples';
import { OCR_MODEL, calculateCost } from './anthropicClient';
import { isShuttingDown } from '../index';

const logger = createLogger('OCR');

// Cache de dbLoggers por clienteId
const dbLoggers = new Map<string, ReturnType<typeof createDbLogger>>();
function getDbLogger(clienteId: string) {
  if (!dbLoggers.has(clienteId)) {
    dbLoggers.set(clienteId, createDbLogger(clienteId, 'OCR'));
  }
  return dbLoggers.get(clienteId)!;
}

// Configuración desde env vars
const POLLING_INTERVAL_MS = parseInt(process.env.OCR_POLL_INTERVAL || '30000'); // 30 segundos
// IMPORTANTE: Usar MAX_CONCURRENT_JOBS=1 con Session Pooler de Supabase
// Para mayor concurrencia, usar Transaction Pooler (puerto 6543)
const MAX_CONCURRENT_JOBS = parseInt(process.env.OCR_MAX_CONCURRENT_JOBS || '1');

// Tracking de archivos en proceso para evitar re-escaneo en caso de error de BD
// Esto previene facturación excesiva de Textract cuando falla el guardado en DB
const processingFiles = new Set<string>();
const failedFiles = new Map<string, { attempts: number; lastError: string; lastAttempt: Date }>();
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutos entre reintentos

interface InboxFile {
  bucket: string;
  key: string;
  clienteId: string;
  filename: string;
  source?: string;
}

/**
 * Determina el estado de revisión basado en los campos detectados
 * @param parsed - Datos parseados del OCR
 * @param proveedorId - ID del proveedor (si se encontró)
 * @param finalLetra - Letra final (OCR o default del proveedor)
 */
function determineEstadoRevision(parsed: any, proveedorId: string | null, finalLetra: string | null): EstadoRevision {
  // Helper: 0 es un valor numérico válido, solo null/undefined/'' es "faltante"
  const hasNum = (v: any) => v != null && v !== '';

  // Campos críticos: fechaEmision, total, y proveedor (o al menos CUIT)
  const hasCriticalFields =
    !!parsed.fechaEmision &&
    hasNum(parsed.total) &&
    !!(proveedorId || parsed.proveedorCUIT);

  if (!hasCriticalFields) {
    return 'PENDIENTE'; // Falta información crítica, requiere revisión manual
  }

  // Campos opcionales importantes: letra (OCR o proveedor), numeroCompleto, subtotal, iva
  // subtotal e iva pueden ser 0 (facturas exentas, monotributo, etc.)
  const hasOptionalFields =
    !!finalLetra &&
    !!parsed.numeroCompleto &&
    hasNum(parsed.subtotal) &&
    hasNum(parsed.iva);

  if (hasOptionalFields) {
    return 'CONFIRMADO'; // Tiene todos los campos importantes
  }

  return 'PENDIENTE'; // Tiene campos críticos pero faltan opcionales
}

/**
 * Lista archivos en inbox/ de todos los buckets
 */
async function getInboxFiles(): Promise<InboxFile[]> {
  const files: InboxFile[] = [];
  
  // Cargar prefix-map para obtener buckets
  const prefixMapModule = await import('../config/prefixMap');
  const prefixMap = await prefixMapModule.loadPrefixMap();
  
  for (const [prefix, config] of Object.entries(prefixMap)) {
    try {
      const objects = await listR2Objects(config.r2Bucket, 'inbox/');
      
      for (const obj of objects) {
        if (obj.Key && obj.Key.endsWith('.pdf')) {
          // Read metadata to determine source (EMAIL, MANUAL, etc.)
          const metadata = await getObjectMetadata(config.r2Bucket, obj.Key);
          files.push({
            bucket: config.r2Bucket,
            key: obj.Key,
            clienteId: config.clienteId,
            filename: obj.Key.replace('inbox/', ''),
            source: metadata.source || undefined,
          });
        }
      }
    } catch (error) {
      logger.error(`Error listing inbox for ${config.r2Bucket}:`, error);
    }
  }
  
  return files;
}

/**
 * Procesa un archivo individual con OCR
 */
async function processOCRFile(file: InboxFile): Promise<void> {
  const fileKey = `${file.bucket}/${file.key}`;

  // Verificar si ya está siendo procesado (previene llamadas duplicadas a Textract)
  if (processingFiles.has(fileKey)) {
    logger.warn(`⏳ File already being processed, skipping: ${file.key}`);
    return;
  }

  // Verificar si ha fallado demasiadas veces (previene loops infinitos)
  const failedInfo = failedFiles.get(fileKey);
  if (failedInfo) {
    if (failedInfo.attempts >= MAX_RETRY_ATTEMPTS) {
      logger.error(`❌ File exceeded max retry attempts (${MAX_RETRY_ATTEMPTS}), skipping: ${file.key}`);
      logger.error(`   Last error: ${failedInfo.lastError}`);
      // Log error a la base de datos
      const dbLogger = getDbLogger(file.clienteId);
      dbLogger.error(`Archivo abandonado después de ${MAX_RETRY_ATTEMPTS} intentos fallidos`, {
        filename: file.filename,
        details: {
          attempts: failedInfo.attempts,
          lastError: failedInfo.lastError,
        },
      });
      return;
    }

    // Esperar antes de reintentar
    const timeSinceLastAttempt = Date.now() - failedInfo.lastAttempt.getTime();
    if (timeSinceLastAttempt < RETRY_DELAY_MS) {
      const waitMinutes = Math.ceil((RETRY_DELAY_MS - timeSinceLastAttempt) / 60000);
      logger.info(`⏰ Waiting ${waitMinutes} min before retry: ${file.key}`);
      return;
    }
  }

  // Marcar como en proceso
  processingFiles.add(fileKey);
  logger.info(`🔄 Processing OCR: ${file.key}`);

  try {
    // 1. Descargar archivo de R2
    logger.info(`📥 Downloading from R2: ${file.bucket}/${file.key}`);
    const pdfBuffer = await downloadFromR2(file.bucket, file.key);
    
    // 2. Calcular hash para idempotencia
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(pdfBuffer);
    const sha256 = hash.digest('hex');
    
    // 3. Verificar si ya existe documento con este hash
    const existing = await prisma.documentos.findFirst({
      where: {
        clienteId: file.clienteId,
        hashSha256: sha256,
      },
    });
    
    if (existing) {
      logger.warn(`⚠️  Document already exists: ${existing.id} (hash: ${sha256})`);
      // Log warning a la base de datos
      const dbLogger = getDbLogger(file.clienteId);
      dbLogger.warning(`Documento duplicado detectado (mismo hash SHA256)`, { sha256 }, file.filename, existing.id);
      // Borrar de inbox ya que está duplicado
      await deleteR2Object(file.bucket, file.key);
      return;
    }
    
    // 4. Obtener proveedores y correcciones para Claude Vision
    logger.info(`🤖 Processing with Claude Vision...`);
    const ocrStartTime = Date.now();

    const allProveedores = await prisma.proveedores.findMany({
      where: { clienteId: file.clienteId, activo: true },
      select: { id: true, razonSocial: true, cuit: true, letra: true, alias: true },
    });

    const corrections = await fetchCorrectionExamples(file.clienteId);
    if (corrections.length > 0) {
      logger.info(`📚 Loaded ${corrections.length} correction examples for learning`);
    }

    let parsed: ClaudeVisionResult;

    try {
      parsed = await processWithClaudeVision(pdfBuffer, allProveedores, corrections, file.clienteId);
    } catch (ocrError: any) {
      // Manejar errores de la API de Claude
      if (ocrError?.status === 400 && ocrError?.message?.includes('document')) {
        logger.error(`❌ Document format not supported: ${file.filename}`);

        const dbLogger = getDbLogger(file.clienteId);
        dbLogger.error(`Formato de documento no soportado - requiere revisión manual`, {
          filename: file.filename,
          details: {
            reason: 'UnsupportedDocument',
            error: ocrError.message?.substring(0, 200),
          },
        });

        const errorKey = file.key.replace('inbox/', 'error/unsupported_');
        logger.info(`📦 Moving to error folder: ${errorKey}`);
        await moveR2Object(file.bucket, file.key, errorKey);
        return;
      }

      throw ocrError;
    }

    const ocrDurationMs = Date.now() - ocrStartTime;

    // 5. Log resultados
    logger.info(`✅ Parsed data (${ocrDurationMs}ms):`, {
      fechaEmision: parsed.fechaEmision,
      fechaVencimiento: parsed.fechaVencimiento,
      proveedor: parsed.proveedor,
      proveedorCUIT: parsed.proveedorCUIT,
      total: parsed.total,
      subtotal: parsed.subtotal,
      iva: parsed.iva,
      items: parsed.items?.length || 0,
      confidence: parsed.confidenceScore,
      proveedorIdSugerido: parsed.proveedorIdSugerido,
      proveedorNuevoSugerido: parsed.proveedorNuevoSugerido,
      tokens: `${parsed.usage.inputTokens}in/${parsed.usage.outputTokens}out`,
    });

    // VALIDACIÓN ADICIONAL: Verificar que el número de factura no sea el CUIT del cliente
    const cliente = await prisma.clientes.findUnique({
      where: { id: file.clienteId },
      select: { cuit: true, razonSocial: true },
    });

    if (cliente?.cuit && parsed.numeroCompleto) {
      // Normalizar ambos CUITs (solo dígitos)
      const clienteCuitNormalized = cliente.cuit.replace(/\D/g, '');
      const numeroNormalized = parsed.numeroCompleto.replace(/\D/g, '');

      if (numeroNormalized === clienteCuitNormalized) {
        logger.warn(`⚠️  WARNING: numeroCompleto "${parsed.numeroCompleto}" matches cliente CUIT!`);
        logger.warn(`   This is the client's CUIT, not the invoice number. Clearing.`);
        parsed.numeroCompleto = null;
        if (!parsed.missingFields.includes('numeroCompleto')) {
          parsed.missingFields.push('numeroCompleto');
        }
      }
    }

    // VALIDACIÓN DE RECEPTOR: Verificar que la factura sea para este cliente
    // Si el CUIT receptor extraído de la factura no coincide con el CUIT del cliente,
    // marcar para revisión (ej: proveedor envió factura equivocada)
    let receptorMismatch = false;
    if (parsed.receptorCUIT && cliente?.cuit) {
      const receptorNormalized = parsed.receptorCUIT.replace(/\D/g, '');
      const clienteCuitNormalized = cliente.cuit.replace(/\D/g, '');

      if (receptorNormalized !== clienteCuitNormalized) {
        receptorMismatch = true;
        logger.warn(`⚠️  RECEPTOR MISMATCH: Factura dirigida a CUIT ${parsed.receptorCUIT}, pero el cliente es ${cliente.cuit}`);
        logger.warn(`   Posible factura enviada por error. Se procesará pero quedará PENDIENTE.`);

        if (!parsed.missingFields.includes('receptorCUIT')) {
          parsed.missingFields.push('receptorCUIT');
        }

        const receptorLogger = getDbLogger(file.clienteId);
        receptorLogger.warning(
          `Factura con receptor CUIT ${parsed.receptorCUIT} no coincide con cliente ${cliente.cuit} (${cliente.razonSocial})`,
          {
            receptorCUIT: parsed.receptorCUIT,
            clienteCUIT: cliente.cuit,
            proveedorCUIT: parsed.proveedorCUIT,
            source: file.source || 'SFTP',
          },
          file.filename
        );
      } else {
        logger.info(`✅ Receptor CUIT matches client: ${parsed.receptorCUIT}`);
      }
    }

    // 6. Determinar fecha para organización (usar fechaEmision o fallback a fecha del filename)
    const organizationDate = parsed.fechaEmision 
      ? new Date(parsed.fechaEmision)
      : extractDateFromFilename(file.filename);
    
    logger.info(`📅 Organization date: ${organizationDate.toISOString().split('T')[0]}`);
    
    // 7. Generar key final por fecha real
    const prefixMapModule = await import('../config/prefixMap');
    const prefixMap = await prefixMapModule.loadPrefixMap();
    const clientConfig = Object.values(prefixMap).find(c => c.clienteId === file.clienteId);
    
    if (!clientConfig) {
      throw new Error(`Client config not found for ${file.clienteId}`);
    }
    
    const finalKey = generateR2Key(
      clientConfig.r2Prefix,
      file.filename,
      false, // false = organizar por fecha
      organizationDate
    );
    
    logger.info(`🔑 Final key: ${finalKey}`);
    
    // 8. Matching de proveedor: Claude sugiere + validación con BD
    let proveedorId: string | null = null;
    let proveedorLetra: string | null = null;

    if (parsed.proveedorCUIT || parsed.proveedor) {
      const cuit = parsed.proveedorCUIT;
      const razonSocial = parsed.proveedor || 'Proveedor sin nombre';

      logger.info(`🏢 Matching proveedor...`);
      logger.info(`   CUIT: ${cuit || 'No detectado'}`);
      logger.info(`   Razón Social: ${razonSocial}`);

      // VALIDACIÓN: El CUIT del proveedor NO puede ser igual al del cliente
      if (cuit && cliente?.cuit) {
        const cuitNormalized = cuit.replace(/\D/g, '');
        const clienteCuitNormalized = cliente.cuit.replace(/\D/g, '');
        if (cuitNormalized === clienteCuitNormalized) {
          logger.warn(`⚠️  CUIT ${cuit} matches cliente CUIT - ignoring`);
          parsed.proveedorCUIT = null;
        }
      }

      let proveedor = null;

      // PRIMERO: Usar la sugerencia de Claude (matching semántico)
      if (parsed.proveedorIdSugerido) {
        const suggested = allProveedores.find(p => p.id === parsed.proveedorIdSugerido);
        if (suggested) {
          proveedor = suggested;
          logger.info(`✅ Proveedor matched by Claude AI: ${proveedor.id} (${proveedor.razonSocial})`);
          proveedorLetra = proveedor.letra;
        } else {
          logger.warn(`⚠️  Claude suggested proveedorId not found in BD, falling back`);
        }
      }

      // FALLBACK 1: Buscar por CUIT (identificador único legal)
      if (!proveedor && parsed.proveedorCUIT) {
        proveedor = await prisma.proveedores.findFirst({
          where: { clienteId: file.clienteId, cuit: parsed.proveedorCUIT },
          select: { id: true, razonSocial: true, letra: true, alias: true, cuit: true },
        });
        if (proveedor) {
          logger.info(`✅ Proveedor found by CUIT: ${proveedor.id} (${proveedor.razonSocial})`);
          proveedorLetra = proveedor.letra;
        }
      }

      // FALLBACK 2: Buscar por razón social exacta (case-insensitive)
      if (!proveedor && parsed.proveedor) {
        proveedor = await prisma.proveedores.findFirst({
          where: {
            clienteId: file.clienteId,
            razonSocial: { equals: parsed.proveedor, mode: 'insensitive' },
          },
          select: { id: true, razonSocial: true, letra: true, alias: true, cuit: true },
        });
        if (proveedor) {
          logger.info(`✅ Proveedor found by razón social: ${proveedor.id}`);
          proveedorLetra = proveedor.letra;
          // Actualizar CUIT si el proveedor no lo tenía
          if (parsed.proveedorCUIT && !proveedor.cuit) {
            await prisma.proveedores.update({
              where: { id: proveedor.id },
              data: { cuit: parsed.proveedorCUIT },
            });
            logger.info(`   Updated CUIT: ${parsed.proveedorCUIT}`);
          }
        }
      }

      // FALLBACK 3: Buscar en alias
      if (!proveedor && parsed.proveedor) {
        for (const p of allProveedores) {
          const aliasArray = Array.isArray(p.alias) ? p.alias : [];
          const foundInAlias = (aliasArray as string[]).some((alias: string) =>
            alias.toLowerCase() === parsed.proveedor!.toLowerCase()
          );
          if (foundInAlias) {
            proveedor = p;
            logger.info(`✅ Proveedor found by alias: ${p.id} (${p.razonSocial})`);
            proveedorLetra = p.letra;
            break;
          }
        }
      }

      // SIN MATCH: Claude puede sugerir la creación de un nuevo proveedor
      if (!proveedor) {
        if (parsed.proveedorNuevoSugerido) {
          logger.info(`💡 Claude suggests new provider: ${parsed.proveedorNuevoSugerido.razonSocial} (CUIT: ${parsed.proveedorNuevoSugerido.cuit || 'N/A'})`);
        } else {
          logger.warn(`⚠️  NO MATCH FOUND - Proveedor requires manual assignment`);
          logger.warn(`   OCR detected: "${razonSocial}" CUIT: ${cuit || 'N/A'}`);
        }
        proveedorId = null;
      } else {
        proveedorId = proveedor.id;
      }
    }
    
    // CONTROL DE DUPLICADOS: Verificar si ya existe documento con mismo proveedor+fecha+numero
    if (proveedorId && parsed.fechaEmision && parsed.numeroCompleto) {
      const fechaEmisionDate = parseLocalDate(parsed.fechaEmision);

      if (fechaEmisionDate) {
        const duplicado = await prisma.documentos.findFirst({
          where: {
            clienteId: file.clienteId,
            proveedorId: proveedorId,
            fechaEmision: fechaEmisionDate,
            numeroCompleto: parsed.numeroCompleto,
          },
          select: { id: true },
        });

        if (duplicado) {
          logger.warn(`⚠️  DUPLICATE DOCUMENT DETECTED`);
          logger.warn(`   Existing document: ${duplicado.id}`);
          logger.warn(`   Proveedor: ${proveedorId}`);
          logger.warn(`   Fecha: ${parsed.fechaEmision}`);
          logger.warn(`   Número: ${parsed.numeroCompleto}`);
          logger.warn(`   Deleting from inbox...`);

          await deleteR2Object(file.bucket, file.key);
          logger.info(`✅ Duplicate file removed from inbox`);
          return;
        }
      }
    }

    // Usar letra del proveedor si no se detectó con OCR
    const finalLetra = parsed.letra || proveedorLetra;
    if (!parsed.letra && proveedorLetra) {
      logger.info(`📝 Using default letra from proveedor: ${proveedorLetra}`);
    }

    // Ajustar missingFields: si tenemos letra del proveedor, no es campo faltante
    let adjustedMissingFields = [...(parsed.missingFields || [])];
    if (finalLetra && adjustedMissingFields.includes('letra')) {
      adjustedMissingFields = adjustedMissingFields.filter(f => f !== 'letra');
      logger.info(`📝 Removed 'letra' from missing fields (using proveedor default)`);
    }

    // Si no hay fecha de vencimiento, usar fecha de emisión
    const finalFechaVencimiento = parsed.fechaVencimiento || parsed.fechaEmision;
    if (!parsed.fechaVencimiento && parsed.fechaEmision) {
      logger.info(`📅 Using fechaEmision as fechaVencimiento: ${parsed.fechaEmision}`);
    }
    
    // 9. Crear documento en BD
    logger.info(`💾 Creating Documento record...`);
    let estadoRevision = determineEstadoRevision(parsed, proveedorId, finalLetra);

    // Si el CUIT receptor no coincide con el cliente, forzar PENDIENTE
    if (receptorMismatch) {
      estadoRevision = 'PENDIENTE';
      logger.warn(`⚠️  Forcing PENDIENTE due to receptor CUIT mismatch`);
    }
    logger.info(`📋 Estado de revisión: ${estadoRevision}`);
    
    const documento = await prisma.documentos.create({
      data: {
        id: generateId(),
        clienteId: file.clienteId,
        proveedorId: proveedorId,
        tipo: parsed.tipo || 'FACTURA',
        letra: finalLetra, // Usar letra del proveedor si OCR no detectó
        puntoVenta: parsed.puntoVenta,
        numero: parsed.numero,
        // Guardar solo dígitos (sin guiones ni espacios)
        numeroCompleto: parsed.numeroCompleto ? parsed.numeroCompleto.replace(/\D/g, '') : null,
        fechaEmision: parseLocalDate(parsed.fechaEmision),
        fechaVencimiento: parseLocalDate(finalFechaVencimiento),
        moneda: parsed.moneda || 'ARS',
        subtotal: parsed.subtotal,
        iva: parsed.iva,
        total: parsed.total,
        confidenceScore: parsed.confidenceScore,
        estadoRevision: estadoRevision,
        missingFields: adjustedMissingFields,
        jsonNormalizado: {
          tipo: parsed.tipo,
          letra: parsed.letra,
          numeroCompleto: parsed.numeroCompleto,
          fechaEmision: parsed.fechaEmision,
          fechaVencimiento: parsed.fechaVencimiento,
          proveedor: parsed.proveedor,
          subtotal: parsed.subtotal,
          iva: parsed.iva,
          ivaDesglose: parsed.ivaDesglose,
          total: parsed.total,
          moneda: parsed.moneda,
          confidence: parsed.confidenceScore,
          itemsCount: parsed.items?.length || 0,
          proveedorNuevoSugerido: parsed.proveedorNuevoSugerido,
          notas: parsed.notas,
        },
        source: file.source || 'SFTP', // From R2 metadata or default to SFTP
        hashSha256: sha256,
        pdfRawKey: file.key,
        pdfFinalKey: null, // Se actualiza después del move
        textractRawKey: null, // Legacy field (was Textract JSON, now unused with Claude Vision)
        updatedAt: new Date(),
      },
    });
    
    logger.info(`✅ Documento created: ${documento.id}`);

    // Registrar uso de tokens en ai_usage_logs
    try {
      await prisma.ai_usage_logs.create({
        data: {
          documentoId: documento.id,
          clienteId: file.clienteId,
          usuarioId: null,
          modelo: OCR_MODEL,
          inputTokens: parsed.usage.inputTokens,
          outputTokens: parsed.usage.outputTokens,
          costoEstimado: calculateCost(OCR_MODEL, parsed.usage),
          durationMs: ocrDurationMs,
          source: 'OCR_WORKER',
        },
      });
    } catch (logError) {
      logger.warn(`⚠️  Failed to log AI usage:`, logError);
    }

    // Enviar notificación al frontend
    try {
      const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
      await fetch(`${webAppUrl}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: file.clienteId,
          documentoId: documento.id,
          tipo: 'new_document',
        }),
      });
      logger.info(`📬 Notification sent for documento: ${documento.id}`);
    } catch (notifError) {
      logger.warn(`⚠️  Failed to send notification:`, notifError);
      // No es crítico, continuar con el proceso
    }
    
    // 10. Crear items de productos si existen
    if (parsed.items && parsed.items.length > 0) {
      logger.info(`📦 Creating ${parsed.items.length} documento items...`);
      
      await prisma.documento_items.createMany({
        data: parsed.items.map((item: any) => ({
          id: generateId(),
          documentoId: documento.id,
          linea: item.linea,
          descripcion: item.descripcion,
          codigo: item.codigo,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precioUnitario: item.precioUnitario,
          subtotal: item.subtotal,
        })),
      });
      
      logger.info(`✅ Items created successfully`);
    }
    
    // 11. Mover archivo en R2 de inbox/ a carpeta final
    logger.info(`📦 Moving file: ${file.key} → ${finalKey}`);
    await moveR2Object(file.bucket, file.key, finalKey);
    
    // 12. Actualizar documento con pdfFinalKey
    await prisma.documentos.update({
      where: { id: documento.id },
      data: { pdfFinalKey: finalKey },
    });
    
    logger.info(`✅ OCR processing complete: ${file.filename}`);
    logger.info(`📂 Final location: ${file.bucket}/${finalKey}`);
    logger.info(`📊 Summary: ${parsed.items?.length || 0} items, confidence: ${parsed.confidenceScore}%`);

    // Log de éxito a la base de datos
    const dbLogger = getDbLogger(file.clienteId);
    dbLogger.success(`Documento procesado: ${parsed.tipo || 'FACTURA'} ${parsed.numeroCompleto || ''}`, {
      filename: file.filename,
      documentoId: documento.id,
      details: {
        proveedor: parsed.proveedor,
        total: parsed.total,
        items: parsed.items?.length || 0,
        confidence: parsed.confidenceScore,
      },
    });

    // Éxito: limpiar tracking
    processingFiles.delete(fileKey);
    failedFiles.delete(fileKey);

  } catch (error: any) {
    logger.error(`❌ Error processing OCR for ${file.key}:`, error);

    // Log de error a la base de datos
    const dbLogger = getDbLogger(file.clienteId);
    dbLogger.error(`Error procesando archivo: ${error.message || 'Error desconocido'}`, {
      filename: file.filename,
      details: {
        errorName: error.name,
        errorCode: error.code,
        stack: error.stack?.substring(0, 500),
      },
    });

    // Limpiar de processingFiles para permitir reintentos
    processingFiles.delete(fileKey);

    // Registrar el fallo para control de reintentos
    const currentFail = failedFiles.get(fileKey);
    failedFiles.set(fileKey, {
      attempts: (currentFail?.attempts || 0) + 1,
      lastError: error.message || String(error),
      lastAttempt: new Date(),
    });

    // Determinar si es un error recuperable o no
    const isRecoverable = !error.name?.includes('UnsupportedDocument') &&
                          !error.name?.includes('InvalidParameter') &&
                          !error.code?.includes('InvalidParameter');
    
    if (!isRecoverable) {
      // Error no recuperable: mover a error/ para no reintentar
      const errorKey = file.key.replace('inbox/', 'error/failed_');
      logger.warn(`⚠️  Non-recoverable error, moving to: ${errorKey}`);

      // Limpiar tracking ya que no se reintentará
      failedFiles.delete(fileKey);

      try {
        await moveR2Object(file.bucket, file.key, errorKey);
        logger.info(`✅ File moved to error/ folder`);
      } catch (moveError) {
        logger.error(`❌ Failed to move file to error/:`, moveError);
      }
    } else {
      // Error recuperable: dejar en inbox para reintentar
      logger.warn(`⚠️  Recoverable error, leaving in inbox/ for retry`);
    }
  }
}

/**
 * Loop principal del OCR processor
 */
export async function startOCRProcessor(): Promise<void> {
  logger.info(`🚀 OCR Processor starting...`);
  logger.info(`🤖 Engine: Claude Vision (${OCR_MODEL})`);
  logger.info(`🔢 Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);
  logger.info(`⏱️  Polling interval: ${POLLING_INTERVAL_MS}ms`);
  
  while (!isShuttingDown) {
    try {
      // Obtener archivos en inbox
      const inboxFiles = await getInboxFiles();

      if (inboxFiles.length > 0) {
        logger.info(`📋 Found ${inboxFiles.length} file(s) in inbox`);

        // Procesar archivos
        const batch = inboxFiles.slice(0, MAX_CONCURRENT_JOBS);

        if (MAX_CONCURRENT_JOBS === 1) {
          // Procesamiento secuencial (recomendado para Session Pooler)
          for (const file of batch) {
            if (isShuttingDown) break;
            await processOCRFile(file);
          }
        } else {
          // Procesamiento en paralelo (solo con Transaction Pooler)
          await Promise.all(batch.map(file => processOCRFile(file)));
        }
      }
    } catch (error) {
      logger.error(`❌ Error in OCR processor loop:`, error);
    }

    await sleep(POLLING_INTERVAL_MS);
  }

  // Flush pending logs before stopping
  await flushAllLogs();
  logger.info(`🛑 OCR Processor stopped`);
}
