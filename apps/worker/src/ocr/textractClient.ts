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
import { PDFDocument } from 'pdf-lib';
import { createLogger } from '../utils/fileUtils';

const logger = createLogger('TEXTRACT');

/**
 * Extrae solo la primera página de un PDF
 * Esto evita problemas con PDFs de múltiples páginas (factura + remito + detalles)
 */
async function extractFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    
    logger.info(`📄 PDF has ${pageCount} page(s), extracting first page only`);
    
    if (pageCount === 1) {
      // Ya es de 1 página, devolver tal cual
      return pdfBuffer;
    }
    
    // Crear nuevo PDF con solo la primera página
    const newPdf = await PDFDocument.create();
    const [firstPage] = await newPdf.copyPages(pdfDoc, [0]);
    newPdf.addPage(firstPage);
    
    const newPdfBytes = await newPdf.save();
    const newBuffer = Buffer.from(newPdfBytes);
    
    logger.info(`✂️  Extracted first page: ${(pdfBuffer.length / 1024).toFixed(2)} KB → ${(newBuffer.length / 1024).toFixed(2)} KB`);
    
    return newBuffer;
  } catch (error) {
    logger.error(`❌ Error extracting first page, using full PDF:`, error);
    // Si falla, devolver el PDF original
    return pdfBuffer;
  }
}

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
 * Extrae automáticamente solo la primera página para evitar problemas con PDFs multipágina
 */
export async function processWithTextract(
  pdfBuffer: Buffer,
  region: string = 'us-east-1'
): Promise<AnalyzeExpenseCommandOutput> {
  // Extraer solo la primera página
  const firstPageBuffer = await extractFirstPage(pdfBuffer);
  
  const client = createTextractClient(region);

  const input: AnalyzeExpenseCommandInput = {
    Document: {
      Bytes: firstPageBuffer,
    },
  };

  try {
    logger.info(`🤖 Sending document to Textract AnalyzeExpense (${(firstPageBuffer.length / 1024).toFixed(2)} KB)...`);
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
      receptorCUIT: null,
      items: [],
      confidenceScore: 0,
      missingFields: ['fechaEmision', 'total', 'proveedor'],
    };
  }

  const doc = expenseDocuments[0]; // Tomar el primer documento
  const summaryFields = doc.SummaryFields || [];
  const lineItems = doc.LineItemGroups || [];
  const blocks = doc.Blocks || [];

  logger.info(`📝 Found ${summaryFields.length} summary fields, ${lineItems.length} line item groups, and ${blocks.length} total blocks`);

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
  const proveedor = normalizeText(getFieldValue('VENDOR_NAME'));
  let fechaEmision = parseTextractDate(getFieldValue('INVOICE_RECEIPT_DATE'));
  const fechaVencimiento = parseTextractDate(getFieldValue('DUE_DATE'));
  const numeroCompletoRaw = getFieldValue('INVOICE_RECEIPT_ID');

  // Limpiar numeroCompleto: solo números, remover N°, guiones, espacios
  let numeroCompleto = numeroCompletoRaw
    ? numeroCompletoRaw.replace(/[^\d]/g, '') // Solo dígitos
    : null;

  // VALIDACIÓN: Rechazar si parece ser un CUIT (11 dígitos empezando con prefijo típico)
  // Los CUITs argentinos empiezan con 20, 23, 24, 27, 30, 33, 34
  if (numeroCompleto && numeroCompleto.length === 11) {
    const cuitPrefixes = ['20', '23', '24', '27', '30', '33', '34'];
    if (cuitPrefixes.some(prefix => numeroCompleto!.startsWith(prefix))) {
      logger.warn(`⚠️  INVOICE_RECEIPT_ID "${numeroCompletoRaw}" looks like a CUIT, rejecting`);
      numeroCompleto = null;
    }
  }

  // VALIDACIÓN: Rechazar si parece ser un CAE (14 dígitos)
  // El CAE es un código de autorización de AFIP con 14 dígitos
  if (numeroCompleto && numeroCompleto.length === 14) {
    logger.warn(`⚠️  INVOICE_RECEIPT_ID "${numeroCompletoRaw}" looks like a CAE (14 digits), rejecting`);
    numeroCompleto = null;
  }

  // Extracción básica (se reemplaza más abajo con smart extraction)
  const subtotalBasic = parseTextractAmount(getFieldValue('SUBTOTAL'));
  const ivaBasic = parseTextractAmount(getFieldValue('TAX'));
  const totalBasic = parseTextractAmount(getFieldValue('TOTAL'));

  // ========================================================================
  // MEJORAR EXTRACCIÓN: Usar TODOS los Blocks (LINE y WORD)
  // Esto nos da acceso a TODO el texto del documento en orden
  // ========================================================================
  const allText: string[] = [];
  
  // 1. Extraer de SummaryFields
  summaryFields.forEach(field => {
    if (field.ValueDetection?.Text) {
      allText.push(field.ValueDetection.Text);
    }
    if (field.LabelDetection?.Text) {
      allText.push(field.LabelDetection.Text);
    }
  });
  
  // 2. Extraer de LineItems
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
  
  // 3. NUEVO: Extraer de TODOS los Blocks (LINE type)
  // Esto nos da acceso a texto que no está en SummaryFields ni LineItems
  blocks.forEach((block: Block) => {
    if (block.BlockType === 'LINE' && block.Text) {
      allText.push(block.Text);
    }
  });

  // Debug: mostrar primeras líneas de texto para verificar extractors
  logger.info(`📝 Raw text from all sources (first 50 lines):`);
  allText.slice(0, 50).forEach((line, i) => logger.info(`   ${i + 1}: "${line}"`));
  
  // Debug: buscar específicamente CUITs en todo el texto
  const cuitPattern = /\b(\d{2})[-](\d{7,8})[-](\d)\b/g;
  const foundCUITs = allText.filter(line => cuitPattern.test(line));
  logger.info(`🔍 Debug: Found ${foundCUITs.length} lines with CUIT pattern`);
  foundCUITs.slice(0, 5).forEach((line, i) => logger.info(`   CUIT ${i + 1}: "${line}"`));
  
  // También buscar específicamente "FACTURA", "A", "B", "C" en todo el texto
  const hasFactura = allText.some(line => /FACTURA/i.test(line));
  const hasLetraLine = allText.filter(line => /^[ABC]$/i.test(line.trim()));
  logger.info(`🔍 Debug: hasFactura=${hasFactura}, letraLines=${JSON.stringify(hasLetraLine.slice(0, 3))}`);

  // FALLBACK: Si Textract no detectó fecha válida, buscar en texto crudo
  if (!fechaEmision) {
    logger.warn(`⚠️  No valid fecha from Textract, searching in raw text...`);
    fechaEmision = extractFechaEmisionFromText(allText);
  }

  // FALLBACK: Si no hay número de factura válido, buscar en texto
  if (!numeroCompleto) {
    logger.warn(`⚠️  No valid invoice number from Textract, searching in raw text...`);
    numeroCompleto = extractNumeroFacturaFromText(allText);
  }

  // Fallbacks usando extractores legacy
  const letra = extractLetra(allText);
  const { proveedorCUIT, receptorCUIT } = extractCUITs(allText);
  const fechaVencimientoFallback = fechaVencimiento || extractFechaVencimiento(allText);

  // Detectar tipo de documento (FACTURA, NOTA_CREDITO, REMITO)
  const tipo = detectTipoDocumento(allText);
  logger.info(`📋 Tipo documento detectado: ${tipo}`);

  // EXTRACCIÓN INTELIGENTE DE TOTALES
  // El total es siempre el más grande, subtotal + IVA = total
  const smartTotals = extractSmartTotals(summaryFields, allText);
  const { subtotal, iva, total } = smartTotals;

  // Debug logging
  logger.info(`🔍 Extracted fields:`);
  logger.info(`   Proveedor: ${proveedor || 'N/A'}`);
  logger.info(`   CUIT Proveedor: ${proveedorCUIT || 'N/A'}`);
  logger.info(`   CUIT Receptor: ${receptorCUIT || 'N/A'}`);
  logger.info(`   Letra: ${letra || 'N/A'}`);
  logger.info(`   Subtotal (raw): "${getFieldValue('SUBTOTAL')}" → ${subtotalBasic || 'N/A'} → smart: ${subtotal || 'N/A'}`);
  logger.info(`   IVA (raw): "${getFieldValue('TAX')}" → ${ivaBasic || 'N/A'} → smart: ${iva || 'N/A'}`);
  logger.info(`   Total (raw): "${getFieldValue('TOTAL')}" → ${totalBasic || 'N/A'} → smart: ${total || 'N/A'}`);
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
    tipo: tipo,
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
    receptorCUIT: receptorCUIT, // CUIT del comprador/receptor en la factura
    items: items,
    confidenceScore: confidenceScore,
    missingFields: [] as string[],
  };

  // NOTA DE CREDITO: Los importes deben ser negativos
  if (parsed.tipo === 'NOTA_CREDITO') {
    if (parsed.subtotal && parsed.subtotal > 0) parsed.subtotal = -parsed.subtotal;
    if (parsed.iva && parsed.iva > 0) parsed.iva = -parsed.iva;
    if (parsed.total && parsed.total > 0) parsed.total = -parsed.total;
    // Negar importes de items también
    parsed.items = parsed.items.map((item: any) => ({
      ...item,
      subtotal: item.subtotal && item.subtotal > 0 ? -item.subtotal : item.subtotal,
    }));
    logger.info(`💳 Nota de crédito: importes negados → total: ${parsed.total}`);
  }

  // Detectar campos faltantes (para missingFields en BD)
  // NOTA: fechaVencimiento NO es campo crítico - no incluir
  if (!parsed.fechaEmision) parsed.missingFields.push('fechaEmision');
  if (!parsed.total) parsed.missingFields.push('total');
  if (!parsed.proveedor) parsed.missingFields.push('proveedor');
  if (!parsed.proveedorCUIT) parsed.missingFields.push('proveedorCUIT');
  if (!parsed.letra) parsed.missingFields.push('letra');
  if (!parsed.numeroCompleto) parsed.missingFields.push('numeroCompleto');
  if (!parsed.subtotal) parsed.missingFields.push('subtotal');
  if (!parsed.iva) parsed.missingFields.push('iva');

  return parsed;
}

// ============================================================================
// HELPERS para AnalyzeExpense
// ============================================================================

/**
 * Normaliza texto a mayúsculas y limpia espacios
 */
function normalizeText(text: string | null): string | null {
  if (!text) return null;
  return text.trim().toUpperCase();
}

/**
 * Parsea fecha de Textract (varios formatos)
 * Valida que la fecha sea razonable (> 2020, < año actual + 2)
 */
/**
 * Mapa de meses en español para parsear fechas largas
 */
const MESES_ES: Record<string, string> = {
  'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
  'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
  'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
};

function parseTextractDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const currentYear = new Date().getFullYear();

  // Formato largo español: "viernes 6 de febrero de 2026", "6 de febrero de 2026"
  const matchLong = dateStr.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
  if (matchLong && matchLong[1] && matchLong[2] && matchLong[3]) {
    const day = matchLong[1].padStart(2, '0');
    const mesStr = matchLong[2].toLowerCase();
    const year = matchLong[3];
    const month = MESES_ES[mesStr];

    if (month) {
      const yearNum = parseInt(year);
      if (yearNum >= 2020 && yearNum <= currentYear + 2) {
        logger.info(`📅 Parsed Spanish long date: "${dateStr}" → ${year}-${month}-${day}`);
        return `${year}-${month}-${day}`;
      }
    }
  }

  // Formatos comunes: "30/12/2025", "2025-12-30", "12/30/2025"
  const match1 = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match1 && match1[1] && match1[2] && match1[3]) {
    const day = match1[1].padStart(2, '0');
    const month = match1[2].padStart(2, '0');
    const year = match1[3];

    // VALIDACIÓN: Rechazar fechas antes de 2020 o muy en el futuro
    // Esto evita capturar "Inicio Actividades" o fechas incorrectas
    const yearNum = parseInt(year);
    if (yearNum < 2020 || yearNum > currentYear + 2) {
      logger.warn(`⚠️  Date ${dateStr} rejected: year ${year} out of range (2020-${currentYear + 2})`);
      return null;
    }

    return `${year}-${month}-${day}`; // ISO format
  }

  return null;
}

/**
 * Busca la fecha de emisión en el texto crudo
 * Prioriza líneas que contengan "FECHA" explícitamente
 */
function extractFechaEmisionFromText(lines: string[]): string | null {
  const currentYear = new Date().getFullYear();

  // Patrón 0: Fecha larga español "FECHA: viernes 6 de febrero de 2026"
  for (const line of lines) {
    if (/inicio|actividades/i.test(line)) continue;

    const matchLong = line.match(/\bFECHA\b[:\s]*(?:\w+\s+)?(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    if (matchLong && matchLong[1] && matchLong[2] && matchLong[3]) {
      const day = matchLong[1].padStart(2, '0');
      const mesStr = matchLong[2].toLowerCase();
      const year = matchLong[3];
      const month = MESES_ES[mesStr];
      if (month) {
        const yearNum = parseInt(year);
        if (yearNum >= 2020 && yearNum <= currentYear + 2) {
          logger.info(`📅 Found fecha larga from text: "${line}" → ${year}-${month}-${day}`);
          return `${year}-${month}-${day}`;
        }
      }
    }
  }

  // Patrón 1: "FECHA DD/MM/YYYY" o "FECHA: DD/MM/YYYY"
  for (const line of lines) {
    // Buscar específicamente la palabra FECHA seguida de una fecha
    // Ignorar líneas que contengan "Inicio" o "Actividades"
    if (/inicio|actividades/i.test(line)) continue;

    const match = line.match(/\bFECHA\b[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
    if (match && match[1] && match[2] && match[3]) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];

      // Validar año razonable
      const yearNum = parseInt(year);
      if (yearNum >= 2020 && yearNum <= currentYear + 2) {
        logger.info(`📅 Found fecha from text pattern "FECHA": ${year}-${month}-${day}`);
        return `${year}-${month}-${day}`;
      }
    }
  }

  // Patrón 1.5: Fecha larga español sin "FECHA:" al inicio, cerca de FACTURA
  // ej: "viernes 6 de febrero de 2026" en las primeras líneas
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i] || '';
    if (/inicio|actividades/i.test(line)) continue;

    const matchLong = line.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    if (matchLong && matchLong[1] && matchLong[2] && matchLong[3]) {
      const day = matchLong[1].padStart(2, '0');
      const mesStr = matchLong[2].toLowerCase();
      const year = matchLong[3];
      const month = MESES_ES[mesStr];
      if (month) {
        const yearNum = parseInt(year);
        if (yearNum >= 2020 && yearNum <= currentYear + 2) {
          logger.info(`📅 Found fecha larga near top: "${line}" → ${year}-${month}-${day}`);
          return `${year}-${month}-${day}`;
        }
      }
    }
  }

  // Patrón 2: Buscar en líneas que contengan "FACTURA" + fecha en la misma zona
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i] || '';
    if (/factura/i.test(line) && !/inicio|actividades/i.test(line)) {
      // Buscar fecha en esta línea o las siguientes 2
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const searchLine = lines[j] || '';
        if (/inicio|actividades/i.test(searchLine)) continue;

        const dateMatch = searchLine.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (dateMatch && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
          const day = dateMatch[1];
          const month = dateMatch[2];
          const year = dateMatch[3];

          const yearNum = parseInt(year);
          if (yearNum >= 2020 && yearNum <= currentYear + 2) {
            logger.info(`📅 Found fecha near FACTURA: ${year}-${month}-${day}`);
            return `${year}-${month}-${day}`;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extrae el número de factura del texto crudo
 * Busca patrones como "FACTURA A00012-00013515" o "A 0001-00013515"
 * IMPORTANTE: Excluye números de CAE que tienen 14 dígitos sin guión
 */
function extractNumeroFacturaFromText(lines: string[]): string | null {
  // Helper para verificar si una línea contiene referencia a CAE
  const isCAELine = (line: string): boolean => {
    return /\bCAE\b/i.test(line);
  };

  // Helper para verificar si es un número de CAE (14 dígitos continuos)
  const isCAENumber = (num: string): boolean => {
    // CAE típico: 14 dígitos sin guiones ni espacios
    const cleanNum = num.replace(/[-\s]/g, '');
    return /^\d{14}$/.test(cleanNum);
  };

  // Patrón 1: "FACTURA A00012-00013515" o "FACTURA A 00012-00013515"
  for (const line of lines) {
    // Saltar líneas que mencionan CAE
    if (isCAELine(line)) continue;

    // Buscar número de factura con formato típico argentino
    // Formato: [Letra][PtoVta 4-5 dígitos]-[Número 8 dígitos]
    const match = line.match(/FACTURA\s*([ABC])?[\s-]*(\d{4,5})[-\s]*(\d{8})/i);
    if (match) {
      const ptoVta = match[2]?.padStart(5, '0') || '';
      const numero = match[3] || '';
      const result = `${ptoVta}${numero}`;
      logger.info(`📝 Found invoice number from FACTURA pattern: ${result}`);
      return result;
    }
  }

  // Patrón 2: "Comp. Nro" o "Comprobante" con formato PtoVta-Numero
  for (const line of lines) {
    // Saltar líneas que mencionan CAE
    if (isCAELine(line)) continue;

    // Buscar "Comp. Nro:" seguido de formato con guión (más específico)
    const match = line.match(/(?:Comp\.?\s*(?:Nro\.?)?|Comprobante)\s*:?\s*(\d{4,5})[-\s](\d{8})/i);
    if (match && match[1] && match[2]) {
      const ptoVta = match[1].padStart(5, '0');
      const numero = match[2];
      const result = `${ptoVta}${numero}`;
      logger.info(`📝 Found invoice number from Comp. Nro pattern: ${result}`);
      return result;
    }
  }

  // Patrón 3: Línea con formato "A00012-00013515" o "0001-00013515" cerca del inicio
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i] || '';
    // Saltar líneas que mencionan CAE
    if (isCAELine(line)) continue;

    // Buscar patrón de número de factura con guión obligatorio
    const match = line.match(/^[ABC]?(\d{4,5})-(\d{8})$/);
    if (match && match[1] && match[2]) {
      const ptoVta = match[1].padStart(5, '0');
      const numero = match[2];
      const result = `${ptoVta}${numero}`;
      logger.info(`📝 Found invoice number from standalone pattern: ${result}`);
      return result;
    }
  }

  // Patrón 4: Buscar "Nro:" o "Número:" seguido de 12-13 dígitos (formato concatenado)
  // PERO solo si NO es un CAE (verificar contexto)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    // Saltar líneas que mencionan CAE
    if (isCAELine(line)) continue;

    // También verificar líneas cercanas para contexto CAE
    const prevLine = lines[i - 1] || '';
    const nextLine = lines[i + 1] || '';
    if (isCAELine(prevLine) || isCAELine(nextLine)) continue;

    const match = line.match(/(?:N[°º]|Número)\s*:?\s*(\d{12,13})/i);
    if (match && match[1]) {
      const num = match[1];
      // Verificar que no sea un CAE (14 dígitos) y tenga formato válido
      if (!isCAENumber(num)) {
        logger.info(`📝 Found invoice number from Nro pattern: ${num}`);
        return num;
      } else {
        logger.info(`📝 Skipping CAE-like number: ${num}`);
      }
    }
  }

  // Patrón 5: "Punto de Venta: XXXX" y "Comp. Nro: XXXXXXXX" en líneas separadas
  // Común en facturas con formato tabular donde punto de venta y número están separados
  let puntoVentaFound: string | null = null;
  let compNroFound: string | null = null;
  for (const line of lines) {
    if (isCAELine(line)) continue;

    const pvMatch = line.match(/(?:Punto\s+de\s+Venta|Pto\.?\s*(?:de\s+)?Vta\.?)\s*:?\s*(\d{4,5})/i);
    if (pvMatch && pvMatch[1]) {
      puntoVentaFound = pvMatch[1].padStart(5, '0');
    }

    const nroMatch = line.match(/(?:Comp\.?\s*(?:Nro\.?)?|Comprobante)\s*:?\s*(\d{5,8})/i);
    if (nroMatch && nroMatch[1]) {
      compNroFound = nroMatch[1].padStart(8, '0');
    }
  }
  if (puntoVentaFound && compNroFound) {
    const result = `${puntoVentaFound}${compNroFound}`;
    logger.info(`📝 Found invoice number from separate Punto de Venta + Comp. Nro: ${result}`);
    return result;
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
 * Extracción inteligente de totales
 *
 * Estrategia CONSERVADORA:
 * 1. CONFIAR en Textract primero - sus valores son más confiables
 * 2. Solo buscar en texto si Textract no detectó valores
 * 3. Validar que subtotal + IVA ≈ total (sanity check)
 * 4. Límite máximo para evitar overflow en BD: 999,999,999,999 (< 10^12)
 */
function extractSmartTotals(
  summaryFields: any[],
  allText: string[]
): { subtotal: number | null; iva: number | null; total: number | null } {

  // Límite máximo (precision 14, scale 2 = max ~10^12)
  const MAX_AMOUNT = 999_999_999_999;

  // Función helper para obtener campos
  const getFieldValue = (type: string): string | null => {
    const field = summaryFields.find((f: any) => f.Type?.Text === type);
    return field?.ValueDetection?.Text || null;
  };

  // Función para validar que un monto es razonable
  const isValidAmount = (value: number | null): value is number => {
    return value !== null && value > 0 && value <= MAX_AMOUNT;
  };

  // Extraer valores directos de Textract (FUENTE PRINCIPAL)
  let subtotal = parseTextractAmount(getFieldValue('SUBTOTAL'));
  let iva = parseTextractAmount(getFieldValue('TAX'));
  let total = parseTextractAmount(getFieldValue('TOTAL'));

  logger.info(`💰 Textract values: subtotal=${subtotal}, iva=${iva}, total=${total}`);

  // Validar que los valores sean razonables
  if (subtotal && subtotal > MAX_AMOUNT) {
    logger.warn(`💰 Subtotal ${subtotal} exceeds max, ignoring`);
    subtotal = null;
  }
  if (iva && iva > MAX_AMOUNT) {
    logger.warn(`💰 IVA ${iva} exceeds max, ignoring`);
    iva = null;
  }
  if (total && total > MAX_AMOUNT) {
    logger.warn(`💰 Total ${total} exceeds max, ignoring`);
    total = null;
  }

  // SANITY CHECK: Si tenemos subtotal e IVA, el total debería ser ≈ subtotal + IVA
  if (isValidAmount(subtotal) && isValidAmount(iva) && isValidAmount(total)) {
    const expectedTotal = subtotal + iva;
    const tolerance = total * 0.05; // 5% tolerancia para otros impuestos menores

    if (Math.abs(total - expectedTotal) > tolerance) {
      // Los valores no cuadran - el total podría incluir otros impuestos
      // o hay un error. Confiamos en el total de Textract.
      logger.info(`💰 Values don't match perfectly: ${subtotal} + ${iva} = ${subtotal + iva}, but total = ${total}`);
      logger.info(`💰 Keeping Textract total (may include other taxes)`);
    }
  }

  // FALLBACK: Solo si Textract no dio total, intentar buscar en texto
  if (!isValidAmount(total)) {
    logger.info(`💰 No valid total from Textract, searching in text...`);

    // Buscar líneas que contengan "TOTAL" seguido de un valor
    const textJoined = allText.join('\n');
    const totalMatch = textJoined.match(/\bTOTAL\b[:\s$]*([\d.,]+)/i);

    if (totalMatch && totalMatch[1]) {
      const parsedTotal = parseAmount(totalMatch[1]);
      if (isValidAmount(parsedTotal)) {
        total = parsedTotal;
        logger.info(`💰 Found total in text: ${total}`);
      }
    }
  }

  // Si tenemos total y subtotal pero no IVA, calcular
  if (isValidAmount(total) && isValidAmount(subtotal) && !isValidAmount(iva)) {
    const calculatedIva = total - subtotal;
    if (calculatedIva > 0 && calculatedIva <= MAX_AMOUNT) {
      iva = calculatedIva;
      logger.info(`💰 Calculated IVA: ${total} - ${subtotal} = ${iva}`);
    }
  }

  // Si tenemos total e IVA pero no subtotal, calcular
  if (isValidAmount(total) && isValidAmount(iva) && !isValidAmount(subtotal)) {
    const calculatedSubtotal = total - iva;
    if (calculatedSubtotal > 0 && calculatedSubtotal <= MAX_AMOUNT) {
      subtotal = calculatedSubtotal;
      logger.info(`💰 Calculated subtotal: ${total} - ${iva} = ${subtotal}`);
    }
  }

  // FALLBACK FINAL: Si solo tenemos subtotal e IVA, calcular total
  if (!isValidAmount(total) && isValidAmount(subtotal) && isValidAmount(iva)) {
    total = subtotal + iva;
    logger.info(`💰 Calculated total: ${subtotal} + ${iva} = ${total}`);
  }

  // Si solo tenemos subtotal sin IVA (factura exenta), el total = subtotal
  if (!isValidAmount(total) && isValidAmount(subtotal) && !isValidAmount(iva)) {
    total = subtotal;
    logger.info(`💰 Using subtotal as total (possibly exempt): ${total}`);
  }

  logger.info(`💰 Final totals: subtotal=${subtotal}, iva=${iva}, total=${total}`);

  return {
    subtotal: isValidAmount(subtotal) ? subtotal : null,
    iva: isValidAmount(iva) ? iva : null,
    total: isValidAmount(total) ? total : null
  };
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
        descripcion: normalizeText(descripcion), // MAYÚSCULAS
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
// EXTRACTORS LEGACY (algunos reactivados para mejorar detección)
// ============================================================================

function detectTipoDocumento(lines: string[]): 'FACTURA' | 'REMITO' | 'NOTA_CREDITO' {
  const text = lines.join(' ').toUpperCase();

  // Cubrir todas las variantes: "NOTA DE CREDITO", "NOTAS DE CRÉDITO", "NOTA CREDITO", etc.
  if (/NOTAS?\s+(DE\s+)?CR[ÉE]DITO/.test(text)) {
    return 'NOTA_CREDITO';
  }

  // Si dice FACTURA explícitamente, es FACTURA (prioridad sobre REMITO)
  // Muchas facturas mencionan "Remito:" como referencia o "CONDICION DE VENTA: REMITO"
  if (/\bFACTURA\b/.test(text)) {
    return 'FACTURA';
  }

  // Solo clasificar como REMITO si aparece como título del documento,
  // no como referencia dentro de una factura (ej: "Remito: 00001-00011115")
  // Buscar REMITO que NO esté precedido por palabras como "Condición", "Nro", números
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    // Línea que es solo "REMITO" o empieza con "REMITO" como título
    if (/^\s*REMITO\s*$/.test(upper) || /^\s*REMITO\s+[A-Z]/.test(upper)) {
      return 'REMITO';
    }
  }

  return 'FACTURA'; // Default
}

function extractLetra(lines: string[]): 'A' | 'B' | 'C' | null {
  // Buscar "FACTURA A", "FACTURAS A", "Factura A", o letra sola cerca de "FACTURA"
  const text = lines.join('\n').toUpperCase();
  
  // Patrón 1: "FACTURA A", "FACTURAS A", "FACTURA: A", "FACTURA DE VENTA A"
  const match1 = text.match(/FACTURAS?\s*(?:DE\s+VENTA)?\s*:?\s*([ABC])\b/);
  if (match1 && match1[1]) {
    return match1[1] as 'A' | 'B' | 'C';
  }
  
  // Patrón 2: Buscar "COD." seguido de letra (común en facturas argentinas)
  const match2 = text.match(/COD\.\s*(\d+)\s*FACTURA\s+([ABC])/);
  if (match2 && match2[2]) {
    return match2[2] as 'A' | 'B' | 'C';
  }
  
  // Patrón 3: Línea que contiene solo "A", "B" o "C" cerca de FACTURA (buscar en más líneas)
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const line = (lines[i] || '').trim().toUpperCase();
    const prevLine = (lines[i - 1] || '').trim().toUpperCase();
    const nextLine = (lines[i + 1] || '').trim().toUpperCase();
    
    // Si la línea es solo una letra y hay "FACTURA" en las líneas adyacentes (no en todo el doc)
    if (/^[ABC]$/.test(line)) {
      if (prevLine.includes('FACTURA') || nextLine.includes('FACTURA') || prevLine.includes('COD')) {
        return line as 'A' | 'B' | 'C';
      }
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

  // Buscar "Punto de Venta: XXXX" + "Comp. Nro: XXXXXXXX" en líneas separadas
  const pv = extractPuntoVenta(lines);
  const num = extractNumero(lines);
  if (pv && num) {
    return `${pv}-${num.padStart(8, '0')}`;
  }

  return null;
}

function extractFechaEmision(lines: string[]): string | null {
  // Formato largo español: "Fecha: viernes 6 de febrero de 2026"
  for (const line of lines) {
    const matchLong = line.match(/(?:Fecha(?:\s+(?:de\s+)?Emisi[oó]n)?|Emisión|Emision)[:.\s]*(?:\w+\s+)?(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    if (matchLong && matchLong[1] && matchLong[2] && matchLong[3]) {
      const day = matchLong[1].padStart(2, '0');
      const mesStr = matchLong[2].toLowerCase();
      const year = matchLong[3];
      const month = MESES_ES[mesStr];
      if (month) {
        return `${year}-${month}-${day}`;
      }
    }
  }

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
  // Buscar "Vto: 20/01/2026", "Vencimiento: 20-01-2026", "Vence: 06/01/2026"
  const text = lines.join('\n');
  
  // Patrón 1: Vto, Venc, Vencimiento
  const patterns = [
    /(?:Vto\.?|Venc\.?|Vencimiento|Vence)[:.\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    /(?:Due\s+Date|Payment\s+Due)[:.\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    /(?:Fecha\s+de\s+)?Vencimiento[:.\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2] && match[3]) {
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

interface ExtractedCUITs {
  proveedorCUIT: string | null;
  receptorCUIT: string | null;
}

function extractProveedorCUIT(lines: string[]): string | null {
  return extractCUITs(lines).proveedorCUIT;
}

function extractCUITs(lines: string[]): ExtractedCUITs {
  // Buscar CUIT en formato: XX-XXXXXXXX-X o XXXXXXXXXXXX
  // Ejemplos: 30-53804819-0, 30-71215244-9, 30-71891765-0

  const allCUITs: { cuit: string; index: number; context: string; isInClientSection: boolean }[] = [];

  // Detectar dónde empieza la sección del cliente
  let clientSectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || '').toLowerCase();
    if (line.includes('datos del cliente') || line.includes('cliente:') ||
        (line.includes('cliente') && !line.includes('descuento cliente'))) {
      clientSectionStart = i;
      logger.info(`📍 Client section detected at line ${i}: "${lines[i]}"`);
      break;
    }
  }

  // ESTRATEGIA 1: Recolectar TODOS los CUITs encontrados (primeras 50 líneas)
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    const line = lines[i] || '';

    // Buscar patrón con guiones: XX-XXXXXXXX-X
    const matchWithDashes = line.match(/\b(\d{2})[-](\d{7,8})[-](\d)\b/);
    if (matchWithDashes) {
      const cuit = `${matchWithDashes[1]}${matchWithDashes[2].padStart(8, '0')}${matchWithDashes[3]}`;

      // Contexto: líneas cercanas
      const prevLine = (lines[i - 1] || '').toLowerCase();
      const nextLine = (lines[i + 1] || '').toLowerCase();
      const context = prevLine + ' ' + line.toLowerCase() + ' ' + nextLine;

      // Determinar si está en la sección del cliente
      const isInClientSection = clientSectionStart >= 0 && i >= clientSectionStart;

      logger.info(`🔍 Found CUIT ${cuit} at line ${i}, inClientSection: ${isInClientSection}`);
      allCUITs.push({ cuit, index: i, context, isInClientSection });
    }
  }

  // Si no hay CUITs
  if (allCUITs.length === 0) {
    return { proveedorCUIT: null, receptorCUIT: null };
  }

  // Si solo hay 1 CUIT, es el del proveedor (no podemos determinar receptor)
  if (allCUITs.length === 1) {
    return { proveedorCUIT: allCUITs[0].cuit, receptorCUIT: null };
  }

  // Si hay múltiples CUITs, separar proveedor y receptor
  let proveedorCUIT: string | null = null;
  let receptorCUIT: string | null = null;

  // 1. PRIMERO: Separar por sección del cliente
  const notInClientSection = allCUITs.filter(item => !item.isInClientSection);
  const inClientSection = allCUITs.filter(item => item.isInClientSection);

  if (notInClientSection.length >= 1 && notInClientSection[0]) {
    proveedorCUIT = notInClientSection[0].cuit;
    logger.info(`✅ Selected provider CUIT (outside client section): ${proveedorCUIT}`);
  }
  if (inClientSection.length >= 1 && inClientSection[0]) {
    receptorCUIT = inClientSection[0].cuit;
    logger.info(`✅ Selected receptor CUIT (in client section): ${receptorCUIT}`);
  }

  // 2. Si no detectamos sección del cliente, usar contexto de texto
  if (!proveedorCUIT) {
    const proveedorCUITs = allCUITs.filter(item =>
      !item.context.includes('cliente') &&
      !item.context.includes('comprador') &&
      !item.context.includes('destinatario') &&
      !item.context.includes('responsable inscripto')
    );
    const firstProveedorCUIT = proveedorCUITs[0];
    if (firstProveedorCUIT) {
      proveedorCUIT = firstProveedorCUIT.cuit;
      logger.info(`✅ Selected provider CUIT (by context filter): ${proveedorCUIT}`);
    }
  }

  if (!receptorCUIT) {
    const receptorCUITs = allCUITs.filter(item =>
      item.context.includes('cliente') ||
      item.context.includes('comprador') ||
      item.context.includes('destinatario')
    );
    const firstReceptorCUIT = receptorCUITs[0];
    if (firstReceptorCUIT) {
      receptorCUIT = firstReceptorCUIT.cuit;
      logger.info(`✅ Selected receptor CUIT (by context filter): ${receptorCUIT}`);
    }
  }

  // 3. Último recurso para proveedor: el más arriba (encabezado)
  if (!proveedorCUIT) {
    const sorted = [...allCUITs].sort((a, b) => a.index - b.index);
    const firstSorted = sorted[0];
    if (firstSorted) {
      proveedorCUIT = firstSorted.cuit;
      logger.info(`⚠️ Falling back to first CUIT by position: ${proveedorCUIT}`);
    }
  }

  // Si receptor no se detectó pero hay exactamente 2 CUITs, el otro es el receptor
  if (!receptorCUIT && allCUITs.length === 2 && proveedorCUIT) {
    const other = allCUITs.find(item => item.cuit !== proveedorCUIT);
    if (other) {
      receptorCUIT = other.cuit;
      logger.info(`✅ Inferred receptor CUIT (second of two): ${receptorCUIT}`);
    }
  }

  return { proveedorCUIT, receptorCUIT };
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
    // Limpiar espacios y caracteres no numéricos (excepto . y ,)
    str = str.trim();
    
    // Remover símbolos de moneda ($, USD, ARS, etc.) y espacios
    str = str.replace(/[$€£¥₹₽₩₪₴₦₨₱₡₵₸₮₪₴₦₨₱₡₵₸₮ARS|USD|EUR|GBP]/gi, '').trim();
    
    // Contar separadores
    const dotCount = (str.match(/\./g) || []).length;
    const commaCount = (str.match(/,/g) || []).length;
    
    let normalized: string;
    
    if (dotCount === 0 && commaCount === 0) {
      // Sin separadores: número entero
      normalized = str;
    } else if (dotCount > 1) {
      // Múltiples puntos: son separadores de miles (734.451.45)
      // Verificar si el último segmento tiene 2 dígitos (decimal)
      const segments = str.split('.');
      const lastSegment = segments[segments.length - 1] || '';
      
      if (lastSegment.length === 2 && segments.length > 1) {
        // Último segmento de 2 dígitos: es decimal (734.451.45)
        // Remover todos los puntos excepto el último
        const allButLast = segments.slice(0, -1).join('');
        normalized = allButLast + '.' + lastSegment;
      } else if (commaCount > 0) {
        // Si también hay coma, la coma es decimal
        normalized = str.replace(/\./g, '').replace(',', '.');
      } else {
        // Solo puntos sin patrón decimal claro: remover todos
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
