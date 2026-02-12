import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

// Configurar cliente R2 para eliminar archivos
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

const r2Client = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null

// POST: Eliminar múltiples documentos
export async function POST(request: NextRequest) {
  try {
    // Requiere permisos de administrador para eliminar
    const { user, error: authError } = await requireAdmin()
    if (authError) return authError

    const clienteId = user?.clienteId

    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { documentoIds } = body

    if (!Array.isArray(documentoIds) || documentoIds.length === 0) {
      return NextResponse.json(
        { error: 'documentoIds debe ser un array no vacío' },
        { status: 400 }
      )
    }

    // Obtener los documentos con sus keys de PDF
    const documentos = await prisma.documentos.findMany({
      where: {
        id: { in: documentoIds },
        clienteId,
      },
      select: {
        id: true,
        pdfRawKey: true,
        pdfFinalKey: true,
        clientes: {
          select: { cuit: true },
        },
      },
    })

    if (documentos.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron documentos válidos' },
        { status: 404 }
      )
    }

    // Eliminar archivos de R2 si tenemos cliente configurado
    if (r2Client) {
      for (const doc of documentos) {
        if (doc.clientes?.cuit) {
          const bucket = `axp-client-${doc.clientes.cuit}`

          // Eliminar PDF procesado
          if (doc.pdfFinalKey) {
            try {
              await r2Client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: doc.pdfFinalKey,
              }))
            } catch (e) {
              console.warn(`Failed to delete pdfFinalKey from R2: ${doc.pdfFinalKey}`, e)
            }
          }

          // Eliminar PDF raw (si es diferente del final)
          if (doc.pdfRawKey && doc.pdfRawKey !== doc.pdfFinalKey) {
            try {
              await r2Client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: doc.pdfRawKey,
              }))
            } catch (e) {
              console.warn(`Failed to delete pdfRawKey from R2: ${doc.pdfRawKey}`, e)
            }
          }
        }
      }
    }

    // Eliminar items de los documentos primero (FK constraint)
    await prisma.documento_items.deleteMany({
      where: { documentoId: { in: documentoIds } },
    })

    // Eliminar los documentos
    const deleteResult = await prisma.documentos.deleteMany({
      where: {
        id: { in: documentoIds },
        clienteId,
      },
    })

    return NextResponse.json({
      message: `${deleteResult.count} documentos eliminados correctamente`,
      deletedCount: deleteResult.count,
    })
  } catch (error) {
    console.error('Error in bulk delete:', error)
    return NextResponse.json(
      { error: 'Failed to delete documents' },
      { status: 500 }
    )
  }
}
