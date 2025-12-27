# AXP Monorepo

Monorepo para AXP usando Bun workspaces.

## Estructura

```
axp/
├── apps/
│   ├── web/          # Next.js App Router (UI)
│   ├── api/          # API Hono (endpoints internos)
│   └── worker/       # Worker 24/7 (procesamiento PDFs)
├── packages/
│   ├── shared/       # Types, utils, schemas Zod
│   └── database/     # Prisma + schemas
```

## Requisitos

- [Bun](https://bun.sh) >= 1.0
- Node.js >= 18 (para Next.js)
- PostgreSQL (Supabase)

## Setup inicial

1. Instalar dependencias:
```bash
bun install
```

2. Configurar variables de entorno:
```bash
# Copiar .env.example en cada app
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/database/.env.example packages/database/.env
```

3. Configurar Prisma:
```bash
# Editar packages/database/.env con tu DATABASE_URL de Supabase
# Luego generar el cliente
bun run db:generate
bun run db:push
```

## Scripts

### Desarrollo
```bash
bun dev              # Corre todos los servicios
bun dev:web          # Solo Next.js
bun dev:api          # Solo API
bun dev:worker       # Solo Worker
```

### Build
```bash
bun build            # Build de todo
bun build:web        # Build Next.js
bun build:api        # Build API
bun build:worker     # Build Worker
```

### Base de datos
```bash
bun run db:generate  # Generar cliente Prisma
bun run db:push      # Push schema a DB (dev)
bun run db:migrate   # Crear migración
bun run db:studio    # Abrir Prisma Studio
```

### Linting
```bash
bun lint             # Lint todo
bun type-check       # TypeScript check
```

## Producción

Cada app tiene su propio Dockerfile o puede ser deployada independientemente:
- **web**: Vercel, Netlify, o Docker
- **api**: Fly.io, Railway, o Docker
- **worker**: Background job en Railway, Render, o Docker

## Stack

- **Runtime**: Bun
- **Framework Web**: Next.js 14+ (App Router)
- **API**: Hono
- **Database**: PostgreSQL (Supabase) + Prisma
- **Validación**: Zod
- **TypeScript**: Strict mode
