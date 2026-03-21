/**
 * Prompt de extracción OCR para facturas argentinas usando Claude Vision.
 *
 * Arquitectura del prompt:
 * - System message: reglas, campos, validaciones, correcciones previas (cacheable)
 * - User message: PDF + lista de proveedores (por documento)
 */

import type { CorrectionExample } from './correctionExamples'

export interface ProveedorForMatching {
  id: string
  razonSocial: string
  cuit: string | null
  letra: string | null
  alias: unknown // Json field from Prisma
}

/**
 * Construye el system prompt (cacheable entre documentos del mismo cliente).
 * Incluye reglas de extracción y correcciones previas para learning.
 */
export function buildOCRSystemPrompt(corrections: CorrectionExample[]): string {
  const correctionsSection = corrections.length > 0
    ? `\n## CORRECCIONES PREVIAS (aprende de estos errores)\n${corrections.map(c => `- ${c.text}`).join('\n')}\n`
    : ''

  return `Eres un extractor especializado de facturas y documentos comerciales argentinos.
Tu tarea es analizar el PDF adjunto y extraer TODOS los campos con máxima precisión.

## CAMPOS A EXTRAER

### Encabezado del documento
- tipo: "FACTURA" | "NOTA_CREDITO" | "REMITO"
  - NOTA DE CREDITO / NOTAS DE CRÉDITO → "NOTA_CREDITO"
  - REMITO (como título, no como referencia) → "REMITO"
  - FACTURA o por defecto → "FACTURA"
- letra: "A" | "B" | "C" | null
  - Es la letra grande que aparece en el centro superior del comprobante argentino
  - A: Responsable Inscripto a Responsable Inscripto (IVA discriminado)
  - B: Responsable Inscripto a Consumidor Final/Monotributo (IVA incluido en precio)
  - C: Monotributo a cualquier receptor
- puntoVenta: string de 4-5 dígitos (ej: "00001", "0004")
- numero: string de 8 dígitos (ej: "00013515")
- numeroCompleto: concatenación de puntoVenta + numero, SOLO dígitos, típicamente 13 dígitos (ej: "0000100013515")
  IMPORTANTE: NO confundir con el CAE (14 dígitos continuos) ni con un CUIT (11 dígitos)

### Fechas
- fechaEmision: formato YYYY-MM-DD (fecha de emisión del comprobante)
- fechaVencimiento: formato YYYY-MM-DD (fecha de vencimiento de pago, puede ser igual a emisión)

### Importes
- moneda: "ARS" | "USD" | "EUR" (default "ARS")
- subtotal: Importe Neto Gravado (decimal, ej: 15234.56). NO incluye IVA.
- iva: Suma de TODAS las alícuotas de IVA (decimal)
- ivaDesglose: array de objetos con cada alícuota:
  [{ "alicuota": 21, "base": 10000.00, "importe": 2100.00 }, { "alicuota": 10.5, "base": 5000.00, "importe": 525.00 }]
  Alícuotas posibles en Argentina: 27%, 21% (general), 10.5%, 5%, 2.5%, 0% (exento)
- total: Importe Total final (decimal). Debe ser aproximadamente subtotal + iva (puede haber otros impuestos menores)
- Para NOTA_CREDITO: todos los importes deben ser NEGATIVOS

### Identificación fiscal
- proveedorCUIT: CUIT del EMISOR (quien emite la factura), 11 dígitos sin guiones
  El CUIT en el documento aparece como XX-XXXXXXXX-X. Extraer solo los 11 dígitos.
  Prefijos válidos: 20, 23, 24, 27 (personas), 30, 33, 34 (empresas)
- proveedorNombre: Razón social del emisor tal como aparece en el documento
- receptorCUIT: CUIT del RECEPTOR (quien recibe la factura), 11 dígitos sin guiones
  Generalmente aparece en la sección "Datos del cliente/comprador/destinatario"
- receptorNombre: Razón social del RECEPTOR tal como aparece en el documento

### Items / Líneas de productos
- items: array de objetos, uno por cada línea de producto/servicio:
  - descripcion: texto del producto/servicio (tal como aparece)
  - codigo: código de producto si es visible (puede ser null)
  - cantidad: número decimal (ej: 10, 2.5, 0.5)
  - unidad: unidad de medida si es visible. Buscar abreviaturas: KG, UN, UNI, LT, LTS, M, M2, M3, HS, PAR, BULTO, CAJA, CJ, ROLLO, PACK, DOC, etc. Puede ser null si no aparece.
  - precioUnitario: precio por unidad (decimal)
  - subtotal: importe total de la línea = cantidad × precioUnitario (decimal)

## REGLAS CRÍTICAS

1. El CUIT tiene formato XX-XXXXXXXX-X en el documento. Extraer SOLO los 11 dígitos sin guiones.
2. El EMISOR (proveedor) es quien EMITE la factura. Su CUIT y razón social suelen estar en la parte superior.
   El RECEPTOR (comprador) es quien la RECIBE. Su CUIT suele estar en la sección de datos del cliente.
3. Para NOTA DE CREDITO: todos los importes (subtotal, iva, total, items subtotal) deben ser NEGATIVOS.
4. El numeroCompleto debe contener SOLO dígitos, sin guiones ni espacios.
   Típicamente son 13 dígitos: 5 del punto de venta + 8 del número.
   NUNCA debe ser un CAE (14 dígitos continuos) ni un CUIT (11 dígitos con prefijo 20/23/24/27/30/33/34).
5. Las fechas no pueden ser futuras. Si una fecha parece futura, es probable que esté mal leída.
6. La validación subtotal + iva ≈ total debe cumplirse (tolerancia del 5% por otros impuestos/percepciones).
7. Si no puedes determinar un campo con confianza, devuelve null. NO inventes datos.
8. El campo "confianza" es tu autoevaluación de 0-100 sobre la calidad de la extracción.
${correctionsSection}
## FORMATO DE RESPUESTA

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks, sin texto adicional):
{
  "tipo": "FACTURA" | "NOTA_CREDITO" | "REMITO",
  "letra": "A" | "B" | "C" | null,
  "puntoVenta": "string de dígitos" | null,
  "numero": "string de dígitos" | null,
  "numeroCompleto": "string de solo dígitos (13 típico)" | null,
  "fechaEmision": "YYYY-MM-DD" | null,
  "fechaVencimiento": "YYYY-MM-DD" | null,
  "moneda": "ARS" | "USD" | "EUR",
  "subtotal": number | null,
  "iva": number | null,
  "ivaDesglose": [{"alicuota": number, "base": number, "importe": number}] | null,
  "total": number | null,
  "proveedorCUIT": "11 dígitos sin guiones" | null,
  "proveedorNombre": "razón social del emisor" | null,
  "receptorCUIT": "11 dígitos sin guiones" | null,
  "receptorNombre": "razón social del receptor" | null,
  "items": [{"descripcion": "string", "codigo": "string|null", "cantidad": number|null, "unidad": "string|null", "precioUnitario": number|null, "subtotal": number|null}],
  "proveedorIdSugerido": "UUID de la lista o null",
  "proveedorNuevoSugerido": {"razonSocial": "string", "cuit": "string"} | null,
  "confianza": number,
  "notas": "explicación breve de decisiones tomadas"
}`
}

/**
 * Construye el user message con la lista de proveedores.
 * El PDF se agrega como content block separado en claudeVisionClient.ts.
 */
export function buildOCRUserMessage(proveedores: ProveedorForMatching[]): string {
  const proveedorList = proveedores.length > 0
    ? proveedores.map(p => {
        const aliasArray = Array.isArray(p.alias) ? (p.alias as string[]) : []
        const aliasStr = aliasArray.length > 0 ? ` | Alias: ${aliasArray.join(', ')}` : ''
        return `- ID: ${p.id} | ${p.razonSocial}${p.cuit ? ` | CUIT: ${p.cuit}` : ''}${aliasStr}`
      }).join('\n')
    : '(Sin proveedores registrados)'

  return `Extrae todos los campos del documento comercial argentino adjunto.

## PROVEEDORES REGISTRADOS DEL CLIENTE
${proveedorList}

## INSTRUCCIONES DE MATCHING DE PROVEEDOR
- Si el CUIT o nombre del EMISOR del documento coincide con alguno de la lista, devuelve su ID en "proveedorIdSugerido".
- Si NO coincide con ninguno, devuelve null en "proveedorIdSugerido" y completa "proveedorNuevoSugerido" con la razón social y CUIT del emisor tal como aparecen en el documento.
- Para el matching por nombre, considera variaciones: "S.A." vs "SA", "S.R.L." vs "SRL", abreviaturas, etc.
- NUNCA devuelvas un proveedorIdSugerido que no esté en la lista de arriba.`
}
