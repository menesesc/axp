import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadToR2 } from '@/lib/r2/client'
import { PDFDocument } from 'pdf-lib'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
]

/**
 * Upload documents manually (drag & drop).
 * Accepts PDF and images. Images are converted to PDF.
 * Files are placed in inbox/ for OCR processing.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAdmin()
    if (error) return error
    if (!user?.clienteId) {
      return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
    }

    const cliente = await prisma.clientes.findUnique({
      where: { id: user.clienteId },
      select: { cuit: true },
    })

    if (!cliente?.cuit) {
      return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: 'No se enviaron archivos' }, { status: 400 })
    }

    const bucket = `axp-client-${cliente.cuit}`
    let uploaded = 0
    const errors: string[] = []

    for (const file of files) {
      try {
        // Validate type
        if (!ALLOWED_TYPES.includes(file.type)) {
          errors.push(`${file.name}: tipo no soportado (${file.type})`)
          continue
        }

        // Validate size
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: excede 10MB`)
          continue
        }

        const arrayBuffer = await file.arrayBuffer()
        let pdfBuffer: Buffer

        if (file.type === 'application/pdf') {
          pdfBuffer = Buffer.from(arrayBuffer)
        } else {
          // Convert image to PDF
          const pdfDoc = await PDFDocument.create()
          const imageBytes = new Uint8Array(arrayBuffer)

          let image
          if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes)
          } else {
            image = await pdfDoc.embedJpg(imageBytes)
          }

          const page = pdfDoc.addPage([image.width, image.height])
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          })

          const pdfBytes = await pdfDoc.save()
          pdfBuffer = Buffer.from(pdfBytes)
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const safeName = file.name
          .replace(/\.[^.]+$/, '.pdf') // Replace extension with .pdf
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .substring(0, 100)
        const key = `inbox/${timestamp}_${safeName}`

        await uploadToR2(bucket, key, pdfBuffer, {
          source: 'MANUAL',
        })

        uploaded++
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err)
        errors.push(`${file.name}: error al procesar`)
      }
    }

    return NextResponse.json({
      success: uploaded > 0,
      uploaded,
      total: files.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('Error uploading documents:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
