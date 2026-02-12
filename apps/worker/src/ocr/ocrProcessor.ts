/**
 * OCR Processor
 * 
 * Procesa archivos de inbox/ con AWS Textract y los organiza por fecha real.
 * 
 * Flujo:
 * 1. Lista archivos en inbox/
 * 2. Descarga PDF de R2
 * 3. Envía a AWS Textract
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
import { listR2Objects, downloadFromR2, moveR2Object, deleteR2Object } from '../processor/r2Client';
import { processWithTextract, parseTextractResult } from './textractClient';
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
const TEXTRACT_REGION = process.env.TEXTRACT_REGION || 'us-east-1';

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
}

/**
 * Determina el estado de revisión basado en los campos detectados
 * @param parsed - Datos parseados del OCR
 * @param proveedorId - ID del proveedor (si se encontró)
 * @param finalLetra - Letra final (OCR o default del proveedor)
 */
function determineEstadoRevision(parsed: any, proveedorId: string | null, finalLetra: string | null): EstadoRevision {
  // Campos críticos: fechaEmision, total, y proveedor (o al menos CUIT)
  const hasCriticalFields =
    parsed.fechaEmision &&
    parsed.total &&
    (proveedorId || parsed.proveedorCUIT);

  if (!hasCriticalFields) {
    return 'PENDIENTE'; // Falta información crítica, requiere revisión manual
  }

  // Campos opcionales importantes: letra (OCR o proveedor), numeroCompleto, subtotal, iva
  // NOTA: fechaVencimiento NO es campo crítico
  const hasOptionalFields =
    finalLetra &&  // Usar finalLetra que incluye default del proveedor
    parsed.numeroCompleto &&
    parsed.subtotal &&
    parsed.iva;

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
          files.push({
            bucket: config.r2Bucket,
            key: obj.Key,
            clienteId: config.clienteId,
            filename: obj.Key.replace('inbox/', ''),
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
    
    // 4. Procesar con AWS Textract
    logger.info(`🤖 Processing with AWS Textract...`);
    let textractResult;
    
    try {
      textractResult = await processWithTextract(pdfBuffer, TEXTRACT_REGION);
    } catch (textractError: any) {
      // Manejar errores específicos de Textract
      if (textractError.name === 'UnsupportedDocumentException') {
        logger.error(`❌ Unsupported document format: ${file.filename}`);
        logger.error(`   Possible causes:`);
        logger.error(`   - Multiple invoices in one PDF (not supported by AnalyzeExpense)`);
        logger.error(`   - Corrupted or protected PDF`);
        logger.error(`   - Scanned document with poor quality`);

        // Log error a la base de datos
        const dbLogger = getDbLogger(file.clienteId);
        dbLogger.error(`Formato de documento no soportado - requiere revisión manual`, {
          filename: file.filename,
          details: {
            reason: 'UnsupportedDocumentException',
            possibleCauses: [
              'Múltiples facturas en un PDF',
              'PDF corrupto o protegido',
              'Documento escaneado con mala calidad',
            ],
          },
        });

        // Mover a carpeta error/ para revisión manual
        const errorKey = file.key.replace('inbox/', 'error/unsupported_');
        logger.info(`📦 Moving to error folder: ${errorKey}`);
        await moveR2Object(file.bucket, file.key, errorKey);

        logger.warn(`⚠️  File moved to error/ for manual review`);
        return;
      }
      
      // Re-throw otros errores para que se manejen abajo
      throw textractError;
    }
    
    // 5. Parsear resultados
    logger.info(`📊 Parsing OCR results...`);
    const parsed = parseTextractResult(textractResult);
    
    logger.info(`✅ Parsed data:`, {
      fechaEmision: parsed.fechaEmision,
      fechaVencimiento: parsed.fechaVencimiento,
      proveedor: parsed.proveedor,
      proveedorCUIT: parsed.proveedorCUIT,
      total: parsed.total,
      subtotal: parsed.subtotal,
      iva: parsed.iva,
      items: parsed.items?.length || 0,
      confidence: parsed.confidenceScore,
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
    
    // 8. Buscar o crear proveedor con matching inteligente
    let proveedorId: string | null = null;
    let proveedorLetra: string | null = null; // Letra por defecto del proveedor
    
    if (parsed.proveedorCUIT || parsed.proveedor) {
      const cuit = parsed.proveedorCUIT;
      const razonSocial = parsed.proveedor || 'Proveedor sin nombre';
      
      logger.info(`🏢 Looking up/creating proveedor...`);
      logger.info(`   CUIT: ${cuit || 'No detectado'}`);
      logger.info(`   Razón Social: ${razonSocial}`);
      
      // VALIDACIÓN CRÍTICA: El CUIT del proveedor NO puede ser igual al del cliente
      // (reutilizando el cliente que ya obtuvimos antes)
      if (cuit && cliente?.cuit) {
        const cuitNormalized = cuit.replace(/\D/g, '');
        const clienteCuitNormalized = cliente.cuit.replace(/\D/g, '');

        if (cuitNormalized === clienteCuitNormalized) {
          logger.warn(`⚠️  WARNING: CUIT ${cuit} matches cliente CUIT!`);
          logger.warn(`   This is likely the client's CUIT, not the supplier's.`);
          logger.warn(`   Ignoring this CUIT and searching only by razón social.`);

          // Limpiar el CUIT para no usarlo (es del cliente, no del proveedor)
          parsed.proveedorCUIT = null;
        }
      }
      
      let proveedor = null;

      // ESTRATEGIA 1: Buscar por CUIT (identificador único legal)
      if (parsed.proveedorCUIT) {
        proveedor = await prisma.proveedores.findFirst({
          where: {
            clienteId: file.clienteId,
            cuit: parsed.proveedorCUIT,
          },
          select: {
            id: true,
            razonSocial: true,
            letra: true,
            alias: true,
            cuit: true,
          },
        });

        if (proveedor) {
          logger.info(`✅ Proveedor found by CUIT: ${proveedor.id} (${proveedor.razonSocial})`);
          proveedorLetra = proveedor.letra; // Guardar letra por defecto
          // NOTA: No actualizamos alias automáticamente - OCR puede detectar mal el nombre
        }
      }

      // ESTRATEGIA 2: Buscar por razón social exacta (case-insensitive)
      if (!proveedor && parsed.proveedor) {
        proveedor = await prisma.proveedores.findFirst({
          where: {
            clienteId: file.clienteId,
            razonSocial: {
              equals: parsed.proveedor,
              mode: 'insensitive',
            },
          },
          select: {
            id: true,
            razonSocial: true,
            letra: true,
            alias: true,
            cuit: true,
          },
        });

        if (proveedor) {
          logger.info(`✅ Proveedor found by razón social (exact): ${proveedor.id}`);
          proveedorLetra = proveedor.letra; // Guardar letra por defecto
          
          // Si ahora tenemos CUIT y el proveedor no lo tenía, actualizarlo
          if (parsed.proveedorCUIT && !proveedor.cuit) {
            await prisma.proveedores.update({
              where: { id: proveedor.id },
              data: { cuit: parsed.proveedorCUIT },
            });
            logger.info(`   Updated CUIT: ${parsed.proveedorCUIT}`);
          }
        }
      }

      // ESTRATEGIA 3: Buscar en alias
      if (!proveedor && parsed.proveedor) {
        const allProveedores = await prisma.proveedores.findMany({
          where: {
            clienteId: file.clienteId,
            activo: true,
          },
          select: {
            id: true,
            razonSocial: true,
            letra: true,
            alias: true,
            cuit: true,
          },
        });

        for (const p of allProveedores) {
          const aliasArray = Array.isArray(p.alias) ? p.alias : [];
          const foundInAlias = aliasArray.some((alias: string) => 
            alias.toLowerCase() === parsed.proveedor.toLowerCase()
          );

          if (foundInAlias) {
            proveedor = p;
            logger.info(`✅ Proveedor found by alias: ${p.id} (${p.razonSocial})`);
            proveedorLetra = p.letra; // Guardar letra por defecto
            break;
          }
        }
      }

      // ESTRATEGIA 4: Similitud de texto (fuzzy matching)
      // Evita crear duplicados cuando OCR detecta mal el nombre
      // IMPORTANTE: Umbral alto (80%) para evitar falsos positivos
      if (!proveedor && parsed.proveedor) {
        logger.info(`🔍 Attempting fuzzy match for: "${parsed.proveedor}"`);

        const allProveedores = await prisma.proveedores.findMany({
          where: {
            clienteId: file.clienteId,
            activo: true,
          },
          select: {
            id: true,
            razonSocial: true,
            letra: true,
            alias: true,
            cuit: true,
          },
        });

        const normalizedSearch = parsed.proveedor.toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[^a-z0-9\s]/gi, '')
          .trim();

        // Filtrar palabras muy cortas (< 3 caracteres) que causan falsos positivos
        const searchWords = normalizedSearch.split(' ').filter((w: string) => w.length >= 3);

        // Si no hay palabras significativas, no hacer fuzzy match
        if (searchWords.length === 0) {
          logger.warn(`⚠️  No significant words in OCR name, skipping fuzzy match`);
        } else {
          let bestMatch = null;
          let bestScore = 0;
          let bestMatchWords = 0;

          for (const p of allProveedores) {
            const normalizedName = p.razonSocial.toLowerCase()
              .replace(/\s+/g, ' ')
              .replace(/[^a-z0-9\s]/gi, '')
              .trim();

            const nameWords = normalizedName.split(' ').filter((w: string) => w.length >= 3);

            // Contar palabras exactas en común (más estricto)
            const exactCommon = searchWords.filter((word: string) =>
              nameWords.includes(word)
            );

            // Contar palabras parciales (al menos 4 caracteres coinciden)
            const partialCommon = searchWords.filter((word: string) =>
              nameWords.some((nameWord: string) => {
                if (word.length < 4 || nameWord.length < 4) return false;
                return nameWord.includes(word) || word.includes(nameWord);
              })
            );

            // Score basado en palabras exactas (peso 1.0) + parciales (peso 0.5)
            const totalWords = Math.max(searchWords.length, nameWords.length);
            const score = totalWords > 0
              ? (exactCommon.length + partialCommon.length * 0.5) / totalWords
              : 0;

            // También verificar alias con el mismo criterio estricto
            const aliasArray = Array.isArray(p.alias) ? p.alias : [];
            for (const alias of aliasArray) {
              const normalizedAlias = (alias as string).toLowerCase()
                .replace(/\s+/g, ' ')
                .replace(/[^a-z0-9\s]/gi, '')
                .trim();

              const aliasWords = normalizedAlias.split(' ').filter((w: string) => w.length >= 3);
              const aliasExact = searchWords.filter((word: string) => aliasWords.includes(word));
              const aliasPartial = searchWords.filter((word: string) =>
                aliasWords.some((aliasWord: string) => {
                  if (word.length < 4 || aliasWord.length < 4) return false;
                  return aliasWord.includes(word) || word.includes(aliasWord);
                })
              );

              const aliasTotalWords = Math.max(searchWords.length, aliasWords.length);
              const aliasScore = aliasTotalWords > 0
                ? (aliasExact.length + aliasPartial.length * 0.5) / aliasTotalWords
                : 0;

              if (aliasScore > bestScore) {
                bestScore = aliasScore;
                bestMatch = p;
                bestMatchWords = aliasExact.length;
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestMatch = p;
              bestMatchWords = exactCommon.length;
            }
          }

          // UMBRAL MÁS ESTRICTO: 80% de similitud Y al menos 1 palabra exacta
          // Esto evita matches como "LANTE INDA" -> "GONZALEZ JORGE A."
          if (bestMatch && bestScore >= 0.8 && bestMatchWords >= 1) {
            proveedor = bestMatch;
            logger.info(`✅ Proveedor found by fuzzy match: ${proveedor.id} (${proveedor.razonSocial})`);
            logger.info(`   Match score: ${(bestScore * 100).toFixed(1)}%, exact words: ${bestMatchWords}`);
            logger.info(`   OCR detected: "${parsed.proveedor}"`);
            proveedorLetra = proveedor.letra;
          } else if (bestMatch) {
            logger.warn(`⚠️  Best fuzzy match below threshold:`);
            logger.warn(`   "${bestMatch.razonSocial}" score=${(bestScore * 100).toFixed(1)}%, exactWords=${bestMatchWords}`);
            logger.warn(`   OCR detected: "${parsed.proveedor}"`);
            logger.warn(`   Requires manual assignment (threshold: 80% + 1 exact word)`);
          }
        }
      }

      // ESTRATEGIA 5: Buscar por similitud de items/productos
      // Si los items del documento coinciden con items de documentos anteriores de un proveedor
      if (!proveedor && parsed.items && parsed.items.length > 0) {
        logger.info(`🔍 Attempting item-based provider matching...`);

        // Extraer palabras significativas de los items (>= 4 caracteres)
        const significantWords = new Set<string>();
        for (const item of parsed.items) {
          const desc = (item.descripcion || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
          const words = desc.split(/\s+/).filter((w: string) => w.length >= 4);
          words.forEach((w: string) => significantWords.add(w));
        }

        const wordList = Array.from(significantWords).slice(0, 10); // Limitar a 10 palabras
        logger.info(`   Significant words: ${wordList.join(', ')}`);

        if (wordList.length >= 2) {
          // Construir condiciones OR para cada palabra
          const likeConditions = wordList
            .map((word) => `LOWER(di.descripcion) LIKE '%${word.replace(/'/g, "''")}%'`)
            .join(' OR ');

          const sql = `
            SELECT d."proveedorId", COUNT(DISTINCT di.descripcion) as "matchCount"
            FROM documento_items di
            JOIN documentos d ON di."documentoId" = d.id
            WHERE d."clienteId" = '${file.clienteId}'::uuid
              AND d."proveedorId" IS NOT NULL
              AND (${likeConditions})
            GROUP BY d."proveedorId"
            HAVING COUNT(DISTINCT di.descripcion) >= 1
            ORDER BY "matchCount" DESC
            LIMIT 1
          `;

          try {
            const matchingItems = await prisma.$queryRawUnsafe<Array<{ proveedorId: string; matchCount: bigint }>>(sql);

            if (matchingItems.length > 0 && matchingItems[0]) {
              const matchedProveedorId = matchingItems[0].proveedorId;
              const matchedProveedor = await prisma.proveedores.findUnique({
                where: { id: matchedProveedorId },
                select: { id: true, razonSocial: true, letra: true, alias: true, cuit: true },
              });

              if (matchedProveedor) {
                proveedor = matchedProveedor;
                logger.info(`✅ Proveedor found by item matching: ${proveedor.id} (${proveedor.razonSocial})`);
                logger.info(`   Matched ${matchingItems[0].matchCount} items with words: ${wordList.join(', ')}`);
                proveedorLetra = proveedor.letra;
              }
            }
          } catch (itemMatchError) {
            logger.warn(`⚠️  Item matching query failed: ${itemMatchError}`);
          }
        }
      }

      // ESTRATEGIA 6: Marcar para revisión manual si no encontró match
      // NO crear automáticamente, requiere intervención humana
      if (!proveedor) {
        logger.warn(`⚠️  NO MATCH FOUND - Proveedor requires manual assignment`);
        logger.warn(`   OCR detected: "${razonSocial}"`);
        logger.warn(`   CUIT: ${cuit || 'not detected'}`);
        logger.warn(`   Document will be marked as PENDIENTE for manual review`);

        // Dejar proveedorId en null - el documento se marcará como PENDIENTE
        // El usuario deberá asignar manualmente el proveedor correcto desde el dashboard
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
    const estadoRevision = determineEstadoRevision(parsed, proveedorId, finalLetra);
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
          total: parsed.total,
          moneda: parsed.moneda,
          confidence: parsed.confidenceScore,
          itemsCount: parsed.items?.length || 0,
        }, // Solo metadatos, no el JSON completo de Textract (ahorra espacio)
        source: 'SFTP', // Origen actual: escáner/WebDAV
        hashSha256: sha256,
        pdfRawKey: file.key,
        pdfFinalKey: null, // Se actualiza después del move
        textractRawKey: null, // NO guardamos el JSON de Textract (ahorra 455KB por factura)
        updatedAt: new Date(),
      },
    });
    
    logger.info(`✅ Documento created: ${documento.id}`);
    
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
  logger.info(`☁️  AWS Textract region: ${TEXTRACT_REGION}`);
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
