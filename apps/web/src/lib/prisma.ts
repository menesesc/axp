// Crear el cliente de Prisma con configuración optimizada
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Crear Prisma Client con límite de conexiones
 *
 * Importante para Supabase: usar el Transaction Pooler (puerto 6543)
 * para evitar agotar las conexiones del Session Pooler.
 */
function createPrismaClient(): PrismaClient {
  let databaseUrl = process.env.DATABASE_URL || '';

  // Agregar connection_limit si no está presente
  if (databaseUrl && !databaseUrl.includes('connection_limit')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    // Web app puede usar más conexiones que los workers
    databaseUrl = `${databaseUrl}${separator}connection_limit=5&pool_timeout=10`;
  }

  const options: ConstructorParameters<typeof PrismaClient>[0] = {
    log: process.env.NODE_ENV === 'development'
      ? ['error', 'warn']
      : ['error'],
  };

  if (databaseUrl) {
    options.datasources = {
      db: {
        url: databaseUrl,
      },
    };
  }

  return new PrismaClient(options);
}

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export * from '@prisma/client';
