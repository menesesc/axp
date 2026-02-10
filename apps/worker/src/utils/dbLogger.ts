/**
 * Database Logger
 *
 * Logs processing events to the database so users can see them in the dashboard.
 * Uses batching to reduce database calls.
 */

import { prisma } from '../lib/prisma';

type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
type LogSource = 'OCR' | 'PROCESSOR' | 'WATCHER' | 'SYSTEM';

interface LogEntry {
  clienteId: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  details?: Record<string, any>;
  documentoId?: string;
  filename?: string;
}

// Buffer for batch inserts
const logBuffer: LogEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
const MAX_BUFFER_SIZE = 50; // Or when buffer reaches 50 entries

/**
 * Flushes the log buffer to the database
 */
async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;

  const logsToFlush = [...logBuffer];
  logBuffer.length = 0; // Clear buffer

  try {
    await prisma.processing_logs.createMany({
      data: logsToFlush.map(log => ({
        cliente_id: log.clienteId,
        level: log.level,
        source: log.source,
        message: log.message,
        details: log.details || {},
        documento_id: log.documentoId || null,
        filename: log.filename || null,
        read: false,
      })),
    });
  } catch (error) {
    // Log to console but don't throw - we don't want logging failures to break processing
    console.error('[DB_LOGGER] Failed to flush logs to database:', error);
    // Put logs back in buffer for retry (at the front)
    logBuffer.unshift(...logsToFlush);
  }
}

/**
 * Schedules a flush if one isn't already scheduled
 */
function scheduleFlush(): void {
  if (flushTimeout) return;

  flushTimeout = setTimeout(async () => {
    flushTimeout = null;
    await flushLogs();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Adds a log entry to the buffer
 */
function addLog(entry: LogEntry): void {
  logBuffer.push(entry);

  // Flush immediately if buffer is full or if it's an error
  if (logBuffer.length >= MAX_BUFFER_SIZE || entry.level === 'ERROR') {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    flushLogs().catch(console.error);
  } else {
    scheduleFlush();
  }
}

/**
 * Creates a logger instance for a specific client and source
 */
export function createDbLogger(clienteId: string, source: LogSource) {
  return {
    info: (message: string, details?: Record<string, any>, filename?: string, documentoId?: string) => {
      addLog({ clienteId, level: 'INFO', source, message, details, filename, documentoId });
    },

    warning: (message: string, details?: Record<string, any>, filename?: string, documentoId?: string) => {
      addLog({ clienteId, level: 'WARNING', source, message, details, filename, documentoId });
    },

    error: (message: string, details?: Record<string, any>, filename?: string, documentoId?: string) => {
      addLog({ clienteId, level: 'ERROR', source, message, details, filename, documentoId });
    },

    success: (message: string, details?: Record<string, any>, filename?: string, documentoId?: string) => {
      addLog({ clienteId, level: 'SUCCESS', source, message, details, filename, documentoId });
    },
  };
}

/**
 * Force flush all pending logs (call on shutdown)
 */
export async function flushAllLogs(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushLogs();
}
