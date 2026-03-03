import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { downloadFromR2 } from '@/lib/r2/client'
import { getAnthropicClient, AI_MODEL, calculateCost, parseAIResponse } from '@/lib/ai/anthropic-client'
import { buildReviewPrompt, type AIReviewResponse } from '@/lib/ai/review-prompt'

const FIELD_LABELS: Record<string, string> = {
  fechaEmision: 'Fecha Emisión',
  fechaVencimiento: 'Fecha Vencimiento',
  letra: 'Letra',
  numeroCompleto: 'Número',
  subtotal: 'Subtotal',
  iva: 'IVA',
  total: 'Total',
  proveedorId: 'Proveedor',
}

function formatFieldValue(field: string, value: any, proveedorNombre?: string | null): string | null {
  if (value === null || value === undefined) return null
  if (field === 'proveedorId' && proveedorNombre) return proveedorNombre
  if (typeof value === 'number') return value.toLocaleString('es-AR', { minimumFractionDigits: 2 })
  return String(value)
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
    }

    // Check ANTHROPIC_API_KEY is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Servicio de IA no configurado' }, { status: 503 })
    }

    const { id } = await params

    // Get document with relations
    const documento = await prisma.documentos.findUnique({
      where: { id },
      include: {
        clientes: { select: { id: true, cuit: true } },
        proveedores: { select: { id: true, razonSocial: true, cuit: true } },
      },
    })

    if (!documento) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
    }

    if (documento.clienteId !== clienteId) {
      return NextResponse.json({ error: 'No tienes acceso a este documento' }, { status: 403 })
    }

    if (documento.estadoRevision !== 'PENDIENTE') {
      return NextResponse.json({ error: 'Solo se pueden revisar documentos pendientes' }, { status: 400 })
    }

    // Rate limit: check if there's a recent AI review for this document (last 60s)
    const recentLog = await prisma.ai_usage_logs.findFirst({
      where: {
        documentoId: id,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    })
    if (recentLog) {
      return NextResponse.json(
        { error: 'Ya se realizó una revisión recientemente. Esperá un momento.' },
        { status: 429 }
      )
    }

    // Download PDF from R2
    const pdfKey = documento.pdfFinalKey || documento.pdfRawKey
    const bucket = `axp-client-${documento.clientes.cuit}`

    let pdfBuffer: Buffer
    try {
      pdfBuffer = await downloadFromR2(bucket, pdfKey)
    } catch {
      return NextResponse.json({ error: 'PDF del documento no disponible' }, { status: 404 })
    }

    // Get client's proveedores for matching
    const proveedores = await prisma.proveedores.findMany({
      where: { clienteId, activo: true },
      select: { id: true, razonSocial: true, cuit: true },
      orderBy: { razonSocial: 'asc' },
    })

    // Recalculate missingFields
    const missingFields: string[] = []
    if (!documento.proveedorId) missingFields.push('proveedor')
    if (!documento.fechaEmision) missingFields.push('fechaEmision')
    if (!documento.total) missingFields.push('total')
    if (!documento.letra) missingFields.push('letra')
    if (!documento.numeroCompleto) missingFields.push('numeroCompleto')
    if (!documento.subtotal) missingFields.push('subtotal')
    if (!documento.iva) missingFields.push('iva')

    // Build prompt
    const prompt = buildReviewPrompt(
      {
        tipo: documento.tipo,
        letra: documento.letra,
        numeroCompleto: documento.numeroCompleto,
        fechaEmision: documento.fechaEmision?.toISOString().split('T')[0] ?? null,
        fechaVencimiento: documento.fechaVencimiento?.toISOString().split('T')[0] ?? null,
        subtotal: documento.subtotal ? Number(documento.subtotal) : null,
        iva: documento.iva ? Number(documento.iva) : null,
        total: documento.total ? Number(documento.total) : null,
        moneda: documento.moneda,
        missingFields,
        proveedorActual: documento.proveedores,
      },
      proveedores,
    )

    // Call Claude API
    const client = getAnthropicClient()
    const startTime = Date.now()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    let message
    try {
      message = await client.messages.create(
        {
          model: AI_MODEL,
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: pdfBuffer.toString('base64'),
                  },
                },
                { type: 'text', text: prompt },
              ],
            },
          ],
        },
        { signal: controller.signal },
      )
    } catch (err: any) {
      clearTimeout(timeout)

      // Log the error
      await prisma.ai_usage_logs.create({
        data: {
          documentoId: id,
          clienteId,
          usuarioId: user!.id,
          modelo: AI_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          costoEstimado: 0,
          durationMs: Date.now() - startTime,
          errorMessage: err?.message || 'Error desconocido',
        },
      })

      if (err?.name === 'AbortError') {
        return NextResponse.json({ error: 'La revisión tardó demasiado. Intentá nuevamente.' }, { status: 504 })
      }
      if (err?.status === 429) {
        return NextResponse.json({ error: 'Demasiadas solicitudes a la IA. Intentá en unos segundos.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'Error al conectar con la IA' }, { status: 500 })
    }

    clearTimeout(timeout)
    const durationMs = Date.now() - startTime

    // Parse response
    const firstBlock = message.content[0]
    const responseText = firstBlock?.type === 'text' ? firstBlock.text : ''
    const { input_tokens: inputTokens, output_tokens: outputTokens } = message.usage

    let suggestions: AIReviewResponse
    try {
      suggestions = parseAIResponse<AIReviewResponse>(responseText)
    } catch {
      await prisma.ai_usage_logs.create({
        data: {
          documentoId: id,
          clienteId,
          usuarioId: user!.id,
          modelo: AI_MODEL,
          inputTokens,
          outputTokens,
          costoEstimado: calculateCost(inputTokens, outputTokens),
          durationMs,
          errorMessage: `JSON inválido: ${responseText.slice(0, 200)}`,
        },
      })
      return NextResponse.json({ error: 'La IA no devolvió una respuesta válida' }, { status: 500 })
    }

    // Resolve proveedor name for display
    let suggestedProveedorNombre: string | null = null
    if (suggestions.proveedorId) {
      const prov = proveedores.find(p => p.id === suggestions.proveedorId)
      suggestedProveedorNombre = prov?.razonSocial ?? suggestions.proveedorNombre
    } else if (suggestions.proveedorNombre) {
      suggestedProveedorNombre = suggestions.proveedorNombre
    }

    // Build current values for comparison
    const current = {
      fechaEmision: documento.fechaEmision?.toISOString().split('T')[0] ?? null,
      fechaVencimiento: documento.fechaVencimiento?.toISOString().split('T')[0] ?? null,
      letra: documento.letra,
      numeroCompleto: documento.numeroCompleto,
      subtotal: documento.subtotal ? Number(documento.subtotal) : null,
      iva: documento.iva ? Number(documento.iva) : null,
      total: documento.total ? Number(documento.total) : null,
      proveedorId: documento.proveedorId,
      proveedorNombre: documento.proveedores?.razonSocial ?? null,
    }

    // Calculate diff
    const comparableFields = ['fechaEmision', 'fechaVencimiento', 'letra', 'numeroCompleto', 'subtotal', 'iva', 'total', 'proveedorId'] as const

    const camposCorregidos: string[] = []
    const changes = comparableFields.map(field => {
      const before = current[field as keyof typeof current]
      const after = suggestions[field as keyof AIReviewResponse]
      const changed = after !== null && String(after) !== String(before ?? '')
      if (changed) camposCorregidos.push(field)

      return {
        field,
        label: FIELD_LABELS[field] || field,
        before: formatFieldValue(field, before, current.proveedorNombre),
        after: formatFieldValue(field, after, suggestedProveedorNombre),
        changed,
      }
    })

    // Save usage log
    const costoEstimado = calculateCost(inputTokens, outputTokens)
    const log = await prisma.ai_usage_logs.create({
      data: {
        documentoId: id,
        clienteId,
        usuarioId: user!.id,
        modelo: AI_MODEL,
        inputTokens,
        outputTokens,
        costoEstimado,
        camposCorregidos,
        camposSugeridos: suggestions as any,
        durationMs,
      },
    })

    return NextResponse.json({
      suggestions,
      current,
      changes,
      usage: {
        logId: log.id,
        inputTokens,
        outputTokens,
        costoEstimado: Number(costoEstimado),
        durationMs,
      },
    })
  } catch (error) {
    console.error('Error in AI review:', error)
    return NextResponse.json({ error: 'Error interno al revisar con IA' }, { status: 500 })
  }
}
