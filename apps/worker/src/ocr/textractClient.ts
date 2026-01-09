/**
 * AWS Textract Client
 * 
 * Cliente para procesar documentos con AWS Textract.
 * Extrae texto, fechas, números y estructura de facturas/documentos.
 */

import {
  TextractClient,
  AnalyzeDocumentCommand,
  AnalyzeDocumentCommandInput,
  AnalyzeDocumentCommandOutput,
  Block,
} from '@aws-sdk/client-textract';
import { createLogger } from '../utils/fileUtils';

const logger = createLogger('TEXTRACT');

/**
 * Crea cliente de Textract
 */
function createTextractClient(region: string): TextractClient {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  
  // Log para debugging (solo primeros/últimos caracteres)
  logger.info(`🔑 AWS Credentials check:`);
  logger.info(`   AccessKeyId: ${accessKeyId ? `${accessKeyId.substring(0, 4)}...${accessKeyId.substring(accessKeyId.length - 4)} (length: ${accessKeyId.length})` : 'MISSING'}`);
  logger.info(`   SecretAccessKey: ${secretAccessKey ? `${secretAccessKey.substring(0, 4)}...${secretAccessKey.substring(secretAccessKey.length - 4)} (length: ${secretAccessKey.length})` : 'MISSING'}`);
  logger.info(`   Region: ${region}`);
  
  return new TextractClient({
    region,
    credentials: {
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
    },
  });
}

/**
 * Procesa un PDF con AWS Textract
 */
export async function processWithTextract(
  pdfBuffer: Buffer,
  region: string = 'us-east-1'
): Promise<AnalyzeDocumentCommandOutput> {
  const client = createTextractClient(region);

  const input: AnalyzeDocumentCommandInput = {
    Document: {
      Bytes: pdfBuffer,
    },
    FeatureTypes: ['TABLES', 'FORMS'], // Detectar tablas y formularios
  };

  try {
    logger.info(`🤖 Sending document to Textract (${(pdfBuffer.length / 1024).toFixed(2)} KB)...`);
    const startTime = Date.now();

    const command = new AnalyzeDocumentCommand(input);
    const response = await client.send(command);

    const duration = Date.now() - startTime;
    logger.info(`✅ Textract completed (${duration}ms)`);
    logger.info(`📄 Blocks detected: ${response.Blocks?.length || 0}`);

    return response;
  } catch (error) {
    logger.error(`❌ Textract processing failed:`, error);
    throw error;
  }
}

/**
 * Parsea resultado de Textract y extrae campos relevantes
 */
export function parseTextractResult(result: AnalyzeDocumentCommandOutput): any {
  const blocks = result.Blocks || [];

  // Extraer todo el texto
  const lines = blocks
    .filter((b: Block) => b.BlockType === 'LINE')
    .map((b: Block) => b.Text || '')
    .filter((t: string) => t.trim().length > 0);

  logger.info(`📝 Extracted ${lines.length} lines of text`);

  // Extraer items de productos desde las tablas
  const items = extractItemsFromTables(blocks, lines);
  logger.info(`📦 Extracted ${items.length} product items`);

  // TODO: Implementar parsers específicos para cada campo
  const parsed = {
    // Tipo de documento
    tipo: detectTipoDocumento(lines),
    letra: extractLetra(lines),

    // Números
    puntoVenta: extractPuntoVenta(lines),
    numero: extractNumero(lines),
    numeroCompleto: extractNumeroCompleto(lines),

    // Fechas
    fechaEmision: extractFechaEmision(lines),
    fechaVencimiento: extractFechaVencimiento(lines),

    // Montos
    subtotal: extractSubtotal(lines),
    iva: extractIVA(lines),
    total: extractTotal(lines),
    moneda: extractMoneda(lines) || 'ARS',

    // Proveedor (nombre y CUIT)
    proveedor: extractProveedor(lines),
    proveedorCUIT: extractProveedorCUIT(lines),

    // Items de productos
    items: items,

    // Confianza
    confidenceScore: calculateConfidence(blocks),

    // Campos faltantes
    missingFields: [] as string[],

    // Raw data para debugging
    _rawLines: lines,
    _blockCount: blocks.length,
  };

  // Detectar campos faltantes
  if (!parsed.fechaEmision) parsed.missingFields.push('fechaEmision');
  if (!parsed.total) parsed.missingFields.push('total');
  if (!parsed.proveedor) parsed.missingFields.push('proveedor');

  return parsed;
}

// ============================================================================
// EXTRACTORS (implementación básica - mejorar con regex más específicos)
// ============================================================================

function detectTipoDocumento(lines: string[]): 'FACTURA' | 'REMITO' | 'NOTA_CREDITO' {
  const text = lines.join(' ').toUpperCase();

  if (text.includes('NOTA DE CREDITO') || text.includes('NOTA CRÉDITO')) {
    return 'NOTA_CREDITO';
  }
  if (text.includes('REMITO')) {
    return 'REMITO';
  }
  return 'FACTURA'; // Default
}

function extractLetra(lines: string[]): 'A' | 'B' | 'C' | null {
  // Buscar "FACTURA A", "FACTURA B", etc
  for (const line of lines) {
    const match = line.match(/FACTURA\s+([ABC])/i);
    if (match) {
      return match[1].toUpperCase() as 'A' | 'B' | 'C';
    }
  }
  return null;
}

function extractPuntoVenta(lines: string[]): string | null {
  // Buscar "Pto. Vta: 0001" o similar
  for (const line of lines) {
    const match = line.match(/(?:Pto\.?\s*Vta\.?|Punto\s+de\s+Venta)[:.\s]*(\d{4,5})/i);
    if (match) {
      return match[1].padStart(4, '0');
    }
  }
  return null;
}

function extractNumero(lines: string[]): string | null {
  // Buscar "Nº: 00000001" o "Comp. Nro: 00164715"
  for (const line of lines) {
    const match = line.match(/(?:N[°º]|Nro|Número|Comp\.?\s*Nro)[:.\s]*(\d{8,})/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractNumeroCompleto(lines: string[]): string | null {
  // Buscar "0001-00000001" o "A00004-00164715"
  for (const line of lines) {
    const match = line.match(/([A-Z]?\d{4,5})[-\s](\d{8,})/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }
  }
  return null;
}

function extractFechaEmision(lines: string[]): string | null {
  // Buscar "Fecha: 20/12/2025", "Emisión: 20-12-2025", "Fecha Comprobante: 30/12/2025"
  for (const line of lines) {
    const match = line.match(/(?:Fecha(?:\s+Comprobante)?|Emisión|Emision)[:.\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      return `${year}-${month}-${day}`; // ISO format
    }
  }
  return null;
}

function extractFechaVencimiento(lines: string[]): string | null {
  // Buscar "Vto: 20/01/2026" o "Vencimiento: 20-01-2026"
  for (const line of lines) {
    const match = line.match(/(?:Vto\.?|Vencimiento)[:.\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

function extractSubtotal(lines: string[]): number | null {
  // Estrategia 1: Buscar "Subtotal: $ 1.234,56" o "Neto: 1234.56" en la misma línea
  for (const line of lines) {
    const match = line.match(/^(?:Subtotal|Neto|Sub\s*Total)[:.\s]*\$?\s*([\d.,]+)/i);
    if (match) {
      return parseAmount(match[1]);
    }
  }

  // Estrategia 2: Buscar palabra clave y número en línea siguiente
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^(?:Subtotal|Neto):?\s*$/i.test(lines[i]?.trim() || '')) {
      const nextLine = lines[i + 1]?.trim() || '';
      const match = nextLine.match(/^([\d.,]+)$/);
      if (match && match[1]) {
        const amount = parseAmount(match[1]);
        if (amount && amount > 0 && amount < 1000000000) {
          return amount;
        }
      }
    }
  }

  return null;
}

function extractIVA(lines: string[]): number | null {
  // Estrategia 1: Buscar "IVA 21%: $ 259,26" o "IVA: 259.26" en la misma línea
  for (const line of lines) {
    const match = line.match(/^IVA(?:\s*\d+[.,]?\d*%)?[:.\s]*\$?\s*([\d.,]+)/i);
    if (match) {
      return parseAmount(match[1]);
    }
  }

  // Estrategia 2: Buscar "IVA 21,0%:" y número en línea siguiente
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^IVA.*:?\s*$/i.test(lines[i]?.trim() || '')) {
      const nextLine = lines[i + 1]?.trim() || '';
      const match = nextLine.match(/^([\d.,]+)$/);
      if (match && match[1]) {
        const amount = parseAmount(match[1]);
        if (amount && amount > 0 && amount < 1000000000) {
          return amount;
        }
      }
    }
  }

  return null;
}

function extractTotal(lines: string[]): number | null {
  // Estrategia 1: Buscar "Total: $ 1.493,82" o "TOTAL: 1493.82" en la misma línea
  for (const line of lines) {
    const match = line.match(/^Total[:.\s]*\$?\s*([\d.,]+)/i);
    if (match) {
      return parseAmount(match[1]);
    }
  }

  // Estrategia 2: Buscar "Total:" en una línea y el número en la siguiente
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^Total:?\s*$/i.test(lines[i].trim())) {
      const nextLine = lines[i + 1].trim();
      // Verificar que la siguiente línea sea un número con formato argentino
      const match = nextLine.match(/^([\d.,]+)$/);
      if (match) {
        const amount = parseAmount(match[1]);
        // Validar que sea un monto razonable (> 0 y < 1 billón)
        if (amount && amount > 0 && amount < 1000000000) {
          return amount;
        }
      }
    }
  }

  return null;
}

function extractMoneda(lines: string[]): string | null {
  const text = lines.join(' ').toUpperCase();

  if (text.includes('USD') || text.includes('DOLAR') || text.includes('DÓLAR')) {
    return 'USD';
  }
  if (text.includes('EUR') || text.includes('EURO')) {
    return 'EUR';
  }
  return 'ARS'; // Default Argentina
}

function extractProveedor(lines: string[]): string | null {
  // Buscar nombre del proveedor (típicamente en las primeras líneas)
  // Esto es muy específico de cada layout, por ahora retornamos la primera línea
  // que no sea "ORIGINAL", "DUPLICADO", etc
  const ignoreWords = ['ORIGINAL', 'DUPLICADO', 'TRIPLICADO', 'FACTURA', 'REMITO'];

  for (const line of lines.slice(0, 10)) {
    const clean = line.trim();
    if (clean.length > 3 && !ignoreWords.some(w => clean.toUpperCase().includes(w))) {
      return clean;
    }
  }

  return null;
}

function extractProveedorCUIT(lines: string[]): string | null {
  // Buscar CUIT en formato: XX-XXXXXXXX-X o XXXXXXXXXXXX
  // Ejemplos: 30-53804819-0, 30-71215244-9, 33-71215244-9
  
  // ESTRATEGIA 1: Buscar en las primeras 15 líneas (zona del emisor/proveedor)
  // El CUIT del proveedor suele estar en el encabezado, antes del CUIT del cliente
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i] || '';
    
    // Buscar líneas que contengan "C.U.I.T" en la zona del proveedor
    if (line.match(/C\.?U\.?I\.?T\.?/i) && !line.match(/cliente|comprador/i)) {
      // Patrón con guiones
      const matchWithDashes = line.match(/\b(\d{2})[-\s]?(\d{8})[-\s]?(\d)\b/);
      if (matchWithDashes) {
        // Normalizar sin guiones (formato de 11 dígitos)
        return `${matchWithDashes[1]}${matchWithDashes[2]}${matchWithDashes[3]}`;
      }

      // Patrón sin guiones (11 dígitos seguidos)
      const matchNoDashes = line.match(/\b(\d{11})\b/);
      if (matchNoDashes) {
        return matchNoDashes[1];
      }
    }
  }

  // ESTRATEGIA 2: Buscar cualquier patrón XX-XXXXXXXX-X en las primeras líneas
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i] || '';
    const matchWithDashes = line.match(/\b(\d{2})[-](\d{8})[-](\d)\b/);
    if (matchWithDashes) {
      return `${matchWithDashes[1]}${matchWithDashes[2]}${matchWithDashes[3]}`;
    }
  }

  return null;
}

function calculateConfidence(blocks: Block[]): number {
  // Calcular confianza promedio de todos los bloques con confidence
  const confidences = blocks
    .filter((b: Block) => b.Confidence !== undefined)
    .map((b: Block) => b.Confidence || 0);

  if (confidences.length === 0) return 0;

  const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  return Math.round(avg);
}

function parseAmount(str: string): number | null {
  try {
    // Normalizar: remover puntos de miles, reemplazar coma por punto
    const normalized = str
      .replace(/\./g, '') // Remover puntos de miles
      .replace(',', '.'); // Coma decimal a punto

    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Extrae items de productos desde las líneas de texto
 * Busca patrones de productos entre "Descripción" y "Subtotal:"
 */
function extractItemsFromTables(blocks: Block[], lines: string[]): any[] {
  const items: any[] = [];
  
  // Estrategia: buscar líneas que empiecen con código numérico
  // seguidas de descripción, marca, cantidad, precio, subtotal
  let inProductSection = false;
  let currentItem: any = null;
  let lineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detectar inicio de sección de productos
    if (line.match(/Descripción|Descripcion|Detalle/i)) {
      inProductSection = true;
      continue;
    }

    // Detectar fin de sección de productos
    if (line.match(/^Subtotal:/i) || line.match(/^El % de descuento/i)) {
      if (currentItem) {
        items.push(currentItem);
      }
      break;
    }

    if (!inProductSection) continue;

    // Patrón: línea que empieza con código de producto (números)
    const codigoMatch = line.match(/^(\d{4,6})\s+(.+)/);
    if (codigoMatch) {
      // Guardar item anterior si existe
      if (currentItem) {
        items.push(currentItem);
      }

      // Nuevo item
      lineNumber++;
      currentItem = {
        linea: lineNumber,
        codigo: codigoMatch[1],
        descripcion: codigoMatch[2],
        cantidad: null,
        unidad: null,
        precioUnitario: null,
        subtotal: null,
      };
      continue;
    }

    // Si tenemos un item activo, buscar más datos
    if (currentItem) {
      // Marca (suele estar sola en una línea)
      if (line.match(/^[A-Z][a-z]/)) {
        // Probablemente una marca
        continue;
      }

      // Presentación/Unidad (ej: "2 Kgr", "2.500 Kgr")
      const unidadMatch = line.match(/^([\d.,]+)\s*(Kgr|Kg|Lt|Un|Unidad)/i);
      if (unidadMatch) {
        currentItem.unidad = line;
        continue;
      }

      // Línea con números (cantidad, precio, subtotal)
      // Ej: "10" o "42" (cantidad)
      if (/^\d{1,4}$/.test(line) && !currentItem.cantidad) {
        currentItem.cantidad = parseAmount(line);
        continue;
      }

      // Precio unitario (ej: "10642.402")
      if (/^[\d.,]+$/.test(line) && currentItem.cantidad && !currentItem.precioUnitario) {
        currentItem.precioUnitario = parseAmount(line);
        continue;
      }

      // Subtotal (último número grande)
      if (/^[\d.,]+$/.test(line) && currentItem.precioUnitario && !currentItem.subtotal) {
        const amount = parseAmount(line);
        if (amount && amount > 1000) {
          currentItem.subtotal = amount;
        }
      }
    }
  }

  // Guardar último item si existe
  if (currentItem) {
    items.push(currentItem);
  }

  return items;
}
