# Setup Guide - AXP Monorepo

## Estructura creada

```
axp/
├── apps/
│   ├── web/              # Next.js 14 (App Router)
│   ├── api/              # Hono API Server
│   └── worker/           # Background Worker (PDFs)
├── packages/
│   ├── shared/           # Types, utils, schemas
│   └── database/         # Prisma + Cliente DB
├── package.json          # Root workspace config
├── tsconfig.json         # TypeScript config base
└── .eslintrc.json        # ESLint config
```

## Paso 1: Instalar dependencias

```bash
bun install
```

Esto instalará todas las dependencias de todos los workspaces.

## Paso 2: Configurar variables de entorno

### Web (apps/web)
```bash
cp apps/web/.env.example apps/web/.env
```

Editar `apps/web/.env`:
```env
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_SUPABASE_URL="https://PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"
```

### API (apps/api)
```bash
cp apps/api/.env.example apps/api/.env
```

Editar `apps/api/.env`:
```env
PORT=3001
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
SUPABASE_URL="https://PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key"
```

### Worker (apps/worker)
```bash
cp apps/worker/.env.example apps/worker/.env
```

Editar `apps/worker/.env`:
```env
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
SUPABASE_URL="https://PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key"
```

### Database (packages/database)
```bash
cp packages/database/.env.example packages/database/.env
```

Editar `packages/database/.env`:
```env
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
```

## Paso 3: Configurar Prisma

### 3.1 Definir modelos

Editar `packages/database/prisma/schema.prisma` y agregar tus modelos.

Ejemplo:
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  jobs      PdfJob[]
}

model PdfJob {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  status    JobStatus @default(PENDING)
  fileUrl   String
  fileName  String
  fileSize  Int
  result    Json?
  error     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([userId])
  @@index([status])
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

### 3.2 Generar cliente Prisma

```bash
bun run db:generate
```

### 3.3 Push schema a Supabase

```bash
bun run db:push
```

O crear migración:
```bash
bun run db:migrate
```

## Paso 4: Desarrollo

### Iniciar todo
```bash
bun dev
```

### Iniciar servicios individuales

Terminal 1 (Web):
```bash
bun dev:web
# http://localhost:3000
```

Terminal 2 (API):
```bash
bun dev:api
# http://localhost:3001
```

Terminal 3 (Worker):
```bash
bun dev:worker
```

## Paso 5: Verificar

### Web
Abrir http://localhost:3000

### API
```bash
curl http://localhost:3001/health
```

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "service": "api"
}
```

### Worker
Deberías ver logs en la consola:
```
🔄 Worker iniciado
⏰ Polling cada 5000ms (max 3 concurrentes)
```

## Paso 6: Build para producción

```bash
bun build
```

O builds individuales:
```bash
bun build:web
bun build:api
bun build:worker
```

## Comandos útiles

### Base de datos
```bash
bun run db:studio        # Abrir Prisma Studio
bun run db:generate      # Generar cliente
bun run db:push          # Push schema (dev)
bun run db:migrate       # Crear migración
```

### Linting
```bash
bun lint                 # Lint todo
bun type-check           # TypeScript check
```

### Limpiar
```bash
bun run clean            # Eliminar node_modules y builds
```

## Obtener credenciales de Supabase

1. Ir a https://supabase.com/dashboard
2. Seleccionar tu proyecto
3. **Settings > Database**
   - Connection String: copiar la URI (Session mode para dev)
4. **Settings > API**
   - Project URL: `SUPABASE_URL`
   - anon/public key: `SUPABASE_ANON_KEY`
   - service_role key: `SUPABASE_SERVICE_ROLE_KEY` (¡nunca exponer en frontend!)

## Notas importantes

- **TypeScript estricto**: El proyecto usa TypeScript en modo estricto
- **Workspaces**: Los paquetes `shared` y `database` se importan con sus nombres
- **Hot reload**: Todos los servicios tienen hot reload en desarrollo
- **Prisma Client**: Se genera automáticamente después de cambios en el schema
- **Variables de entorno**: Cada app tiene su propio `.env`

## Troubleshooting

### Error: Cannot find module 'shared' or 'database'
```bash
bun install
```

### Error: Prisma Client not generated
```bash
bun run db:generate
```

### Error: Port already in use
Cambiar puerto en el `.env` correspondiente

### Tipos de TypeScript no se actualizan
```bash
bun run type-check
# O reiniciar el TypeScript server en VS Code
```
