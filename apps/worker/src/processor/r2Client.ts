/**
 * Cloudflare R2 Client
 * 
 * Cliente S3-compatible para subir archivos a Cloudflare R2.
 * Soporta multi-bucket (un bucket por cliente).
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '../utils/fileUtils';

const logger = createLogger('R2');

// Configuración desde env vars
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// R2_BUCKET_NAME ahora es opcional (se usa solo como fallback)
const R2_BUCKET_NAME_FALLBACK = process.env.R2_BUCKET_NAME;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error(
    'Missing required R2 environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY'
  );
}

// Cliente S3 configurado para R2 (reutilizable para todos los buckets)
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
 * @param bucket - Nombre del bucket de destino
 * @param key - La ruta/clave del objeto en R2
 * @param body - El contenido del archivo (Buffer o ReadableStream)
 * @param contentType - El tipo MIME del archivo
 */
export async function uploadToR2(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType: string = 'application/pdf'
): Promise<void> {
  try {
    const startTime = Date.now();
    const sizeKB = body.byteLength / 1024;

    logger.info(`☁️  Uploading to R2: ${bucket}/${key} (${sizeKB.toFixed(2)} KB)`);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
      },
    });

    await r2Client.send(command);

    const duration = Date.now() - startTime;
    logger.info(`✅ Upload complete: ${bucket}/${key} (${duration}ms)`);
  } catch (error) {
    logger.error(`❌ R2 upload failed for ${bucket}/${key}:`, error);
    throw error;
  }
}

/**
 * Verifica si las credenciales de R2 están configuradas correctamente
 */
export function validateR2Config(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

/**
 * Obtiene el bucket fallback (para compatibilidad con configuración anterior)
 */
export function getFallbackBucket(): string | undefined {
  return R2_BUCKET_NAME_FALLBACK;
}

/**
 * Lista objetos en un bucket con un prefijo específico
 */
export async function listR2Objects(
  bucket: string,
  prefix: string = ''
): Promise<Array<{ Key?: string; Size?: number; LastModified?: Date }>> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const response = await r2Client.send(command);
    return response.Contents || [];
  } catch (error) {
    logger.error(`❌ R2 list failed for ${bucket}/${prefix}:`, error);
    throw error;
  }
}

/**
 * Descarga un archivo de R2
 */
export async function downloadFromR2(bucket: string, key: string): Promise<Buffer> {
  try {
    logger.info(`📥 Downloading from R2: ${bucket}/${key}`);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await r2Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body');
    }

    // Convertir stream a buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    logger.info(`✅ Downloaded: ${bucket}/${key} (${(buffer.length / 1024).toFixed(2)} KB)`);

    return buffer;
  } catch (error) {
    logger.error(`❌ R2 download failed for ${bucket}/${key}:`, error);
    throw error;
  }
}

/**
 * Mueve un objeto en R2 (copy + delete)
 */
export async function moveR2Object(bucket: string, sourceKey: string, destKey: string): Promise<void> {
  try {
    logger.info(`📦 Moving in R2: ${sourceKey} → ${destKey}`);

    // 1. Copiar
    const copyCommand = new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destKey,
    });

    await r2Client.send(copyCommand);

    // 2. Borrar original
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucket,
      Key: sourceKey,
    });

    await r2Client.send(deleteCommand);

    logger.info(`✅ Moved: ${sourceKey} → ${destKey}`);
  } catch (error) {
    logger.error(`❌ R2 move failed: ${sourceKey} → ${destKey}:`, error);
    throw error;
  }
}

/**
 * Borra un objeto de R2
 */
export async function deleteR2Object(bucket: string, key: string): Promise<void> {
  try {
    logger.info(`🗑️  Deleting from R2: ${bucket}/${key}`);

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await r2Client.send(command);

    logger.info(`✅ Deleted: ${bucket}/${key}`);
  } catch (error) {
    logger.error(`❌ R2 delete failed for ${bucket}/${key}:`, error);
    throw error;
  }
}

