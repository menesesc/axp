import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getAnthropicClient, parseAIResponse } from '@/lib/ai/anthropic-client'

const CONCILIACION_MODEL = 'claude-sonnet-4-6'

interface DocumentoPendiente {
  id: string
  tipo: string
  numeroCompleto: string | null
  fechaEmision: string | null
  total: number | null
  letra: string | null
}

interface ConciliacionResultItem {
  documentoId: string
  tipo: string
  numero: string | null
  fecha: string | null
  totalSistema: number | null
  totalResumen: number | null
  coincide: boolean
  diferencia: number | null
  nota: string | null
}

interface ConciliacionResult {
  coincidentes: ConciliacionResultItem[]
  soloEnSistema: ConciliacionResultItem[]
  soloEnResumen: { numero: string | null; fecha: string | null; total: number | null; nota: string | null }[]
  resumen: string
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin()
  if (error) return error
  if (!user?.clienteId) {
    return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const proveedorId = formData.get('proveedorId') as string
    const file = formData.get('file') as File | null

    if (!proveedorId) {
      return NextResponse.json({ error: 'proveedorId requerido' }, { status: 400 })
    }
    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    }

    // Verify provider belongs to client
    const proveedor = await prisma.proveedores.findFirst({
      where: { id: proveedorId, clienteId: user.clienteId },
      select: { id: true, razonSocial: true, cuit: true },
    })
    if (!proveedor) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    // Fetch pending documents for this provider (CONFIRMADO, not yet in a payment order)
    const documentosPendientes = await prisma.$queryRaw<DocumentoPendiente[]>`
      SELECT
        d.id,
        d.tipo,
        d."numeroCompleto",
        d."fechaEmision"::text,
        d.total::float,
        d.letra
      FROM documentos d
      WHERE d."clienteId" = ${user.clienteId}::uuid
        AND d."proveedorId" = ${proveedorId}::uuid
        AND d."estadoRevision" = 'CONFIRMADO'
        AND NOT EXISTS (
          SELECT 1 FROM pago_documentos pd WHERE pd."documentoId" = d.id
        )
      ORDER BY d."fechaEmision" DESC
    `

    // Read file content
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)
    const base64 = Buffer.from(fileBytes).toString('base64')
    const mimeType = file.type || 'application/pdf'

    // Build the document list for the prompt
    const docsTexto = documentosPendientes.length > 0
      ? documentosPendientes.map((d, i) =>
          `${i + 1}. ${d.tipo}${d.letra || ''} ${d.numeroCompleto || 'S/N'} | Fecha: ${d.fechaEmision || '-'} | Total: $${d.total?.toLocaleString('es-AR', { minimumFractionDigits: 2 }) || '-'} | ID: ${d.id}`
        ).join('\n')
      : '(No hay documentos pendientes en el sistema para este proveedor)'

    const systemPrompt = `Eres un asistente de conciliación contable para Argentina. Tu tarea es comparar el resumen de cuenta de un proveedor con los documentos pendientes de pago en el sistema.

Devuelve ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "coincidentes": [
    {
      "documentoId": "uuid del doc en el sistema",
      "tipo": "tipo de comprobante",
      "numero": "número del comprobante",
      "fecha": "YYYY-MM-DD o null",
      "totalSistema": número o null,
      "totalResumen": número o null,
      "coincide": true/false (true si los totales son iguales o diferencia < 0.01),
      "diferencia": número (totalResumen - totalSistema) o null,
      "nota": "observación si hay diferencia" o null
    }
  ],
  "soloEnSistema": [
    {
      "documentoId": "uuid",
      "tipo": "tipo",
      "numero": "número",
      "fecha": "fecha o null",
      "totalSistema": número o null,
      "totalResumen": null,
      "coincide": false,
      "diferencia": null,
      "nota": "No aparece en el resumen del proveedor"
    }
  ],
  "soloEnResumen": [
    {
      "numero": "número del comprobante",
      "fecha": "fecha o null",
      "total": número o null,
      "nota": "No encontrado en el sistema"
    }
  ],
  "resumen": "Texto breve en español describiendo el resultado de la conciliación (2-3 oraciones)"
}`

    const userPrompt = `Proveedor: ${proveedor.razonSocial} (CUIT: ${proveedor.cuit || 'no registrado'})

DOCUMENTOS PENDIENTES EN EL SISTEMA:
${docsTexto}

RESUMEN DE CUENTA DEL PROVEEDOR (archivo adjunto):
Analiza el archivo adjunto y compara cada comprobante listado contra los documentos del sistema.
Para cada comprobante del proveedor, busca el documento correspondiente en el sistema por número y tipo.
Si los importes difieren en más de $0.01, márcalo como coincide=false e indica la diferencia.`

    const anthropic = getAnthropicClient()

    // Use document support for PDFs, text content for other files
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentBlocks: any[] = []

    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

    if (mimeType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      })
    } else if (imageTypes.includes(mimeType)) {
      const imgMime = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: imgMime, data: base64 },
      })
    } else {
      // For text/csv files, decode as text
      const textContent = Buffer.from(fileBytes).toString('utf-8')
      contentBlocks.push({
        type: 'text',
        text: `Contenido del archivo:\n${textContent}`,
      })
    }

    contentBlocks.push({ type: 'text', text: userPrompt })

    const response = await anthropic.messages.create({
      model: CONCILIACION_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentBlocks }],
    })

    const rawText = response.content.find((b) => b.type === 'text')?.text || ''
    const result = parseAIResponse<ConciliacionResult>(rawText)

    return NextResponse.json({
      proveedor: { id: proveedor.id, razonSocial: proveedor.razonSocial },
      documentosPendientes: documentosPendientes.length,
      resultado: result,
    })
  } catch (err) {
    console.error('Error en conciliación:', err)
    return NextResponse.json({ error: 'Error al procesar la conciliación' }, { status: 500 })
  }
}
