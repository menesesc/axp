/**
 * AXP Worker Entry Point
 * 
 * Este worker maneja tres modos de operación:
 * - WATCHER: Observa carpeta WebDAV y encola archivos en IngestQueue
 * - PROCESSOR: Consume IngestQueue y sube PDFs a R2 inbox/
 * - OCR: Procesa archivos de inbox/ con AWS Textract y organiza por fecha real
 * 
 * Modo seleccionado por env var: WORKER_MODE=watcher|processor|ocr
 */

import { startWatcher } from './watcher/webdavWatcher';
import { startProcessor } from './processor/queueProcessor';
import { startOCRProcessor } from './ocr/ocrProcessor';

const WORKER_MODE = process.env.WORKER_MODE || 'watcher';

console.log(`🚀 AXP Worker starting in mode: ${WORKER_MODE}`);
console.log(`📅 Started at: ${new Date().toISOString()}`);

// Manejo de señales para graceful shutdown
export let isShuttingDown = false;

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  isShuttingDown = true;
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  isShuttingDown = true;
  process.exit(0);
});

// Unhandled errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Validación de env vars críticas por modo. Si falta una, fail-fast.
// Esto evita que el worker arranque "a medias" y abandone archivos después
// de N reintentos.
function validateEnv(mode: string): void {
  const required: Record<string, string[]> = {
    watcher: ['DATABASE_URL'],
    processor: ['DATABASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'],
    ocr: ['DATABASE_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'ANTHROPIC_API_KEY'],
  };
  const vars = required[mode] ?? [];
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`❌ Missing required env vars for mode "${mode}": ${missing.join(', ')}`);
    console.error('   Configurar en Dokploy + docker-compose.prod.yml (environment: block)');
    process.exit(1);
  }
  console.log(`✅ Env vars validated for mode: ${mode}`);
}

// Start en modo seleccionado
async function main() {
  try {
    validateEnv(WORKER_MODE);

    if (WORKER_MODE === 'watcher') {
      await startWatcher();
    } else if (WORKER_MODE === 'processor') {
      await startProcessor();
    } else if (WORKER_MODE === 'ocr') {
      await startOCRProcessor();
    } else {
      console.error(`❌ Invalid WORKER_MODE: ${WORKER_MODE}`);
      console.error('   Valid values: watcher, processor, ocr');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Fatal error starting worker:', error);
    process.exit(1);
  }
}

main();
