/**
 * AWS Textract Client
 * 
 * Cliente para procesar documentos con AWS Textract.
 * Extrae texto, fechas, números y estructura de facturas/documentos.
 */

import {
  TextractClient,
  AnalyzeExpenseCommand,
  AnalyzeExpenseCommandInput,
  AnalyzeExpenseCommandOutput,
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
 * Procesa un PDF con AWS Textract usando AnalyzeExpense (específico para facturas)
 */
export async function processWithTextract(
  pdfBuffer: Buffer,
  region: string = 'us-east-1'
): Promise<AnalyzeExpenseCommandOutput> {
  const client = createTextractClient(region);

  const input: AnalyzeExpenseCommandInput = {
    Document: {
      Bytes: pdfBuffer,
    },
  };

  try {
    logger.info(`🤖 Sending document to Textract AnalyzeExpense (${(pdfBuffer.length / 1024).toFixed(2)} KB)...`);
    const startTime = Date.now();

    const command = new AnalyzeExpenseCommand(input);
    const response = await client.send(command);

    const duration = Date.now() - startTime;
    logger.info(`✅ Textract completed (${duration}ms)`);
    logger.info(`📄 Expense documents detected: ${response.ExpenseDocuments?.length || 0}`);

    return response;
  } catch (error) {
    logger.error(`❌ Textract processing failed:`, error);
    throw error;
  }
}

/**
 * Parsea resultado de Textract AnalyzeExpense y extrae campos relevantes
 */
export function parseTextractResult(result: AnalyzeExpenseCommandOutput): any {
  const expenseDocuments = result.ExpenseDocuments || [];
  
  if (expenseDocuments.length === 0) {
    logger.warn('⚠️  No expense documents found in Textract result');
    return {
      tipo: 'FACTURA',
      letra: null,
      puntoVenta: null,
      numero: null,
      numeroCompleto: null,
      fechaEmision: null,
      fechaVencimiento: null,
      subtotal: null,
      iva: null,
      total: null,
      moneda: 'ARS',
      proveedor: null,
      proveedorCUIT: null,
      items: [],
      confidenceScore: 0,
      missingFields: ['fechaEmision', 'total', 'proveedor'],
    };
  }

  const doc = expenseDocuments[0]; // Tomar el primer documento
  const summaryFields = doc.SummaryFields || [];
  const lineItems = doc.LineItemGroups || [];

  logger.info(`📝 Found ${summaryFields.length} summary fields and ${lineItems.length} line item groups`);

  // Función helper para buscar campo por tipo
  const getFieldValue = (type: string): string | null => {
    const field = summaryFields.find(f => f.Type?.Text === type);
    return field?.ValueDetection?.Text || null;
  };

  // No necesitamos getFieldConfidence por ahora
  // const getFieldConfidence = (type: string): number => {
  //   const field = summaryFields.find(f => f.Type?.Text === type);
  //   return field?.ValueDetection?.Confidence || 0;
  // };

  // Extraer campos del summary
  const proveedor = getFieldValue('VENDOR_NAME');
  const fechaEmision = parseTextractDate(getFieldValue('INVOICE_RECEIPT_DATE'));
  const fechaVencimiento = parseTextractDate(getFieldValue('DUE_DATE'));
  const numeroCompleto = getFieldValue('INVOICE_RECEIPT_ID');
  const subtotal = parseTextractAmount(getFieldValue('SUBTOTAL'));
  const iva = parseTextractAmount(getFieldValue('TAX'));
  const total = parseTextractAmount(getFieldValue('TOTAL'));

  // Extraer TODO el texto raw para usar extractores legacy como fallback
  const allText: string[] = [];
  summaryFields.forEach(field => {
    if (field.ValueDetection?.Text) {
      allText.push(field.ValueDetection.Text);
    }
    if (field.LabelDetection?.Text) {
      allText.push(field.LabelDetection.Text);
    }
  });
  lineItems.forEach((group: any) => {
    (group.LineItems || []).forEach((item: any) => {
      (item.LineItemExpenseFields || []).forEach((field: any) => {
        if (field.ValueDetection?.Text) {
          allText.push(field.ValueDetection.Text);
        }
        if (field.LabelDetection?.Text) {
          allText.push(field.LabelDetection.Text);
        }
      });
    });
  });

  // Fallbacks usando extractores legacy
  const letra = extractLetra(allText);
  const proveedorCUIT = extractProveedorCUIT(allText);
  const fechaVencimientoFallback = fechaVencimiento || extractFechaVencimiento(allText);

  // Debug logging
  logger.info(`🔍 Extracted fields:`);
  logger.info(`   Proveedor: ${proveedor || 'N/A'}`);
  logger.info(`   CUIT: ${proveedorCUIT || 'N/A'}`);
  logger.info(`   Letra: ${letra || 'N/A'}`);
  logger.info(`   Subtotal (raw): "${getFieldValue('SUBTOTAL')}" → ${subtotal || 'N/A'}`);
  logger.info(`   IVA (raw): "${getFieldValue('TAX')}" → ${iva || 'N/A'}`);
  logger.info(`   Total (raw): "${getFieldValue('TOTAL')}" → ${total || 'N/A'}`);
  logger.info(`   Fecha emisión: ${fechaEmision || 'N/A'}`);
  logger.info(`   Fecha vencimiento: ${fechaVencimientoFallback || 'N/A'}`);

  // Extraer items
  const items = extractExpenseLineItems(lineItems);
  
  logger.info(`📦 Extracted ${items.length} line items`);

  // Calcular confianza promedio
  const confidences = summaryFields
    .map(f => f.ValueDetection?.Confidence || 0)
    .filter(c => c > 0);
  const confidenceScore = confidences.length > 0
    ? Math.round(confidences.reduce((sum, c) => sum + c, 0) / confidences.length)
    : 0;

  const parsed = {
    tipo: 'FACTURA',
    letra: letra, // Detectada con extractor legacy
    puntoVenta: null,
    numero: null,
    numeroCompleto: numeroCompleto,
    fechaEmision: fechaEmision,
    fechaVencimiento: fechaVencimientoFallback, // Con fallback al extractor legacy
    subtotal: subtotal,
    iva: iva,
    total: total,
    moneda: 'ARS', // Por defecto, se puede mejorar
    proveedor: proveedor,
    proveedorCUIT: proveedorCUIT, // Detectado con extractor legacy
    items: items,
    confidenceScore: confidenceScore,
    missingFields: [] as string[],
  };

  // Detectar campos faltantes
  if (!parsed.fechaEmision) parsed.missingFields.push('fechaEmision');
  if (!parsed.total) parsed.missingFields.push('total');
  if (!parsed.proveedor) parsed.missingFields.push('proveedor');

  return parsed;
}

// ============================================================================
// HELPERS para AnalyzeExpense
// ============================================================================

/**
 * Parsea fecha de Textract (varios formatos)
 */
function parseTextractDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  // Formatos comunes: "30/12/2025", "2025-12-30", "12/30/2025"
  const match1 = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match1 && match1[1] && match1[2] && match1[3]) {
    const day = match1[1].padStart(2, '0');
    const month = match1[2].padStart(2, '0');
    const year = match1[3];
    return `${year}-${month}-${day}`; // ISO format
  }

  return null;
}

/**
 * Parsea monto de Textract
 */
function parseTextractAmount(amountStr: string | null): number | null {
  if (!amountStr) return null;
  return parseAmount(amountStr);
}

/**
 * Extrae line items del resultado de AnalyzeExpense
 */
function extractExpenseLineItems(lineItemGroups: any[]): any[] {
  const items: any[] = [];

  for (const group of lineItemGroups) {
    const lineItems = group.LineItems || [];

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const fields = item.LineItemExpenseFields || [];

      const getItemField = (type: string): string | null => {
        const field = fields.find((f: any) => f.Type?.Text === type);
        return field?.ValueDetection?.Text || null;
      };

      const descripcion = getItemField('ITEM') || getItemField('DESCRIPTION') || getItemField('PRODUCT_CODE') || `Item ${i + 1}`;
      const codigo = getItemField('PRODUCT_CODE');
      const cantidadStr = getItemField('QUANTITY');
      const precioStr = getItemField('UNIT_PRICE') || getItemField('PRICE');
      
      // El campo AMOUNT puede contener toda la fila, necesitamos extraer el último número
      let subtotalStr = getItemField('AMOUNT') || getItemField('LINE_ITEM_TOTAL') || getItemField('EXPENSE_ROW');
      
      // Si subtotalStr contiene texto adicional, extraer el último número
      if (subtotalStr && subtotalStr.includes(' ')) {
        // Buscar todos los números en el string
        const numbers = subtotalStr.match(/[\d,.]+/g);
        if (numbers && numbers.length > 0) {
          // El último número suele ser el subtotal
          subtotalStr = numbers[numbers.length - 1] || subtotalStr;
        }
      }

      // Debug: mostrar todos los campos del item
      logger.info(`  📦 Item ${i + 1}: ${descripcion}`);
      logger.info(`     Raw fields: cantidad="${cantidadStr}", precio="${precioStr}", subtotal="${subtotalStr}"`);

      items.push({
        linea: i + 1,
        descripcion: descripcion,
        codigo: codigo,
        cantidad: cantidadStr ? parseAmount(cantidadStr) : null,
        unidad: null, // AnalyzeExpense no detecta unidad
        precioUnitario: precioStr ? parseAmount(precioStr) : null,
        subtotal: subtotalStr ? parseAmount(subtotalStr) : null,
      });
    }
  }

  return items;
}

// ============================================================================
// EXTRACTORS LEGACY (ya no se usan con AnalyzeExpense)
// TODO: Eliminar estas funciones después de validar que AnalyzeExpense funciona correctamente
// ============================================================================

/* eslint-disable @typescript-eslint/no-unused-vars */

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
  // Buscar "FACTURA A", "FACTURAS A", "Factura A", o línea con solo "A"
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i] || '';
    
    // Patrón 1: "FACTURA A" o "FACTURAS A"
    const match1 = line.match(/FACTURAS?\s+([ABC])/i);
    if (match1 && match1[1]) {
      return match1[1].toUpperCase() as 'A' | 'B' | 'C';
    }

    // Patrón 2: Línea que solo contiene "A", "B" o "C"
    if (/^[ABC]$/i.test(line.trim())) {
      return line.trim().toUpperCase() as 'A' | 'B' | 'C';
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
    // Limpiar espacios
    str = str.trim();
    
    // Contar separadores
    const dotCount = (str.match(/\./g) || []).length;
    const commaCount = (str.match(/,/g) || []).length;
    
    let normalized: string;
    
    if (dotCount === 0 && commaCount === 0) {
      // Sin separadores: número entero
      normalized = str;
    } else if (dotCount > 1) {
      // Múltiples puntos: son separadores de miles (734.451.45)
      // Si también hay coma, la coma es decimal
      if (commaCount > 0) {
        normalized = str.replace(/\./g, '').replace(',', '.');
      } else {
        // Solo puntos: el último es decimal
        normalized = str.replace(/\./g, '');
      }
    } else if (commaCount > 1) {
      // Múltiples comas: son separadores de miles (734,451,45)
      // Si también hay punto, el punto es decimal
      if (dotCount > 0) {
        normalized = str.replace(/,/g, '');
      } else {
        // Solo comas: la última es decimal
        normalized = str.replace(/,/g, '');
      }
    } else {
      // Un solo separador (o uno de cada)
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      
      if (lastDot > lastComma) {
        // Punto después de coma: punto es decimal
        normalized = str.replace(/,/g, '');
      } else if (lastComma > lastDot) {
        // Coma después de punto: coma es decimal
        normalized = str.replace(/\./g, '').replace(',', '.');
      } else if (lastDot >= 0) {
        // Solo punto: es decimal
        normalized = str;
      } else {
        // Solo coma: es decimal
        normalized = str.replace(',', '.');
      }
    }
    
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? null : parsed;
  } catch (err) {
    return null;
  }
}

/**
 * Extrae items de productos desde las líneas de texto
 * Busca patrones de productos entre "Descripción" y "Subtotal:"
 */
function extractItemsFromTables(_blocks: Block[], lines: string[]): any[] {
  const items: any[] = [];
  
  // Estrategia: buscar líneas que empiecen con código numérico
  // seguidas de descripción, marca, cantidad, precio, subtotal
  let inProductSection = false;
  let currentItem: any = null;
  let lineNumber = 0;
  let numbersSeen = 0; // Contador de números vistos después del código

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').trim();

    // Detectar inicio de sección de productos
    if (line.match(/Descripción|Descripcion|Detalle/i)) {
      inProductSection = true;
      continue;
    }

    // Detectar fin de sección de productos
    if (line.match(/^Subtotal:/i) || line.match(/^El % de descuento/i)) {
      if (currentItem && numbersSeen >= 2) {
        items.push(currentItem);
      }
      break;
    }

    if (!inProductSection) continue;

    // Patrón: línea que empieza con código de producto (números de 4-6 dígitos)
    const codigoMatch = line.match(/^(\d{4,6})\s+(.+)/);
    if (codigoMatch) {
      // Guardar item anterior si existe y tiene datos completos
      if (currentItem && numbersSeen >= 2) {
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
      numbersSeen = 0;
      continue;
    }

    // Si tenemos un item activo, buscar más datos
    if (currentItem) {
      // Marca (suele estar sola en una línea, texto capitalizado)
      if (line.match(/^[A-Z][a-z]/) && !line.match(/\d/)) {
        // Probablemente una marca (Mc Cain, etc.)
        continue;
      }

      // Presentación/Unidad con cantidad (ej: "2 Kgr", "2.500 Kgr 42")
      const unidadConCantidad = line.match(/^([\d.,]+)\s*(Kgr|Kg|Lt|Un|Unidad)\s+(\d+)/i);
      if (unidadConCantidad) {
        currentItem.unidad = `${unidadConCantidad[1]} ${unidadConCantidad[2]}`;
        currentItem.cantidad = parseAmount(unidadConCantidad[3]);
        continue;
      }

      // Solo presentación/unidad (ej: "2 Kgr")
      const unidadMatch = line.match(/^([\d.,]+)\s*(Kgr|Kg|Lt|Un|Unidad)$/i);
      if (unidadMatch) {
        currentItem.unidad = line;
        continue;
      }

      // Cantidad sola (ej: "10" o "42")
      if (/^\d{1,4}$/.test(line) && !currentItem.cantidad) {
        currentItem.cantidad = parseAmount(line);
        continue;
      }

      // Línea con número decimal (puede ser precio o subtotal)
      if (/^[\d.,]+$/.test(line)) {
        const amount = parseAmount(line);
        
        if (!amount) continue;

        // Ignorar porcentajes (< 100 con punto decimal)
        if (amount < 100 && line.includes('.')) {
          continue; // Probablemente descuento % o alícuota IVA
        }

        numbersSeen++;

        // Primer número grande: precio unitario
        if (!currentItem.precioUnitario && amount > 100) {
          currentItem.precioUnitario = amount;
          continue;
        }

        // Segundo número grande: subtotal
        if (currentItem.precioUnitario && !currentItem.subtotal && amount > 1000) {
          currentItem.subtotal = amount;
          continue;
        }
      }
    }
  }

  // Guardar último item si existe y está completo
  if (currentItem && numbersSeen >= 2) {
    items.push(currentItem);
  }

  return items;
}
