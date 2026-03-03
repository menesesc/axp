export interface AIReviewResponse {
  fechaEmision: string | null
  fechaVencimiento: string | null
  letra: string | null
  numeroCompleto: string | null
  subtotal: number | null
  iva: number | null
  total: number | null
  proveedorId: string | null
  proveedorCuit: string | null
  proveedorNombre: string | null
  confianza: number
  notas: string
}

interface DocumentContext {
  tipo: string
  letra: string | null
  numeroCompleto: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  subtotal: number | null
  iva: number | null
  total: number | null
  moneda: string
  missingFields: string[]
  proveedorActual: {
    id: string
    razonSocial: string
    cuit: string | null
  } | null
}

interface ProveedorOption {
  id: string
  razonSocial: string
  cuit: string | null
}

export function buildReviewPrompt(
  doc: DocumentContext,
  proveedores: ProveedorOption[],
): string {
  const proveedorList = proveedores
    .map(p => `- ID: ${p.id} | ${p.razonSocial}${p.cuit ? ` | CUIT: ${p.cuit}` : ''}`)
    .join('\n')

  return `Eres un asistente especializado en facturas y documentos comerciales argentinos.

## TAREA
Analiza el PDF adjunto de un documento comercial y extrae/corrige los siguientes campos.

## DATOS ACTUALES DEL DOCUMENTO
- Tipo: ${doc.tipo}
- Letra: ${doc.letra || 'NO DETECTADA'}
- Numero: ${doc.numeroCompleto || 'NO DETECTADO'}
- Fecha Emisión: ${doc.fechaEmision || 'NO DETECTADA'}
- Fecha Vencimiento: ${doc.fechaVencimiento || 'NO DETECTADA'}
- Subtotal: ${doc.subtotal ?? 'NO DETECTADO'}
- IVA: ${doc.iva ?? 'NO DETECTADO'}
- Total: ${doc.total ?? 'NO DETECTADO'}
- Moneda: ${doc.moneda}
- Proveedor actual: ${doc.proveedorActual ? `${doc.proveedorActual.razonSocial} (CUIT: ${doc.proveedorActual.cuit || 'sin CUIT'})` : 'NO ASIGNADO'}

## CAMPOS FALTANTES QUE NECESITAMOS
${doc.missingFields.length > 0 ? doc.missingFields.join(', ') : 'Ninguno especifico, pero verifica todos los campos'}

## PROVEEDORES REGISTRADOS DEL CLIENTE
Si el proveedor no esta asignado o parece incorrecto, intenta identificarlo por nombre o CUIT en el PDF y matchearlo con esta lista:
${proveedorList || '(Sin proveedores registrados)'}

## REGLAS IMPORTANTES
1. Las fechas deben estar en formato YYYY-MM-DD
2. El numeroCompleto debe contener SOLO digitos (sin guiones ni espacios), tipicamente 13 digitos (4 punto de venta + 8 numero)
3. La letra debe ser "A", "B" o "C"
4. Los montos deben ser numeros decimales (ej: 15234.56)
5. Para proveedorId, SOLO usa un ID de la lista de proveedores proporcionada. Si no encuentras match, devuelve null para proveedorId pero incluye proveedorCuit y proveedorNombre si los detectas en el PDF
6. El CUIT del proveedor tiene 11 digitos (formato XX-XXXXXXXX-X en el PDF, pero devuelvelo como 11 digitos sin guiones)
7. Si un campo ya tiene un valor correcto, repitelo tal cual
8. Si no puedes determinar un campo con confianza, devuelve null
9. No inventes datos - si no esta visible en el PDF, devuelve null

## FORMATO DE RESPUESTA
Responde UNICAMENTE con un JSON valido (sin markdown, sin backticks), con esta estructura exacta:
{
  "fechaEmision": "YYYY-MM-DD" | null,
  "fechaVencimiento": "YYYY-MM-DD" | null,
  "letra": "A" | "B" | "C" | null,
  "numeroCompleto": "string de solo digitos" | null,
  "subtotal": number | null,
  "iva": number | null,
  "total": number | null,
  "proveedorId": "uuid de la lista" | null,
  "proveedorCuit": "11 digitos" | null,
  "proveedorNombre": "nombre en el PDF" | null,
  "confianza": number (0-100),
  "notas": "explicacion breve de los cambios realizados"
}`
}
