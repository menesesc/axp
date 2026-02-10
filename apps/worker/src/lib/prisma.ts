import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Crear Prisma Client con configuración optimizada para workers
 *
 * Importante: Los workers deben usar el Transaction Pooler de Supabase
 * para evitar agotar las conexiones del Session Pooler.
 *
 * Configurar en .env:
 * - DATABASE_URL: usar el Transaction Pooler (puerto 6543 en Supabase)
 * - O agregar ?connection_limit=2&pool_timeout=10 a la URL
 */
function createPrismaClient(): PrismaClient {
  // Obtener la URL de la base de datos
  let databaseUrl = process.env.DATABASE_URL || '';

  // IMPORTANTE: Para Supabase con PgBouncer (Transaction Pooler)
  // Necesitamos agregar pgbouncer=true para deshabilitar prepared statements
  // Error típico sin esto: "prepared statement already exists"
  if (databaseUrl && !databaseUrl.includes('pgbouncer=')) {
    const separator = databaseUrl.includes('?') ? '&' : '?';
    databaseUrl = `${databaseUrl}${separator}pgbouncer=true`;
  }

  // Limitar conexiones del worker
  if (databaseUrl && !databaseUrl.includes('connection_limit')) {
    databaseUrl = `${databaseUrl}&connection_limit=2&pool_timeout=10`;
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

export type { PrismaClient };
