/**
 * AXP Workconsole.log(`🚀 AXP Worker starting in mode: ${WORKER_MODE}`);
console.log(`📅 Started at: ${new Date().toISOString()}`);

// Manejo de señales para graceful shutdown
export let isShuttingDown = false;

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  isShuttingDown = true;
  process.exit(0);
});
oint
 * 
 * Este worker maneja dos modos de operación:
 * - WATCHER: Observa carpeta WebDAV y encola archivos en IngestQueue
 * - PROCESSOR: Consume IngestQueue y procesa PDFs (sube a R2, prepara para Textract)
 * 
 * Modo seleccionado por env var: WORKER_MODE=watcher|processor
 */

import { startWatcher } from './watcher/webdavWatcher';
import { startProcessor } from './processor/queueProcessor';

const WORKER_MODE = process.env.WORKER_MODE || 'watcher';

console.log(`🚀 AXP Worker starting in mode: ${WORKER_MODE}`);
console.log(`📅 Started at: ${new Date().toISOString()}`);

// Manejo de señales para graceful shutdown
let isShuttingDown = false;

process.on('SIGTERM', () => {
  console.log('� SIGTERM received, shutting down gracefully...');
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

// Start en modo seleccionado
async function main() {
  try {
    if (WORKER_MODE === 'watcher') {
      await startWatcher();
    } else if (WORKER_MODE === 'processor') {
      await startProcessor();
    } else {
      console.error(`❌ Invalid WORKER_MODE: ${WORKER_MODE}`);
      console.error('   Valid values: watcher, processor');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Fatal error starting worker:', error);
    process.exit(1);
  }
}

main();

export { isShuttingDown };
