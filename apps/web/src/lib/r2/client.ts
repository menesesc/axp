import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

export const r2Client = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null

export async function downloadFromR2(bucket: string, key: string): Promise<Buffer> {
  if (!r2Client) throw new Error('R2 client not configured')

  const response = await r2Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!response.Body) throw new Error(`Empty response for ${key}`)

  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}

export async function uploadToR2(
  bucket: string,
  key: string,
  body: Buffer,
  metadata?: Record<string, string>,
): Promise<void> {
  if (!r2Client) throw new Error('R2 client not configured')

  await r2Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'application/pdf',
    Metadata: metadata,
  }))
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  if (!r2Client) return false
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

export { GetObjectCommand, PutObjectCommand }
