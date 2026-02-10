import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error('Missing R2 configuration');
}

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// GET: Generar URL firmada para un PDF
export async function GET(request: NextRequest) {
  try {
    // Verificar autenticación
    const { user, error: authError } = await getAuthUser();
    if (authError) return authError;

    const clienteId = user?.clienteId;
    if (!clienteId) {
      return NextResponse.json(
        { error: 'No tienes una empresa asignada' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'key parameter is required' },
        { status: 400 }
      );
    }

    // Obtener el CUIT del cliente para determinar el bucket
    const cliente = await prisma.clientes.findUnique({
      where: { id: clienteId },
      select: { cuit: true },
    });

    if (!cliente?.cuit) {
      return NextResponse.json(
        { error: 'Cliente sin CUIT configurado' },
        { status: 400 }
      );
    }

    // El bucket sigue el patrón: axp-client-{CUIT}
    const bucket = `axp-client-${cliente.cuit}`;

    // Verificar que el archivo existe antes de generar la URL
    try {
      await r2Client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
    } catch (headError: any) {
      if (headError.name === 'NotFound' || headError.$metadata?.httpStatusCode === 404) {
        return NextResponse.json(
          { error: 'PDF no encontrado', notFound: true },
          { status: 404 }
        );
      }
      throw headError;
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: 3600, // 1 hora
    });

    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate signed URL' },
      { status: 500 }
    );
  }
}
