/**
 * Database Logger
 *
 * Logs importantes se guardan en la base de datos para que
 * el usuario pueda verlos en el dashboard.
 */

import { prisma } from '../lib/prisma';

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
export type LogSource = 'OCR' | 'PROCESSOR' | 'WATCHER' | 'SYSTEM';

interface LogEntry {
  clienteId: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  details?: Record<string, any>;
  documentoId?: string;
  filename?: string;
}

// Queue para enviar logs en batch (reduce llamadas a DB)
const logQueue: LogEntry[] = [];
let flushTimer: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL = 5000; // 5 segundos
const MAX_QUEUE_SIZE = 50;

/**
 * Envía los logs pendientes a la base de datos
 */
async function flushLogs(): Promise<void> {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue.length = 0; // Clear queue

  try {
    await prisma.processing_logs.createMany({
      data: logsToSend.map((log) => ({
        cliente_id: log.clienteId,
        level: log.level,
        source: log.source,
        message: log.message.substring(0, 1000), // Limitar tamaño
        details: log.details || {},
        documento_id: log.documentoId || null,
        filename: log.filename || null,
      })),
    });
  } catch (error) {
    // Si falla el guardado, loguear en consola pero no perder los logs
    console.error('[DB_LOGGER] Error saving logs to database:', error);
    // Intentar enviar a la API como fallback
    for (const log of logsToSend) {
      try {
        await sendLogToApi(log);
      } catch {
        console.error('[DB_LOGGER] Failed to send log via API:', log.message);
      }
    }
  }
}

/**
 * Envía un log a la API web (fallback)
 */
async function sendLogToApi(log: LogEntry): Promise<void> {
  const webAppUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
  const serviceKey = process.env.WORKER_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    console.warn('[DB_LOGGER] No service key configured, cannot send log via API');
    return;
  }

  await fetch(`${webAppUrl}/api/logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(log),
  });
}

/**
 * Programa el flush de logs
 */
function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushLogs();
  }, FLUSH_INTERVAL);
}

/**
 * Añade un log a la cola
 */
function queueLog(entry: LogEntry): void {
  logQueue.push(entry);
  scheduleFlush();

  // Flush inmediato si la cola está llena o es un error
  if (logQueue.length >= MAX_QUEUE_SIZE || entry.level === 'ERROR') {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushLogs().catch(console.error);
  }
}

/**
 * Crea un logger para un cliente específico
 */
export function createDbLogger(clienteId: string, source: LogSource) {
  const consolePrefix = `[${source}]`;

  return {
    /**
     * Log de información (no se guarda en DB por defecto para no saturar)
     */
    info: (message: string, details?: Record<string, any>) => {
      console.log(consolePrefix, message, details ? JSON.stringify(details) : '');
    },

    /**
     * Log de éxito (se guarda en DB)
     */
    success: (message: string, options?: { filename?: string; documentoId?: string; details?: Record<string, any> }) => {
      console.log(consolePrefix, '✅', message);
      queueLog({
        clienteId,
        level: 'SUCCESS',
        source,
        message,
        ...options,
      });
    },

    /**
     * Log de warning (se guarda en DB)
     */
    warn: (message: string, options?: { filename?: string; documentoId?: string; details?: Record<string, any> }) => {
      console.warn(consolePrefix, '⚠️', message);
      queueLog({
        clienteId,
        level: 'WARNING',
        source,
        message,
        ...options,
      });
    },

    /**
     * Log de error (se guarda en DB inmediatamente)
     */
    error: (message: string, options?: { filename?: string; documentoId?: string; details?: Record<string, any> }) => {
      console.error(consolePrefix, '❌', message);
      queueLog({
        clienteId,
        level: 'ERROR',
        source,
        message,
        ...options,
      });
    },

    /**
     * Log debug (solo consola)
     */
    debug: (message: string, data?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(consolePrefix, message, data);
      }
    },
  };
}

/**
 * Logger para logs sin cliente específico (sistema)
 */
export function createSystemLogger(source: LogSource = 'SYSTEM') {
  const consolePrefix = `[${source}]`;

  return {
    info: (...args: unknown[]) => console.log(consolePrefix, ...args),
    warn: (...args: unknown[]) => console.warn(consolePrefix, '⚠️', ...args),
    error: (...args: unknown[]) => console.error(consolePrefix, '❌', ...args),
    debug: (...args: unknown[]) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(consolePrefix, ...args);
      }
    },
  };
}

/**
 * Fuerza el flush de todos los logs pendientes
 * Llamar antes de cerrar el proceso
 */
export async function flushAllLogs(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushLogs();
}

// Exportar para tests
export { flushLogs };
