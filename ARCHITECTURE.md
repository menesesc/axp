# AXP Monorepo - Resumen de Arquitectura

## ✅ Estructura Completada

```
axp/
├── 📁 apps/
│   ├── web/                    # Next.js 14 App Router
│   │   ├── src/app/            # App Router pages
│   │   ├── package.json        # Next.js dependencies
│   │   ├── tsconfig.json       # TS config
│   │   ├── next.config.js      # Next config
│   │   ├── tailwind.config.js  # Tailwind config
│   │   └── .env.example        # Variables de entorno
│   │
│   ├── api/                    # Hono API Server
│   │   ├── src/
│   │   │   ├── index.ts        # Entry point
│   │   │   └── routes/         # API routes
│   │   ├── package.json        # Hono dependencies
│   │   ├── tsconfig.json       # TS config
│   │   └── .env.example        # Variables de entorno
│   │
│   └── worker/                 # Background Worker (24/7)
│       ├── src/
│       │   └── index.ts        # Worker loop + PDF processing
│       ├── package.json        # Worker dependencies
│       ├── tsconfig.json       # TS config
│       └── .env.example        # Variables de entorno
│
├── 📦 packages/
│   ├── shared/                 # Código compartido
│   │   ├── src/
│   │   │   ├── types/          # TypeScript types
│   │   │   ├── utils/          # Utilidades
│   │   │   ├── schemas/        # Zod schemas
│   │   │   ├── constants/      # Constantes
│   │   │   └── index.ts        # Exports
│   │   ├── package.json        # Zod + deps
│   │   └── tsconfig.json       # TS config
│   │
│   └── database/               # Prisma ORM
│       ├── prisma/
│       │   └── schema.prisma   # DB schema (vacío, listo para modelos)
│       ├── src/
│       │   └── index.ts        # Prisma client export
│       ├── package.json        # Prisma dependencies
│       ├── tsconfig.json       # TS config
│       ├── .env.example        # DATABASE_URL
│       └── README.md           # Docs de DB
│
├── 🔧 Config files (root)
│   ├── package.json            # Bun workspaces + scripts
│   ├── tsconfig.json           # TS config base (strict)
│   ├── .eslintrc.json          # ESLint config
│   ├── .prettierrc.json        # Prettier config
│   ├── .gitignore              # Git ignore
│   └── README.md               # Documentación principal
│
├── 📖 Docs
│   └── SETUP.md                # Guía de setup paso a paso
│
├── 🛠️ VS Code
│   ├── .vscode/settings.json   # Workspace settings
│   └── .vscode/extensions.json # Extensiones recomendadas
│
└── 🚀 Scripts
    └── setup.sh                # Script de setup automático
```

## 🎯 Stack Tecnológico

### Runtime & Build
- **Bun**: Runtime principal, package manager, bundler
- **Node.js**: Usado por Next.js

### Frontend (apps/web)
- **Next.js 14**: App Router, React Server Components
- **React 18**: UI library
- **Tailwind CSS**: Estilos utility-first
- **TypeScript**: Tipado estricto

### Backend (apps/api)
- **Hono**: Framework web ultrarrápido
- **Bun**: Runtime nativo
- **TypeScript**: Tipado estricto

### Worker (apps/worker)
- **Bun**: Runtime para background jobs
- **Polling pattern**: Revisa DB cada 5s (configurable)
- **TypeScript**: Tipado estricto

### Database
- **Supabase**: PostgreSQL managed
- **Prisma**: ORM + Type-safe queries
- **TypeScript**: Generated types from schema

### Shared
- **Zod**: Runtime validation
- **TypeScript**: Shared types
- **Workspaces**: Imports como `shared` y `database`

## 📊 Diagrama de Arquitectura

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       v
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  apps/web   │─────>│  apps/api   │─────>│  Supabase   │
│  (Next.js)  │      │   (Hono)    │      │ (Postgres)  │
└─────────────┘      └─────────────┘      └──────┬──────┘
                                                  ^
       ┌──────────────────────────────────────────┘
       │
┌──────┴──────┐
│ apps/worker │
│  (Bun 24/7) │
└─────────────┘

       Shared Packages:
       ┌──────────────┬──────────────┐
       │packages/     │packages/     │
       │  shared      │  database    │
       │(types,utils) │  (Prisma)    │
       └──────────────┴──────────────┘
```

## 🔑 Características Principales

### ✅ Monorepo con Bun Workspaces
- 3 apps independientes
- 2 packages compartidos
- Un solo `bun install`
- Hot reload en todas las apps

### ✅ TypeScript Estricto
- Configuración strict mode
- No implicit any
- Exact optional properties
- Type-safe en todo el proyecto

### ✅ Prisma + Supabase
- Schema como single source of truth
- Migraciones automáticas
- Type-safe queries
- Connection pooling ready

### ✅ API con Hono
- Ultra rápido (más rápido que Express)
- Type-safe routing
- Middleware integrado (CORS, Logger)
- Compatible con Bun/Node/Edge

### ✅ Worker 24/7
- Polling configurable
- Concurrencia limitada
- Graceful shutdown
- Error handling robusto

### ✅ Código Compartido
- Types compartidos
- Utilidades comunes
- Schemas Zod reutilizables
- Constantes centralizadas

## 🚀 Scripts Disponibles

```bash
# Desarrollo
bun dev              # Corre todo
bun dev:web          # Solo Next.js
bun dev:api          # Solo API
bun dev:worker       # Solo Worker

# Build
bun build            # Build todo
bun build:web        # Build Next.js
bun build:api        # Build API
bun build:worker     # Build Worker

# Database
bun run db:generate  # Generar Prisma Client
bun run db:push      # Push schema (dev)
bun run db:migrate   # Crear migración
bun run db:studio    # Prisma Studio UI

# Quality
bun lint             # ESLint
bun type-check       # TypeScript check

# Maintenance
bun run clean        # Limpiar node_modules y builds
```

## 📝 Próximos Pasos

### 1. Instalar dependencias
```bash
bun install
```

### 2. Configurar .env
Copiar todos los `.env.example` a `.env` y rellenar con credenciales de Supabase.

### 3. Definir schema de Prisma
Editar `packages/database/prisma/schema.prisma` con tus modelos.

### 4. Generar Prisma Client
```bash
bun run db:generate
bun run db:push
```

### 5. Iniciar desarrollo
```bash
bun dev
```

## 🌐 URLs de Desarrollo

- **Web**: http://localhost:3000
- **API**: http://localhost:3001
- **API Health**: http://localhost:3001/health
- **Prisma Studio**: http://localhost:5555

## 📦 Deployment

### apps/web (Next.js)
- **Vercel** (recomendado)
- **Netlify**
- **Docker** (self-hosted)

### apps/api (Hono)
- **Fly.io** (recomendado para Bun)
- **Railway**
- **Docker** (self-hosted)

### apps/worker
- **Railway** (background worker)
- **Render** (background worker)
- **Docker** (self-hosted)

## 📚 Recursos

- [Bun Docs](https://bun.sh/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [Hono Docs](https://hono.dev)
- [Prisma Docs](https://www.prisma.io/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Zod Docs](https://zod.dev)

## 🎉 ¡Listo!

Tu monorepo AXP está configurado y listo para desarrollo. Todos los archivos usan placeholders para credenciales - nunca se incluyen secretos reales.

**Siguiente paso**: Ejecutar `./setup.sh` o seguir `SETUP.md` paso a paso.
