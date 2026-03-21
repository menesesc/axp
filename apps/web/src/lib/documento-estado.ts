/**
 * Lógica centralizada para determinar el estado de revisión de un documento
 */

export interface DocumentoParaEvaluar {
  clienteId: string | null;
  proveedorId: string | null;
  fechaEmision: Date | string | null;
  total: number | string | { toNumber(): number } | null; // Prisma Decimal compatible
  letra: string | null;
  numeroCompleto: string | null;
  subtotal: number | string | { toNumber(): number } | null;
  iva: number | string | { toNumber(): number } | null;
  pdfRawKey?: string | null;
}

export type EstadoRevision = 'PENDIENTE' | 'CONFIRMADO' | 'ERROR' | 'DUPLICADO';

/**
 * Helper: verifica si un valor numérico está presente (0 es válido, null/undefined no)
 */
function hasNumericValue(val: number | string | { toNumber(): number } | null | undefined): boolean {
  return val != null && val !== '';
}

/**
 * Determina el estado de revisión de un documento basándose en todos sus campos
 *
 * Un documento está CONFIRMADO solo cuando tiene:
 * 1. Campos críticos:
 *    - clienteId
 *    - proveedorId
 *    - fechaEmision
 *    - total (0 es válido)
 *
 * 2. Campos opcionales importantes:
 *    - letra
 *    - numeroCompleto
 *    - subtotal (0 es válido - ej: facturas exentas)
 *    - iva (0 es válido - ej: facturas exentas)
 *
 * Si falta CUALQUIERA de estos campos → PENDIENTE
 * Si no tiene PDF (pdfRawKey vacío) → PENDIENTE
 */
export function determineEstadoRevision(doc: DocumentoParaEvaluar & { missingFields?: unknown }): EstadoRevision {
  // Un documento sin PDF no puede estar confirmado
  if ('pdfRawKey' in doc && !doc.pdfRawKey) {
    return 'PENDIENTE';
  }

  // Si tiene receptorCUIT en missingFields, mantener PENDIENTE (CUIT receptor no coincide con cliente)
  if (Array.isArray(doc.missingFields) && doc.missingFields.includes('receptorCUIT')) {
    return 'PENDIENTE';
  }

  // Campos críticos obligatorios
  // Para total usamos hasNumericValue porque 0 es un valor válido
  const hasCriticalFields =
    !!doc.clienteId &&
    !!doc.proveedorId &&
    !!doc.fechaEmision &&
    hasNumericValue(doc.total);

  if (!hasCriticalFields) {
    return 'PENDIENTE';
  }

  // Campos opcionales pero importantes
  // subtotal e iva pueden ser 0 (facturas exentas, monotributo, etc.)
  const hasOptionalFields =
    !!doc.letra &&
    !!doc.numeroCompleto &&
    hasNumericValue(doc.subtotal) &&
    hasNumericValue(doc.iva);

  if (!hasOptionalFields) {
    return 'PENDIENTE';
  }

  return 'CONFIRMADO';
}

/**
 * Calcula qué campos faltan en un documento
 */
export function calculateMissingFields(doc: DocumentoParaEvaluar & { missingFields?: unknown }): string[] {
  const missing: string[] = [];

  // Preservar flags especiales del OCR que no se pueden recalcular
  if (Array.isArray(doc.missingFields) && doc.missingFields.includes('receptorCUIT')) {
    missing.push('receptorCUIT');
  }

  // Campos críticos
  if (!doc.clienteId) missing.push('clienteId');
  if (!doc.proveedorId) missing.push('proveedorId');
  if (!doc.fechaEmision) missing.push('fechaEmision');
  if (!hasNumericValue(doc.total)) missing.push('total');

  // Campos opcionales importantes (0 es valor válido para numéricos)
  if (!doc.letra) missing.push('letra');
  if (!doc.numeroCompleto) missing.push('numeroCompleto');
  if (!hasNumericValue(doc.subtotal)) missing.push('subtotal');
  if (!hasNumericValue(doc.iva)) missing.push('iva');

  return missing;
}

/**
 * Verifica si un documento tiene todos los campos necesarios
 */
export function isDocumentoCompleto(doc: DocumentoParaEvaluar): boolean {
  return determineEstadoRevision(doc) === 'CONFIRMADO';
}

/**
 * Devuelve un resumen legible de qué le falta al documento
 */
export function getMissingFieldsSummary(doc: DocumentoParaEvaluar): string {
  const missing = calculateMissingFields(doc);
  
  if (missing.length === 0) {
    return 'Documento completo';
  }
  
  const fieldNames: Record<string, string> = {
    clienteId: 'Cliente',
    proveedorId: 'Proveedor',
    fechaEmision: 'Fecha de emisión',
    total: 'Total',
    letra: 'Letra',
    numeroCompleto: 'Número completo',
    subtotal: 'Subtotal',
    iva: 'IVA',
  };
  
  const missingNames = missing.map(f => fieldNames[f] || f);
  
  if (missing.length === 1) {
    return `Falta: ${missingNames[0]}`;
  }
  
  return `Faltan: ${missingNames.join(', ')}`;
}
