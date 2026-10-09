import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSeccion } from '@/lib/auth'
import { SECCION } from '@/lib/permisos'
import { getAnthropicClient, AI_MODEL, AI_OPCIONES, textoRespuesta, parseAIResponse } from '@/lib/ai/anthropic-client'
import { downloadFromR2 } from '@/lib/r2/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Vuelve a leer las líneas de un comprobante desde su PDF.
 *
 * Para las líneas donde la aritmética alcanza (cantidad múltiplo de mil) no
 * hace falta: el subtotal ya dice cuál es la respuesta. Esto es para las
 * otras, donde no se puede saber si el precio está mal leído o la línea tiene
 * un descuento sin mirar el papel.
 *
 * No escribe nada: devuelve lo que leyó para que se compare contra lo
 * guardado y se confirme línea por línea.
 */

const PROMPT = `Sos un asistente que lee facturas argentinas. Te paso un comprobante y necesito SOLO el detalle de sus líneas.

FORMATO NUMÉRICO ARGENTINO — esto es lo que más importa:
- El PUNTO separa miles y la COMA separa decimales. "1.234.567,89" es 1234567.89.
- Las CANTIDADES suelen venir con tres decimales: "120,000" son 120 unidades, NO ciento veinte mil. "1,500" es 1,5. "15,820" es 15,82.
- Si la columna de cantidad trae un número con coma seguida de exactamente tres cifras, casi siempre son decimales.
- Devolvé los números en formato anglosajón, sin separador de miles: 1234567.89

CONTROL OBLIGATORIO: para cada línea, cantidad × precioUnitario tiene que dar el importe de la línea. Si no da, volvé a mirar los tres números antes de responder. Si la línea tiene un descuento y por eso no cierra, poné el descuento en "observacion".

Respondé SOLO con este JSON, sin texto alrededor:
{"lineas":[{"linea":1,"descripcion":"string","cantidad":number,"unidad":"string|null","precioUnitario":number,"subtotal":number,"observacion":"string|null"}]}`

export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireSeccion(SECCION.DOC_ITEMS, 'edit')
  if (error) return error

  const { documentoId } = (await request.json()) as { documentoId?: string }
  if (!documentoId) return NextResponse.json({ error: 'Falta documentoId' }, { status: 400 })

  const [doc] = await prisma.$queryRaw<Array<{ pdf_key: string | null; cuit: string; numero: string | null }>>`
    SELECT COALESCE(d."pdfFinalKey", d."pdfRawKey") AS pdf_key, c.cuit, d."numeroCompleto" AS numero
      FROM documentos d
      JOIN clientes c ON c.id = d."clienteId"
     WHERE d.id = ${documentoId}::uuid AND d."clienteId" = ${clienteId}::uuid
  `
  if (!doc) return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
  if (!doc.pdf_key) return NextResponse.json({ error: 'El comprobante no tiene PDF guardado' }, { status: 400 })

  let pdf: Buffer
  try {
    pdf = await downloadFromR2(`axp-client-${doc.cuit}`, doc.pdf_key)
  } catch (e) {
    console.error('[revision-lineas/ia] no se pudo bajar el PDF', e)
    return NextResponse.json({ error: 'No se pudo leer el PDF del comprobante' }, { status: 502 })
  }

  // El PDF va tal cual: Claude lo lee nativamente y así no hace falta
  // convertirlo a imagen como en el worker.
  try {
    const cliente = getAnthropicClient()
    const respuesta = await cliente.messages.create({
      model: AI_MODEL,
      max_tokens: 8000,
      ...AI_OPCIONES,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })

    const texto = textoRespuesta(respuesta.content as Array<{ type: string; text?: string }>)
    const leido = parseAIResponse<{ lineas?: Array<Record<string, unknown>> }>(texto)

    return NextResponse.json({
      lineas: leido?.lineas ?? [],
      uso: {
        entrada: respuesta.usage?.input_tokens ?? 0,
        salida: respuesta.usage?.output_tokens ?? 0,
      },
    })
  } catch (e) {
    console.error('[revision-lineas/ia] falló la lectura', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo releer el comprobante' },
      { status: 502 }
    )
  }
}
