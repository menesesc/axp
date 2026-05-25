import { NextRequest, NextResponse } from 'next/server'
import { requireClienteId } from '@/lib/auth'
import { ingestMaxirestPdf } from '@/lib/sales/maxirest-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST multipart/form-data con un archivo "file" (PDF Maxirest).
 * Procesa el cierre forzando el clienteId del usuario (no requiere CUIT match).
 */
export async function POST(request: NextRequest) {
  const { clienteId, error } = await requireClienteId()
  if (error) return error

  const form = await request.formData()
  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Falta archivo "file"' }, { status: 400 })
  }
  if (file.type && !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'El archivo debe ser un PDF' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const result = await ingestMaxirestPdf(buffer, {
    source: 'MANUAL',
    filename: file.name,
    forceClienteId: clienteId!,
  })

  const httpStatus = result.status === 'OK' ? 200 : 400
  return NextResponse.json(result, { status: httpStatus })
}
