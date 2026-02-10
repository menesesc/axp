/**
 * Queue Processor
 * 
 * Consume registros PENDING de IngestQueue y los sube a Cloudflare R2.
 * Implementa retry con exponential backoff.
 */

import { prisma } from '../lib/prisma';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createLogger, calculateNextRetry, generateR2Key, extractDateFromFilename, sleep } from '../utils/fileUtils';
import { uploadToR2 } from './r2Client';
import { getClienteByPrefix } from '../config/prefixMap';
import { isShuttingDown } from '../index';

const logger = createLogger('PROCESSOR');

// Configuración desde env vars
const PROCESSED_DIR = process.env.PROCESSED_DIR || '/srv/webdav/processed';
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS || '5');
const POLLING_INTERVAL_MS = parseInt(process.env.PROCESSOR_POLL_INTERVAL || '5000');
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || '5');

interface QueueItem {
  id: string;
  clienteId: string;
  source: string;
  sourceRef: string;
  sha256: string | null;
  status: string;
  attempts: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Obtiene la configuración del cliente desde la base de datos Y prefix-map
 */
async function getClienteConfig(
  clienteId: string
): Promise<{ cuit: string; r2Bucket: string; r2Prefix: string }> {
  // Obtener CUIT desde la base de datos
  const cliente = await prisma.clientes.findUnique({
    where: { id: clienteId },
    select: { cuit: true },
  });

  if (!cliente) {
    throw new Error(`Cliente not found: ${clienteId}`);
  }

  // Buscar configuración R2 en prefix-map
  // (necesitamos encontrar el prefix que corresponde a este clienteId)
  const prefixMapModule = await import('../config/prefixMap');
  const prefixMap = await prefixMapModule.loadPrefixMap();

  // Buscar el cliente por su ID
  const prefixEntry = Object.entries(prefixMap).find(
    ([_, config]) => config.clienteId === clienteId
  );

  if (!prefixEntry || !prefixEntry[1].r2Bucket) {
    throw new Error(`R2 bucket configuration not found for cliente: ${clienteId}`);
  }

  const config = prefixEntry[1];

  return {
    cuit: cliente.cuit,
    r2Bucket: config.r2Bucket,
    r2Prefix: config.r2Prefix || '',
  };
}

/**
 * Procesa un item de la cola
 */
async function processQueueItem(item: QueueItem): Promise<void> {
  logger.info(`🔄 Processing queue item: ${item.id} (${item.sourceRef})`);

  try {
    // Marcar como PROCESSING
    await prisma.ingest_queue.update({
      where: { id: item.id },
      data: {
        status: 'PROCESSING',
        updatedAt: new Date(),
      },
    });

    // Buscar el archivo en el directorio processed
    const filePath = join(PROCESSED_DIR, item.sourceRef);

    if (!existsSync(filePath)) {
      throw new Error(`File not found in processed directory: ${filePath}`);
    }

    // Leer el archivo
    logger.info(`📖 Reading file: ${filePath}`);
    const fileBuffer = await readFile(filePath);
    logger.info(`📏 File size: ${fileBuffer.length} bytes (${(fileBuffer.length / 1024).toFixed(2)} KB)`);

    // Verificar que el archivo no esté vacío
    if (fileBuffer.length < 1000) {
      throw new Error(`File too small to be valid PDF: ${fileBuffer.length} bytes`);
    }

    // Obtener configuración del cliente
    const clienteConfig = await getClienteConfig(item.clienteId);
    logger.info(`🏢 Cliente: ${clienteConfig.cuit}`);
    logger.info(`📦 R2 Bucket: ${clienteConfig.r2Bucket}`);

    // FASE 1: Subir a inbox (sin procesar OCR todavía)
    // El OCR Worker (Fase 2) lo procesará y moverá a carpetas por fecha real
    const r2Key = generateR2Key(clienteConfig.r2Prefix, item.sourceRef, true); // true = inbox
    logger.info(`🔑 R2 key (inbox): ${r2Key}`);

    // Subir a R2 (ahora pasamos el bucket específico del cliente)
    logger.info(`☁️  Uploading to R2 inbox...`);
    await uploadToR2(clienteConfig.r2Bucket, r2Key, fileBuffer, 'application/pdf');
    logger.info(`✅ Upload successful: ${clienteConfig.r2Bucket}/${r2Key}`);

    // Marcar como DONE
    await prisma.ingest_queue.update({
      where: { id: item.id },
      data: {
        status: 'DONE',
        lastError: null,
        updatedAt: new Date(),
      },
    });

    // Limpiar archivo local después de subir exitosamente a R2
    try {
      await unlink(filePath);
      logger.info(`🗑️  Local file deleted: ${filePath}`);
    } catch (unlinkError) {
      // No es crítico si falla la limpieza, solo logueamos
      logger.warn(`⚠️  Could not delete local file: ${filePath}`, unlinkError);
    }

    logger.info(`✅ Queue item processed successfully: ${item.id}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Error processing queue item ${item.id}:`, error);

    const newAttempts = item.attempts + 1;

    // Decidir si reintentar o marcar como ERROR
    if (newAttempts >= MAX_RETRY_ATTEMPTS) {
      logger.error(`❌ Max retry attempts reached for ${item.id}. Marking as ERROR.`);
      await prisma.ingest_queue.update({
        where: { id: item.id },
        data: {
          status: 'ERROR',
          attempts: newAttempts,
          lastError: errorMessage.substring(0, 5000), // Limitar tamaño
          nextRetryAt: null,
          updatedAt: new Date(),
        },
      });
    } else {
      const nextRetryAt = calculateNextRetry(newAttempts);
      logger.warn(
        `⚠️  Retry ${newAttempts}/${MAX_RETRY_ATTEMPTS} for ${item.id}. Next retry at: ${nextRetryAt.toISOString()}`
      );
      await prisma.ingest_queue.update({
        where: { id: item.id },
        data: {
          status: 'PENDING',
          attempts: newAttempts,
          lastError: errorMessage.substring(0, 5000),
          nextRetryAt: nextRetryAt,
          updatedAt: new Date(),
        },
      });
    }
  }
}

/**
 * Obtiene items pendientes de la cola
 */
async function getPendingItems(limit: number): Promise<QueueItem[]> {
  const now = new Date();

  const items = await prisma.ingest_queue.findMany({
    where: {
      status: 'PENDING',
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: {
      createdAt: 'asc',
    },
    take: limit,
  });

  return items as QueueItem[];
}

/**
 * Loop principal del processor
 */
export async function startProcessor(): Promise<void> {
  logger.info(`🚀 Queue Processor starting...`);
  logger.info(`📁 Processed directory: ${PROCESSED_DIR}`);
  logger.info(`🔢 Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);
  logger.info(`⏱️  Polling interval: ${POLLING_INTERVAL_MS}ms`);
  logger.info(`🔁 Max retry attempts: ${MAX_RETRY_ATTEMPTS}`);

  // Verificar conexión a R2
  try {
    logger.info(`☁️  Testing R2 connection...`);
    // El uploadToR2 validará las credenciales
    logger.info(`✅ R2 configuration loaded`);
  } catch (error) {
    logger.error(`❌ Failed to configure R2 client:`, error);
    throw error;
  }

  while (!isShuttingDown) {
    try {
      // Obtener items pendientes
      const items = await getPendingItems(MAX_CONCURRENT_JOBS);

      if (items.length > 0) {
        logger.info(`📋 Found ${items.length} pending item(s)`);

        // Procesar en paralelo (con límite)
        await Promise.all(items.map((item: QueueItem) => processQueueItem(item)));
      }
    } catch (error) {
      logger.error(`❌ Error in processor loop:`, error);
    }

    await sleep(POLLING_INTERVAL_MS);
  }

  logger.info(`🛑 Processor stopped`);
}
