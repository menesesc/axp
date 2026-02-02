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
import { createLogger, generateR2Key, sleep, extractDateFromFilename } from '../utils/fileUtils';
import { listR2Objects, downloadFromR2, moveR2Object, deleteR2Object } from '../processor/r2Client';
import { processWithTextract, parseTextractResult } from './textractClient';
import { isShuttingDown } from '../index';

const logger = createLogger('OCR');

// Configuración desde env vars
const POLLING_INTERVAL_MS = parseInt(process.env.OCR_POLL_INTERVAL || '30000'); // 30 segundos
const MAX_CONCURRENT_JOBS = parseInt(process.env.OCR_MAX_CONCURRENT_JOBS || '3');
const TEXTRACT_REGION = process.env.TEXTRACT_REGION || 'us-east-1';

interface InboxFile {
  bucket: string;
  key: string;
  clienteId: string;
  filename: string;
}

/**
 * Determina el estado de revisión basado en los campos detectados
 */
function determineEstadoRevision(parsed: any, proveedorId: string | null): EstadoRevision {
  // Campos críticos: fechaEmision, total, y proveedor (o al menos CUIT)
  const hasCriticalFields = 
    parsed.fechaEmision && 
    parsed.total && 
    (proveedorId || parsed.proveedorCUIT);
  
  if (!hasCriticalFields) {
    return 'PENDIENTE'; // Falta información crítica, requiere revisión manual
  }
  
  // Campos opcionales importantes: letra, numeroCompleto, subtotal, iva
  const hasOptionalFields = 
    parsed.letra && 
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
    const existing = await prisma.documento.findFirst({
      where: {
        clienteId: file.clienteId,
        hashSha256: sha256,
      },
    });
    
    if (existing) {
      logger.warn(`⚠️  Document already exists: ${existing.id} (hash: ${sha256})`);
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
      if (cuit) {
        const cliente = await prisma.cliente.findUnique({
          where: { id: file.clienteId },
          select: { cuit: true, razonSocial: true },
        });
        
        if (cliente && cliente.cuit === cuit) {
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
        proveedor = await prisma.proveedor.findFirst({
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
          
          // Actualizar alias si la razón social detectada es diferente y no está en alias
          const aliasArray = Array.isArray(proveedor.alias) ? proveedor.alias : [];
          if (parsed.proveedor && 
              proveedor.razonSocial !== parsed.proveedor && 
              !aliasArray.includes(parsed.proveedor)) {
            await prisma.proveedor.update({
              where: { id: proveedor.id },
              data: {
                alias: [...aliasArray, parsed.proveedor],
              },
            });
            logger.info(`   Updated alias: added "${parsed.proveedor}"`);
          }
        }
      }

      // ESTRATEGIA 2: Buscar por razón social exacta (case-insensitive)
      if (!proveedor && parsed.proveedor) {
        proveedor = await prisma.proveedor.findFirst({
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
            await prisma.proveedor.update({
              where: { id: proveedor.id },
              data: { cuit: parsed.proveedorCUIT },
            });
            logger.info(`   Updated CUIT: ${parsed.proveedorCUIT}`);
          }
        }
      }

      // ESTRATEGIA 3: Buscar en alias
      if (!proveedor && parsed.proveedor) {
        const allProveedores = await prisma.proveedor.findMany({
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
      if (!proveedor && parsed.proveedor) {
        logger.info(`🔍 Attempting fuzzy match...`);
        
        const allProveedores = await prisma.proveedor.findMany({
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

        let bestMatch = null;
        let bestScore = 0;

        for (const p of allProveedores) {
          const normalizedName = p.razonSocial.toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^a-z0-9\s]/gi, '')
            .trim();

          // Calcular similitud simple (palabras en común)
          const searchWords = normalizedSearch.split(' ');
          const nameWords = normalizedName.split(' ');
          
          const commonWords = searchWords.filter((word: string) => 
            nameWords.some((nameWord: string) => 
              nameWord.includes(word) || word.includes(nameWord)
            )
          );

          const score = commonWords.length / Math.max(searchWords.length, nameWords.length);

          // También verificar alias
          const aliasArray = Array.isArray(p.alias) ? p.alias : [];
          for (const alias of aliasArray) {
            const normalizedAlias = alias.toLowerCase()
              .replace(/\s+/g, ' ')
              .replace(/[^a-z0-9\s]/gi, '')
              .trim();
            
            const aliasWords = normalizedAlias.split(' ');
            const aliasCommon = searchWords.filter((word: string) => 
              aliasWords.some((aliasWord: string) => 
                aliasWord.includes(word) || word.includes(aliasWord)
              )
            );
            
            const aliasScore = aliasCommon.length / Math.max(searchWords.length, aliasWords.length);
            if (aliasScore > score) {
              const finalScore = aliasScore;
              if (finalScore > bestScore) {
                bestScore = finalScore;
                bestMatch = p;
              }
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = p;
          }
        }

        // Umbral de similitud: 60% de palabras en común
        if (bestMatch && bestScore >= 0.6) {
          proveedor = bestMatch;
          logger.info(`✅ Proveedor found by fuzzy match: ${proveedor.id} (${proveedor.razonSocial})`);
          logger.info(`   Match score: ${(bestScore * 100).toFixed(1)}%`);
          logger.info(`   OCR detected: "${parsed.proveedor}"`);
          proveedorLetra = proveedor.letra; // Guardar letra por defecto
          
          // Agregar el nombre detectado como alias para mejorar futuras detecciones
          const aliasArray = Array.isArray(proveedor.alias) ? proveedor.alias : [];
          if (!aliasArray.includes(parsed.proveedor)) {
            await prisma.proveedor.update({
              where: { id: proveedor.id },
              data: {
                alias: [...aliasArray, parsed.proveedor],
              },
            });
            logger.info(`   Added OCR name to alias: "${parsed.proveedor}"`);
          }
        } else if (bestMatch) {
          logger.warn(`⚠️  Best match found but below threshold:`);
          logger.warn(`   ${bestMatch.razonSocial} (${(bestScore * 100).toFixed(1)}%)`);
          logger.warn(`   Creating new proveedor instead`);
        }
      }

      // ESTRATEGIA 5: Marcar para revisión manual si no encontró match
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
    
    // Usar letra del proveedor si no se detectó con OCR
    const finalLetra = parsed.letra || proveedorLetra;
    if (!parsed.letra && proveedorLetra) {
      logger.info(`📝 Using default letra from proveedor: ${proveedorLetra}`);
    }
    
    // Si no hay fecha de vencimiento, usar fecha de emisión
    const finalFechaVencimiento = parsed.fechaVencimiento || parsed.fechaEmision;
    if (!parsed.fechaVencimiento && parsed.fechaEmision) {
      logger.info(`📅 Using fechaEmision as fechaVencimiento: ${parsed.fechaEmision}`);
    }
    
    // 9. Crear documento en BD
    logger.info(`💾 Creating Documento record...`);
    const estadoRevision = determineEstadoRevision(parsed, proveedorId);
    logger.info(`📋 Estado de revisión: ${estadoRevision}`);
    
    const documento = await prisma.documento.create({
      data: {
        clienteId: file.clienteId,
        proveedorId: proveedorId,
        tipo: parsed.tipo || 'FACTURA',
        letra: finalLetra, // Usar letra del proveedor si OCR no detectó
        puntoVenta: parsed.puntoVenta,
        numero: parsed.numero,
        numeroCompleto: parsed.numeroCompleto,
        fechaEmision: parsed.fechaEmision ? new Date(parsed.fechaEmision) : null,
        fechaVencimiento: finalFechaVencimiento ? new Date(finalFechaVencimiento) : null, // Usar fechaEmision si no hay vencimiento
        moneda: parsed.moneda || 'ARS',
        subtotal: parsed.subtotal,
        iva: parsed.iva,
        total: parsed.total,
        confidenceScore: parsed.confidenceScore,
        estadoRevision: estadoRevision,
        missingFields: parsed.missingFields || [],
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
      
      await prisma.documentoItem.createMany({
        data: parsed.items.map((item: any) => ({
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
    await prisma.documento.update({
      where: { id: documento.id },
      data: { pdfFinalKey: finalKey },
    });
    
    logger.info(`✅ OCR processing complete: ${file.filename}`);
    logger.info(`📂 Final location: ${file.bucket}/${finalKey}`);
    logger.info(`📊 Summary: ${parsed.items?.length || 0} items, confidence: ${parsed.confidenceScore}%`);
    
  } catch (error: any) {
    logger.error(`❌ Error processing OCR for ${file.key}:`, error);
    
    // Determinar si es un error recuperable o no
    const isRecoverable = !error.name?.includes('UnsupportedDocument') && 
                          !error.name?.includes('InvalidParameter') &&
                          !error.code?.includes('InvalidParameter');
    
    if (!isRecoverable) {
      // Error no recuperable: mover a error/ para no reintentar
      const errorKey = file.key.replace('inbox/', 'error/failed_');
      logger.warn(`⚠️  Non-recoverable error, moving to: ${errorKey}`);
      
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
        
        // Procesar en paralelo (con límite)
        const batch = inboxFiles.slice(0, MAX_CONCURRENT_JOBS);
        await Promise.all(batch.map(file => processOCRFile(file)));
      }
    } catch (error) {
      logger.error(`❌ Error in OCR processor loop:`, error);
    }
    
    await sleep(POLLING_INTERVAL_MS);
  }
  
  logger.info(`🛑 OCR Processor stopped`);
}
