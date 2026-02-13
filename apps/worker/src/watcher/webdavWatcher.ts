/**
 * WebDAV Watcher
 * 
 * Observa la carpeta donde el scanner Epson deja los PDFs vía WebDAV.
 * Detecta archivos nuevos, espera a que estén estables, y los encola en IngestQueue.
 */

import { readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { prisma } from '../lib/prisma';

// Helper para generar UUID (compatible con Bun)
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
import {
  calculateFileSHA256,
  waitForFileStable,
  moveFileSafe,
  extractPrefixFromFilename,
  createLogger,
  sleep,
} from '../utils/fileUtils';
import { createDbLogger } from '../utils/dbLogger';
import { getClienteByPrefix } from '../config/prefixMap';
import { isShuttingDown } from '../index';

const logger = createLogger('WATCHER');

// Configuración desde env vars
const WEBDAV_DIR = process.env.WEBDAV_DIR || '/srv/webdav/data';
const PROCESSED_DIR = process.env.PROCESSED_DIR || '/srv/webdav/processed';
// FAILED_DIR ya no se usa - los archivos fallidos se eliminan directamente
const POLLING_INTERVAL_MS = parseInt(process.env.WATCHER_POLL_INTERVAL || '2000');
const FILE_STABLE_CHECKS = parseInt(process.env.FILE_STABLE_CHECKS || '3');
const FILE_STABLE_INTERVAL_MS = parseInt(process.env.FILE_STABLE_INTERVAL || '1000');
const MAX_STABILITY_RETRIES = parseInt(process.env.MAX_STABILITY_RETRIES || '30');

// Set para trackear archivos en proceso
const filesInProcess = new Set<string>();
// Map para trackear reintentos de estabilidad por archivo
const stabilityRetries = new Map<string, number>();

/**
 * Procesa un archivo individual
 */
async function processFile(filename: string): Promise<void> {
  const filePath = join(WEBDAV_DIR, filename);

  // Evitar procesar el mismo archivo concurrentemente
  if (filesInProcess.has(filename)) {
    return;
  }

  filesInProcess.add(filename);

  try {
    // Solo PDFs
    if (!filename.toLowerCase().endsWith('.pdf')) {
      logger.info(`⏭️  Skipping non-PDF file: ${filename}`);
      return;
    }

    logger.info(`📄 Found new file: ${filename}`);

    // Esperar a que el archivo esté estable
    const retryCount = stabilityRetries.get(filename) || 0;
    logger.info(`⏳ Waiting for file to be stable: ${filename}${retryCount > 0 ? ` (attempt ${retryCount + 1}/${MAX_STABILITY_RETRIES})` : ''}`);
    const isStable = await waitForFileStable(filePath, FILE_STABLE_CHECKS, FILE_STABLE_INTERVAL_MS);

    if (!isStable) {
      const newRetryCount = retryCount + 1;
      stabilityRetries.set(filename, newRetryCount);

      if (newRetryCount >= MAX_STABILITY_RETRIES) {
        logger.error(`❌ File never stabilized after ${MAX_STABILITY_RETRIES} attempts, skipping: ${filename}`);
        stabilityRetries.delete(filename);

        // Registrar en processing_logs para que aparezca en la UI
        const prefix = extractPrefixFromFilename(filename);
        if (prefix) {
          const clienteConfig = await getClienteByPrefix(prefix);
          if (clienteConfig) {
            const dbLog = createDbLogger(clienteConfig.clienteId, 'WATCHER');
            dbLog.error(
              `Archivo nunca se estabilizó tras ${MAX_STABILITY_RETRIES} intentos. Posible problema con el escáner.`,
              { filename, attempts: MAX_STABILITY_RETRIES },
              filename
            );
          }
        }

        // Eliminar archivo parcial/corrupto
        try {
          await unlink(filePath);
          logger.info(`🗑️  Unstable file deleted: ${filename}`);
        } catch {
          // Ignorar si ya no existe
        }
      } else {
        logger.warn(`⚠️  File not stable or disappeared: ${filename}`);
      }
      return;
    }

    // Archivo estable - limpiar contador de reintentos
    stabilityRetries.delete(filename);

    // Extraer prefijo
    const prefix = extractPrefixFromFilename(filename);
    if (!prefix) {
      logger.error(`❌ Could not extract prefix from filename: ${filename}`);
      logger.error(`   Expected format: prefix_YYYYMMDD_HHMMSS.pdf`);
      // Eliminar archivo - no podemos procesarlo sin prefijo
      await unlink(filePath);
      logger.info(`🗑️  File deleted (invalid format): ${filename}`);
      return;
    }

    logger.info(`🏢 Detected prefix: ${prefix}`);

    // Obtener configuración del cliente
    const clienteConfig = await getClienteByPrefix(prefix);
    if (!clienteConfig) {
      logger.error(`❌ No client configuration found for prefix: ${prefix}`);
      // Eliminar archivo - no hay cliente configurado
      await unlink(filePath);
      logger.info(`🗑️  File deleted (unknown prefix): ${filename}`);
      return;
    }

    logger.info(`✅ Cliente: ${clienteConfig.cuit} (${clienteConfig.clienteId})`);

    // Calcular SHA256
    logger.info(`🔐 Calculating SHA256...`);
    const sha256 = await calculateFileSHA256(filePath);
    logger.info(`🔐 SHA256: ${sha256}`);

    // Verificar si ya existe en la queue (idempotencia)
    const sourceRef = filename; // Usamos el filename como sourceRef
    const existing = await prisma.ingest_queue.findFirst({
      where: {
        clienteId: clienteConfig.clienteId,
        source: 'SFTP', // Origen: escáner/WebDAV (tratado como SFTP)
        sourceRef: sourceRef,
      },
    });

    if (existing) {
      logger.warn(`⚠️  File already queued: ${filename} (queue id: ${existing.id})`);
      // Mover a processed de todas formas para no volver a verlo
      await moveFileSafe(filePath, join(PROCESSED_DIR, filename));
      return;
    }

    // Verificar si ya existe un archivo con este SHA256 para este cliente
    const duplicateBySha = await prisma.ingest_queue.findFirst({
      where: {
        clienteId: clienteConfig.clienteId,
        sha256: sha256,
      },
    });

    if (duplicateBySha) {
      logger.warn(
        `⚠️  Duplicate file by SHA256: ${filename} (original: ${duplicateBySha.sourceRef})`
      );
      await moveFileSafe(filePath, join(PROCESSED_DIR, `DUPLICATE_${filename}`));
      return;
    }

    // Crear registro en IngestQueue
    logger.info(`📝 Enqueuing file for processing...`);
    const queueItem = await prisma.ingest_queue.create({
      data: {
        id: generateId(),
        clienteId: clienteConfig.clienteId,
        source: 'SFTP', // Origen: escáner/WebDAV → SFTP
        sourceRef: sourceRef,
        sha256: sha256,
        status: 'PENDING',
        attempts: 0,
        updatedAt: new Date(),
      },
    });

    logger.info(`✅ File enqueued: ${filename} (queue id: ${queueItem.id})`);

    // Mover archivo a processed para que el processor lo encuentre
    const processedPath = join(PROCESSED_DIR, filename);
    await moveFileSafe(filePath, processedPath);
    logger.info(`📦 File moved to processed: ${processedPath}`);
  } catch (error) {
    logger.error(`❌ Error processing file ${filename}:`, error);

    // Si el archivo ya no existe, probablemente el processor ya lo procesó
    if ((error as any)?.code === 'ENOENT') {
      logger.info(`ℹ️  File already processed or moved: ${filename}`);
      return;
    }

    // Eliminar archivo fallido para no acumular en disco
    try {
      await unlink(filePath);
      logger.info(`🗑️  Failed file deleted: ${filename}`);
    } catch (unlinkError) {
      logger.error(`❌ Could not delete failed file:`, unlinkError);
    }
  } finally {
    filesInProcess.delete(filename);
  }
}

/**
 * Escanea el directorio WebDAV y procesa archivos nuevos
 */
async function scanDirectory(): Promise<void> {
  try {
    if (!existsSync(WEBDAV_DIR)) {
      logger.error(`❌ WebDAV directory does not exist: ${WEBDAV_DIR}`);
      return;
    }

    const files = await readdir(WEBDAV_DIR);

    if (files.length === 0) {
      return;
    }

    logger.info(`🔍 Found ${files.length} file(s) in ${WEBDAV_DIR}`);

    // Procesar archivos en paralelo (con límite implícito por el Set)
    await Promise.all(files.map((file) => processFile(file)));
  } catch (error) {
    logger.error(`❌ Error scanning directory:`, error);
  }
}

/**
 * Loop principal del watcher
 */
export async function startWatcher(): Promise<void> {
  logger.info(`🚀 WebDAV Watcher starting...`);
  logger.info(`📁 Watching directory: ${WEBDAV_DIR}`);
  logger.info(`📁 Processed directory: ${PROCESSED_DIR}`);
  logger.info(`⏱️  Polling interval: ${POLLING_INTERVAL_MS}ms`);
  logger.info(`🔒 File stable checks: ${FILE_STABLE_CHECKS}`);

  // Verificar que el prefix map existe
  try {
    await getClienteByPrefix('test'); // Trigger load
    logger.info(`✅ Prefix map loaded successfully`);
  } catch (error) {
    logger.error(`❌ Failed to load prefix map:`, error);
    throw error;
  }

  while (!isShuttingDown) {
    await scanDirectory();
    await sleep(POLLING_INTERVAL_MS);
  }

  logger.info(`🛑 Watcher stopped`);
}
