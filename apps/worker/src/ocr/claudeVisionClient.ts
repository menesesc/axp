/**
 * Cliente de Claude Vision para extracción OCR de facturas argentinas.
 *
 * Reemplaza textractClient.ts (~1400 líneas) con una integración
 * directa con Claude Vision que entiende nativamente documentos argentinos.
 *
 * Convierte el PDF a imagen JPEG optimizada (max 1500px) para reducir tokens.
 */

import { getAnthropicClient, parseAIResponse, type TokenUsage } from './anthropicClient'
import { buildOCRSystemPrompt, buildOCRUserMessage, type ProveedorForMatching } from './ocrPrompt'
import type { CorrectionExample } from './correctionExamples'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

// ---------- Types ----------

export interface DocumentItem {
  linea: number
  descripcion: string
  codigo: string | null
  cantidad: number | null
  unidad: string | null
  precioUnitario: number | null
  subtotal: number | null
}

export interface ClaudeVisionResult {
  tipo: 'FACTURA' | 'NOTA_CREDITO' | 'REMITO'
  letra: string | null
  puntoVenta: string | null
  numero: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  moneda: string
  subtotal: number | null
  iva: number | null
  ivaDesglose: Array<{ alicuota: number; base: number; importe: number }> | null
  total: number | null
  proveedor: string | null
  proveedorCUIT: string | null
  receptorCUIT: string | null
  receptorNombre: string | null
  items: DocumentItem[]
  proveedorIdSugerido: string | null
  proveedorNuevoSugerido: { razonSocial: string; cuit: string } | null
  confidenceScore: number
  missingFields: string[]
  notas: string
  usage: TokenUsage
}

interface RawAIResponse {
  tipo: string
  letra: string | null
  puntoVenta: string | null
  numero: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  moneda: string
  subtotal: number | null
  iva: number | null
  ivaDesglose: Array<{ alicuota: number; base: number; importe: number }> | null
  total: number | null
  proveedorCUIT: string | null
  proveedorNombre: string | null
  receptorCUIT: string | null
  receptorNombre: string | null
  items: Array<{
    descripcion: string
    codigo: string | null
    cantidad: number | null
    unidad: string | null
    precioUnitario: number | null
    subtotal: number | null
  }>
  proveedorIdSugerido: string | null
  proveedorNuevoSugerido: { razonSocial: string; cuit: string } | null
  confianza: number
  notas: string
}

// ---------- PDF/Image helpers ----------

const MAX_DIMENSION = 1500 // px — suficiente para facturas, ~1600 tokens
const JPEG_QUALITY = 80

interface PreparedImage {
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  originalSizeKB: number
  finalSizeKB: number
}

const SIZE_THRESHOLD_KB = 200 // Solo optimizar archivos > 200KB (fotos celular, PDFs pesados)

/**
 * Prepara un archivo (PDF o imagen) para enviar a Claude.
 * - PDFs chicos del escáner (< 200KB): enviar como PDF directo (primera página)
 * - PDFs grandes o imágenes pesadas (> 200KB): convertir a JPEG 1500px
 * - Imágenes (JPG/PNG): siempre redimensionar si > 200KB
 */
async function prepareForVision(fileBuffer: Buffer, filename: string): Promise<PreparedImage> {
  const originalSizeKB = Math.round(fileBuffer.length / 1024)
  const ext = filename.toLowerCase().split('.').pop() || ''
  const isPdf = ext === 'pdf'

  // PDFs chicos del escáner: enviar como PDF directo (extraer primera página)
  if (isPdf && originalSizeKB <= SIZE_THRESHOLD_KB) {
    const firstPage = await extractFirstPagePdf(fileBuffer)
    const finalSizeKB = Math.round(firstPage.length / 1024)
    console.log(`[Claude Vision] Small PDF: ${originalSizeKB}KB → ${finalSizeKB}KB (first page only, sent as PDF)`)
    return {
      base64: firstPage.toString('base64'),
      mediaType: 'application/pdf',
      originalSizeKB,
      finalSizeKB,
    }
  }

  // Archivos grandes: convertir a JPEG optimizado
  try {
    let imageBuffer: Buffer

    if (isPdf) {
      imageBuffer = await pdfToImage(fileBuffer)
    } else {
      imageBuffer = fileBuffer
    }

    // Redimensionar y comprimir con sharp
    const resized = await sharp(imageBuffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()

    const finalSizeKB = Math.round(resized.length / 1024)
    console.log(`[Claude Vision] Optimized: ${originalSizeKB}KB → ${finalSizeKB}KB (${MAX_DIMENSION}px max, JPEG Q${JPEG_QUALITY})`)

    return {
      base64: resized.toString('base64'),
      mediaType: 'image/jpeg',
      originalSizeKB,
      finalSizeKB,
    }
  } catch (error) {
    // Fallback: enviar original
    console.warn(`[Claude Vision] Image optimization failed, sending original:`, error)
    const fallback = isPdf ? await extractFirstPagePdf(fileBuffer) : fileBuffer
    return {
      base64: fallback.toString('base64'),
      mediaType: isPdf ? 'application/pdf' : 'image/jpeg',
      originalSizeKB,
      finalSizeKB: Math.round(fallback.length / 1024),
    }
  }
}

/**
 * Extrae solo la primera página del PDF (sin convertir a imagen).
 */
async function extractFirstPagePdf(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer)
    if (srcDoc.getPageCount() <= 1) return pdfBuffer
    const newDoc = await PDFDocument.create()
    const [page] = await newDoc.copyPages(srcDoc, [0])
    newDoc.addPage(page)
    return Buffer.from(await newDoc.save())
  } catch {
    return pdfBuffer
  }
}

/**
 * Convierte la primera página de un PDF a imagen PNG.
 * Usa pdftoppm (poppler-utils) que es más confiable que sharp/libvips para PDFs.
 */
async function pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  const { writeFileSync, unlinkSync, readFileSync, existsSync } = await import('fs')
  const tmpPdf = `/tmp/ocr_${Date.now()}.pdf`
  const tmpOut = `/tmp/ocr_${Date.now()}`

  try {
    // Extraer solo primera página con pdf-lib
    const srcDoc = await PDFDocument.load(pdfBuffer)
    if (srcDoc.getPageCount() > 1) {
      const newDoc = await PDFDocument.create()
      const [page] = await newDoc.copyPages(srcDoc, [0])
      newDoc.addPage(page)
      const bytes = await newDoc.save()
      writeFileSync(tmpPdf, Buffer.from(bytes))
    } else {
      writeFileSync(tmpPdf, pdfBuffer)
    }

    // Convertir con pdftoppm (poppler-utils) a PNG, 200 DPI
    const proc = Bun.spawnSync(['pdftoppm', '-png', '-r', '200', '-singlefile', tmpPdf, tmpOut])
    const pngPath = `${tmpOut}.png`

    if (proc.exitCode !== 0 || !existsSync(pngPath)) {
      throw new Error(`pdftoppm failed: ${proc.stderr?.toString() || 'unknown error'}`)
    }

    const pngBuffer = readFileSync(pngPath)

    // Limpiar archivos temporales
    try { unlinkSync(tmpPdf) } catch {}
    try { unlinkSync(pngPath) } catch {}

    return pngBuffer
  } catch (error) {
    // Limpiar en caso de error
    try { unlinkSync(tmpPdf) } catch {}
    try { unlinkSync(`${tmpOut}.png`) } catch {}
    throw error
  }
}

// ---------- Validation ----------

function validateCUIT(cuit: string | null): string | null {
  if (!cuit) return null
  const digits = cuit.replace(/\D/g, '')
  if (digits.length !== 11) return null
  const validPrefixes = ['20', '23', '24', '27', '30', '33', '34']
  if (!validPrefixes.some(p => digits.startsWith(p))) return null
  return digits
}

function validateNumeroCompleto(numero: string | null): string | null {
  if (!numero) return null
  const digits = numero.replace(/\D/g, '')
  // Rechazar si parece un CUIT (11 dígitos con prefijo de CUIT)
  if (digits.length === 11) {
    const cuitPrefixes = ['20', '23', '24', '27', '30', '33', '34']
    if (cuitPrefixes.some(p => digits.startsWith(p))) return null
  }
  // Rechazar si parece un CAE (14 dígitos continuos)
  if (digits.length === 14) return null
  // Aceptar 12-13 dígitos como válido
  if (digits.length < 8 || digits.length > 13) return null
  return digits
}

function validateDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  // Debe ser formato YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const date = new Date(dateStr + 'T12:00:00-03:00')
  if (isNaN(date.getTime())) return null
  // No permitir fechas anteriores a 2020
  if (date.getFullYear() < 2020) return null
  // No permitir fechas futuras (con margen de 2 días)
  const futureLimit = new Date()
  futureLimit.setDate(futureLimit.getDate() + 2)
  if (date > futureLimit) return null
  return dateStr
}

function validateAmount(amount: number | null): number | null {
  if (amount === null || amount === undefined) return null
  if (typeof amount !== 'number' || isNaN(amount)) return null
  // Precisión máxima: Decimal(14,2) = 999,999,999,999.99
  if (Math.abs(amount) > 999_999_999_999) return null
  return Math.round(amount * 100) / 100
}

function validateTipo(tipo: string): 'FACTURA' | 'NOTA_CREDITO' | 'REMITO' {
  const normalized = tipo?.toUpperCase?.() || ''
  if (normalized === 'NOTA_CREDITO') return 'NOTA_CREDITO'
  if (normalized === 'REMITO') return 'REMITO'
  return 'FACTURA'
}

function validateLetra(letra: string | null): string | null {
  if (!letra) return null
  const upper = letra.toUpperCase()
  if (['A', 'B', 'C'].includes(upper)) return upper
  return null
}

// ---------- Main function ----------

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 3000

export async function processWithClaudeVision(
  pdfBuffer: Buffer,
  proveedores: ProveedorForMatching[],
  corrections: CorrectionExample[],
  clienteId: string,
  filename: string = 'document.pdf',
  model: string = 'claude-haiku-4-5-20251001',
): Promise<ClaudeVisionResult> {
  const client = getAnthropicClient()

  // Preparar imagen optimizada (PDF → JPEG 1500px, o imagen → resize)
  const prepared = await prepareForVision(pdfBuffer, filename)

  // Construir mensajes
  const systemPrompt = buildOCRSystemPrompt(corrections)
  const userText = buildOCRUserMessage(proveedores)

  // Construir content block según el tipo de resultado
  const imageContent: any = prepared.mediaType === 'application/pdf'
    ? {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: prepared.base64 },
      }
    : {
        type: 'image',
        source: { type: 'base64', media_type: prepared.mediaType, data: prepared.base64 },
      }

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userText,
                cache_control: { type: 'ephemeral' },
              } as any,
              imageContent,
            ],
          },
        ],
      })

      // Extraer texto de la respuesta
      const firstBlock = response.content[0]
      const responseText = firstBlock?.type === 'text' ? firstBlock.text : ''

      // Extraer usage (incluyendo cache tokens)
      const rawUsage = response.usage as any
      const usage: TokenUsage = {
        inputTokens: rawUsage?.input_tokens || 0,
        outputTokens: rawUsage?.output_tokens || 0,
        cacheReadTokens: rawUsage?.cache_read_input_tokens || 0,
        cacheWriteTokens: rawUsage?.cache_creation_input_tokens || 0,
      }

      // Log detallado de cache para diagnóstico
      console.log(`[Claude Vision] Usage: input=${usage.inputTokens} output=${usage.outputTokens} cache_read=${usage.cacheReadTokens} cache_write=${usage.cacheWriteTokens}`)

      // Parsear JSON
      const raw = parseAIResponse<RawAIResponse>(responseText)

      // Validar y normalizar resultado
      return validateAndNormalize(raw, proveedores, usage)

    } catch (error: any) {
      lastError = error

      // Reintentar solo en errores transitorios
      const isRetryable = error?.status === 429 || error?.status === 529 || error?.name === 'AbortError'
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
        console.log(`[Claude Vision] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      throw error
    }
  }

  throw lastError || new Error('Claude Vision processing failed')
}

// ---------- Validation & Normalization ----------

function validateAndNormalize(
  raw: RawAIResponse,
  proveedores: ProveedorForMatching[],
  usage: TokenUsage,
): ClaudeVisionResult {
  let tipo = validateTipo(raw.tipo)

  // Validar importes
  let subtotal = validateAmount(raw.subtotal)
  let iva = validateAmount(raw.iva)
  let total = validateAmount(raw.total)

  // Auto-corregir: un REMITO no tiene importes monetarios. Si tiene IVA o total, es una factura.
  if (tipo === 'REMITO' && (iva !== null || (total !== null && total > 0))) {
    console.warn(`[Claude Vision] REMITO con IVA/total detectado → corrigiendo a FACTURA`)
    tipo = 'FACTURA'
  }

  const isNotaCredito = tipo === 'NOTA_CREDITO'

  // Para nota de crédito, asegurar que los importes sean negativos
  if (isNotaCredito) {
    if (subtotal !== null && subtotal > 0) subtotal = -subtotal
    if (iva !== null && iva > 0) iva = -iva
    if (total !== null && total > 0) total = -total
  }

  // Validar proveedorIdSugerido: debe existir en la lista de proveedores
  let proveedorIdSugerido = raw.proveedorIdSugerido
  if (proveedorIdSugerido) {
    const exists = proveedores.some(p => p.id === proveedorIdSugerido)
    if (!exists) {
      console.warn(`[Claude Vision] proveedorIdSugerido "${proveedorIdSugerido}" no existe en la lista, descartando`)
      proveedorIdSugerido = null
    }
  }

  // Validar CUIT de proveedor sugerido
  const proveedorNuevoSugerido = raw.proveedorNuevoSugerido
  if (proveedorNuevoSugerido?.cuit) {
    proveedorNuevoSugerido.cuit = validateCUIT(proveedorNuevoSugerido.cuit) || proveedorNuevoSugerido.cuit
  }

  // Validar numeroCompleto
  const numeroCompleto = validateNumeroCompleto(raw.numeroCompleto)

  // Extraer puntoVenta y numero del numeroCompleto si Claude no los devolvió separados
  let puntoVenta = raw.puntoVenta?.replace(/\D/g, '') || null
  let numero = raw.numero?.replace(/\D/g, '') || null
  if (numeroCompleto && (!puntoVenta || !numero)) {
    if (numeroCompleto.length >= 12) {
      puntoVenta = puntoVenta || numeroCompleto.slice(0, 5)
      numero = numero || numeroCompleto.slice(5)
    } else if (numeroCompleto.length >= 8) {
      puntoVenta = puntoVenta || numeroCompleto.slice(0, 4)
      numero = numero || numeroCompleto.slice(4)
    }
  }

  // Construir items con líneas numeradas
  const items: DocumentItem[] = (raw.items || []).map((item, index) => {
    let itemSubtotal = validateAmount(item.subtotal)
    if (isNotaCredito && itemSubtotal !== null && itemSubtotal > 0) {
      itemSubtotal = -itemSubtotal
    }

    return {
      linea: index + 1,
      descripcion: (item.descripcion || '').toUpperCase().trim(),
      codigo: item.codigo?.trim() || null,
      cantidad: item.cantidad != null ? Number(item.cantidad) : null,
      unidad: item.unidad?.toUpperCase().trim() || null,
      precioUnitario: validateAmount(item.precioUnitario),
      subtotal: itemSubtotal,
    }
  }).filter(item => item.descripcion.length > 0)

  // Calcular campos faltantes
  const missingFields: string[] = []
  if (!raw.proveedorCUIT && !raw.proveedorNombre) missingFields.push('proveedor')
  if (!validateDate(raw.fechaEmision)) missingFields.push('fechaEmision')
  if (total === null) missingFields.push('total')
  if (!validateLetra(raw.letra)) missingFields.push('letra')
  if (!numeroCompleto) missingFields.push('numeroCompleto')
  if (subtotal === null) missingFields.push('subtotal')
  if (iva === null) missingFields.push('iva')

  return {
    tipo,
    letra: validateLetra(raw.letra),
    puntoVenta,
    numero,
    numeroCompleto,
    fechaEmision: validateDate(raw.fechaEmision),
    fechaVencimiento: validateDate(raw.fechaVencimiento),
    moneda: raw.moneda || 'ARS',
    subtotal,
    iva,
    ivaDesglose: raw.ivaDesglose || null,
    total,
    proveedor: raw.proveedorNombre?.toUpperCase().trim() || null,
    proveedorCUIT: validateCUIT(raw.proveedorCUIT),
    receptorCUIT: validateCUIT(raw.receptorCUIT),
    receptorNombre: raw.receptorNombre?.toUpperCase().trim() || null,
    items,
    proveedorIdSugerido,
    proveedorNuevoSugerido: proveedorIdSugerido ? null : proveedorNuevoSugerido || null,
    confidenceScore: Math.min(100, Math.max(0, Math.round(raw.confianza || 0))),
    missingFields,
    notas: raw.notas || '',
    usage,
  }
}
