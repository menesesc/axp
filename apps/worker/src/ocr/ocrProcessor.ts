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

import { prisma } from 'database';
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
    const textractResult = await processWithTextract(pdfBuffer, TEXTRACT_REGION);
    
    // 5. Parsear resultados
    logger.info(`📊 Parsing OCR results...`);
    const parsed = parseTextractResult(textractResult);
    
    logger.info(`✅ Parsed data:`, {
      fechaEmision: parsed.fechaEmision,
      fechaVencimiento: parsed.fechaVencimiento,
      proveedor: parsed.proveedor,
      total: parsed.total,
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
    
    // 8. Buscar o crear proveedor
    let proveedorId: string | null = null;
    if (parsed.proveedor) {
      logger.info(`🏢 Looking up/creating proveedor: ${parsed.proveedor}`);
      
      // Buscar proveedor existente por razón social (case-insensitive)
      let proveedor = await prisma.proveedor.findFirst({
        where: {
          clienteId: file.clienteId,
          razonSocial: {
            equals: parsed.proveedor,
            mode: 'insensitive',
          },
        },
      });

      // Si no existe, crear nuevo proveedor
      if (!proveedor) {
        logger.info(`➕ Creating new proveedor: ${parsed.proveedor}`);
        proveedor = await prisma.proveedor.create({
          data: {
            clienteId: file.clienteId,
            razonSocial: parsed.proveedor,
            alias: [parsed.proveedor], // Guardar variaciones detectadas por OCR
            activo: true,
          },
        });
        logger.info(`✅ Proveedor created: ${proveedor.id}`);
      } else {
        logger.info(`✅ Proveedor found: ${proveedor.id}`);
      }

      proveedorId = proveedor.id;
    }
    
    // 9. Crear documento en BD
    logger.info(`💾 Creating Documento record...`);
    const documento = await prisma.documento.create({
      data: {
        clienteId: file.clienteId,
        proveedorId: proveedorId,
        tipo: parsed.tipo || 'FACTURA',
        letra: parsed.letra,
        puntoVenta: parsed.puntoVenta,
        numero: parsed.numero,
        numeroCompleto: parsed.numeroCompleto,
        fechaEmision: parsed.fechaEmision ? new Date(parsed.fechaEmision) : null,
        fechaVencimiento: parsed.fechaVencimiento ? new Date(parsed.fechaVencimiento) : null,
        moneda: parsed.moneda || 'ARS',
        subtotal: parsed.subtotal,
        iva: parsed.iva,
        total: parsed.total,
        confidenceScore: parsed.confidenceScore,
        estadoRevision: 'PENDIENTE',
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
        source: 'DRIVE', // Asumimos DRIVE (ajustar según source real)
        hashSha256: sha256,
        pdfRawKey: file.key,
        pdfFinalKey: null, // Se actualiza después del move
        textractRawKey: null, // NO guardamos el JSON de Textract (ahorra 455KB por factura)
      },
    });
    
    logger.info(`✅ Documento created: ${documento.id}`);
    
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
    
  } catch (error) {
    logger.error(`❌ Error processing OCR for ${file.key}:`, error);
    
    // TODO: Mover a failed/ si hay error persistente
    // Por ahora dejamos en inbox para reintentar
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
