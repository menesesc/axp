import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from '@/lib/prisma'

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

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    if (!user?.clienteId) {
      return NextResponse.json({ error: 'Sin empresa asignada' }, { status: 403 })
    }

    // Get cliente CUIT for bucket name
    const cliente = await prisma.clientes.findUnique({
      where: { id: user.clienteId },
      select: { cuit: true },
    })

    if (!cliente?.cuit) {
      return NextResponse.json({ error: 'Cliente sin CUIT' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const pagoId = formData.get('pagoId') as string | null
    const metodoId = formData.get('metodoId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo se permiten archivos PDF' }, { status: 400 })
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo excede 10MB' }, { status: 400 })
    }

    if (!r2Client) {
      return NextResponse.json({ error: 'Almacenamiento no configurado' }, { status: 500 })
    }

    const bucket = `axp-client-${cliente.cuit}`
    const timestamp = Date.now()
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const key = `comprobantes/${pagoId || 'temp'}/${timestamp}-${sanitizedFilename}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    await r2Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    }))

    // If metodoId is provided and exists in the database, update the pago_metodo with the attachment
    // For new orders being created, the metodo won't exist yet - that's fine, the attachment will be
    // associated when the order is created
    if (metodoId) {
      try {
        const metodo = await prisma.pago_metodos.findUnique({
          where: { id: metodoId },
          select: { meta: true },
        })

        // Only update if the method exists in the database
        if (metodo) {
          const currentMeta = (metodo.meta as Record<string, unknown>) || {}
          const currentAttachments = (currentMeta.attachments || []) as { key: string; filename: string }[]
          currentAttachments.push({ key, filename: file.name })

          await prisma.pago_metodos.update({
            where: { id: metodoId },
            data: {
              meta: { ...currentMeta, attachments: currentAttachments },
            },
          })
        }
        // If metodo doesn't exist, just return the key - the frontend will handle it
      } catch {
        // Ignore database errors - the upload succeeded, that's what matters
      }
    }

    return NextResponse.json({
      success: true,
      key,
      filename: file.name,
    })
  } catch (error) {
    console.error('Error uploading payment attachment:', error)
    return NextResponse.json(
      { error: 'Error al subir archivo' },
      { status: 500 }
    )
  }
}
