/**
 * Cloudflare R2 Client
 * 
 * Cliente S3-compatible para subir archivos a Cloudflare R2.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '../utils/fileUtils';

const logger = createLogger('R2');

// Configuración desde env vars
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  throw new Error(
    'Missing required R2 environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
  );
}

// Cliente S3 configurado para R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Sube un archivo a R2
 * 
 * @param key - La ruta/clave del objeto en R2
 * @param body - El contenido del archivo (Buffer o ReadableStream)
 * @param contentType - El tipo MIME del archivo
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = 'application/pdf'
): Promise<void> {
  try {
    const startTime = Date.now();
    const sizeKB = body.byteLength / 1024;

    logger.info(`☁️  Uploading to R2: ${key} (${sizeKB.toFixed(2)} KB)`);

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
      },
    });

    await r2Client.send(command);

    const duration = Date.now() - startTime;
    logger.info(`✅ Upload complete: ${key} (${duration}ms)`);
  } catch (error) {
    logger.error(`❌ R2 upload failed for ${key}:`, error);
    throw error;
  }
}

/**
 * Verifica si las credenciales de R2 están configuradas correctamente
 */
export function validateR2Config(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}
