/**
 * Config loader para mapeo de prefijos
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

export interface ClienteConfig {
  clienteId: string;
  cuit: string;
  r2Bucket: string;  // Nombre del bucket específico del cliente
  r2Prefix: string;  // Prefijo dentro del bucket (puede ser vacío)
}

export type PrefixMap = Record<string, ClienteConfig>;

const DEFAULT_PREFIX_MAP_PATH = process.env.PREFIX_MAP_PATH || '/etc/axp/prefix-map.json';

let cachedPrefixMap: PrefixMap | null = null;

/**
 * Carga el mapeo de prefijos desde archivo JSON
 */
export async function loadPrefixMap(path: string = DEFAULT_PREFIX_MAP_PATH): Promise<PrefixMap> {
  if (cachedPrefixMap) {
    return cachedPrefixMap;
  }

  if (!existsSync(path)) {
    throw new Error(`Prefix map file not found: ${path}`);
  }

  try {
    const content = await readFile(path, 'utf-8');
    cachedPrefixMap = JSON.parse(content);
    return cachedPrefixMap!;
  } catch (error) {
    throw new Error(`Failed to load prefix map from ${path}: ${error}`);
  }
}

/**
 * Obtiene la config de un cliente por su prefijo
 */
export async function getClienteByPrefix(prefix: string): Promise<ClienteConfig | null> {
  const prefixMap = await loadPrefixMap();
  return prefixMap[prefix] || null;
}

/**
 * Refresca el cache del prefix map (útil para hot reload)
 */
export function clearPrefixMapCache(): void {
  cachedPrefixMap = null;
}
