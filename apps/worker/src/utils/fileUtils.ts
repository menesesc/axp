/**
 * Utilidades para el worker
 */

import { createHash } from 'crypto';
import { stat, rename, copyFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Calcula SHA256 de un archivo
 */
export async function calculateFileSHA256(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  const hash = createHash('sha256');
  hash.update(Buffer.from(buffer));
  return hash.digest('hex');
}

/**
 * Espera a que un archivo esté "estable" (tamaño no cambia)
 * @returns true si el archivo está estable, false si no existe o hay error
 */
export async function waitForFileStable(
  filePath: string,
  checks: number = 3,
  intervalMs: number = 500
): Promise<boolean> {
  let previousSize = -1;
  let stableChecks = 0;

  for (let i = 0; i < checks * 2; i++) {
    try {
      const stats = await stat(filePath);
      const currentSize = stats.size;

      if (currentSize === previousSize && currentSize > 0) {
        stableChecks++;
        if (stableChecks >= checks) {
          return true;
        }
      } else {
        stableChecks = 0;
      }

      previousSize = currentSize;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } catch (error) {
      // Archivo no existe o error de acceso
      return false;
    }
  }

  return false;
}

/**
 * Mueve un archivo de forma segura (rename con fallback a copy+unlink)
 */
export async function moveFileSafe(source: string, destination: string): Promise<void> {
  // Asegurar que el directorio destino existe
  const destDir = dirname(destination);
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }

  try {
    // Intentar rename (atómico si es mismo filesystem)
    await rename(source, destination);
  } catch (error) {
    // Si falla (cross-device), hacer copy + unlink
    await copyFile(source, destination);
    await unlink(source);
  }
}

/**
 * Extrae el prefijo del nombre de archivo
 * Ejemplo: "weiss_20251226_231633.pdf" => "weiss"
 */
export function extractPrefixFromFilename(filename: string): string | null {
  const match = filename.match(/^([a-zA-Z0-9-]+)_/);
  return match ? match[1] : null;
}

/**
 * Genera una key de R2 organizada por cliente/fecha
 * Formato: ${r2Prefix}/${YYYY}/${MM}/${DD}/${filename}
 * Si r2Prefix está vacío, omite el prefijo inicial
 */
export function generateR2Key(r2Prefix: string, filename: string, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Si r2Prefix está vacío, no agregar la barra inicial
  const prefix = r2Prefix ? `${r2Prefix}/` : '';
  return `${prefix}${year}/${month}/${day}/${filename}`;
}

/**
 * Añade SHA256 al nombre de archivo si hay colisión
 */
export function addSha256ToFilename(filename: string, sha256: string): string {
  const extIndex = filename.lastIndexOf('.');
  if (extIndex === -1) {
    return `${filename}_${sha256.substring(0, 8)}`;
  }

  const name = filename.substring(0, extIndex);
  const ext = filename.substring(extIndex);
  return `${name}_${sha256.substring(0, 8)}${ext}`;
}

/**
 * Logger simple con prefijo
 */
export function createLogger(prefix: string) {
  return {
    info: (...args: unknown[]) => console.log(`[${prefix}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${prefix}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${prefix}]`, ...args),
    debug: (...args: unknown[]) => console.debug(`[${prefix}]`, ...args),
  };
}

/**
 * Calcula el próximo retry con exponential backoff
 * Attempt 1: +2 min, Attempt 2: +4 min, Attempt 3: +8 min, Attempt 4: +16 min
 */
export function calculateNextRetry(attempts: number, baseDelayMs: number = 120000): Date {
  const maxDelayMs = 3600000; // 1 hora
  const backoffMultiplier = 2;

  const delayMs = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempts - 1), maxDelayMs);
  return new Date(Date.now() + delayMs);
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
