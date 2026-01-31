/**
 * Lógica centralizada para determinar el estado de revisión de un documento
 */

export interface DocumentoParaEvaluar {
  clienteId: string | null;
  proveedorId: string | null;
  fechaEmision: Date | string | null;
  total: number | string | null;
  letra: string | null;
  numeroCompleto: string | null;
  subtotal: number | string | null;
  iva: number | string | null;
}

export type EstadoRevision = 'PENDIENTE' | 'CONFIRMADO' | 'ERROR' | 'DUPLICADO';

/**
 * Determina el estado de revisión de un documento basándose en todos sus campos
 * 
 * Un documento está CONFIRMADO solo cuando tiene:
 * 1. Campos críticos:
 *    - clienteId
 *    - proveedorId
 *    - fechaEmision
 *    - total
 * 
 * 2. Campos opcionales importantes:
 *    - letra
 *    - numeroCompleto
 *    - subtotal
 *    - iva
 * 
 * Si falta CUALQUIERA de estos campos → PENDIENTE
 */
export function determineEstadoRevision(doc: DocumentoParaEvaluar): EstadoRevision {
  // Campos críticos obligatorios
  const hasCriticalFields = !!(
    doc.clienteId && 
    doc.proveedorId && 
    doc.fechaEmision && 
    doc.total
  );
  
  if (!hasCriticalFields) {
    return 'PENDIENTE'; // Falta información crítica
  }
  
  // Campos opcionales pero importantes
  const hasOptionalFields = !!(
    doc.letra && 
    doc.numeroCompleto && 
    doc.subtotal && 
    doc.iva
  );
  
  if (!hasOptionalFields) {
    return 'PENDIENTE'; // Faltan campos opcionales importantes
  }
  
  return 'CONFIRMADO'; // Tiene todos los campos necesarios
}

/**
 * Calcula qué campos faltan en un documento
 */
export function calculateMissingFields(doc: DocumentoParaEvaluar): string[] {
  const missing: string[] = [];
  
  // Campos críticos
  if (!doc.clienteId) missing.push('clienteId');
  if (!doc.proveedorId) missing.push('proveedorId');
  if (!doc.fechaEmision) missing.push('fechaEmision');
  if (!doc.total) missing.push('total');
  
  // Campos opcionales importantes
  if (!doc.letra) missing.push('letra');
  if (!doc.numeroCompleto) missing.push('numeroCompleto');
  if (!doc.subtotal) missing.push('subtotal');
  if (!doc.iva) missing.push('iva');
  
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
