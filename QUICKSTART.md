# 🚀 Quick Start - AXP Monorepo

## Inicio Rápido (5 minutos)

### 1. Instalar dependencias
```bash
bun install
```

### 2. Ejecutar setup automático
```bash
./setup.sh
```

Este script:
- ✅ Verifica Bun instalado
- ✅ Instala dependencias
- ✅ Crea archivos .env desde ejemplos

### 3. Configurar Supabase

Editar `packages/database/.env`:
```env
DATABASE_URL="postgresql://postgres:TU-PASSWORD@db.TU-PROJECT.supabase.co:5432/postgres"
```

> 💡 Obtener desde: **Supabase Dashboard > Settings > Database > Connection String**

### 4. Definir modelos (opcional para testing)

Editar `packages/database/prisma/schema.prisma` y descomentar los modelos ejemplo.

### 5. Generar Prisma Client
```bash
bun run db:generate
bun run db:push
```

### 6. Iniciar desarrollo
```bash
bun dev
```

## ✅ Verificar

- **Web**: http://localhost:3000 - Deberías ver "AXP"
- **API**: http://localhost:3001/health - Deberías ver `{"status":"ok"}`
- **Worker**: Ver logs en consola `🔄 Worker iniciado`

## 🎯 ¿Qué acabas de crear?

- ✅ Monorepo con 3 apps + 2 packages
- ✅ Next.js 14 con App Router y Tailwind
- ✅ API Hono ultra-rápida
- ✅ Worker 24/7 para PDFs
- ✅ Prisma + Supabase configurado
- ✅ TypeScript estricto en todo
- ✅ Código compartido entre apps
- ✅ Hot reload en development
- ✅ Listo para producción

## 📚 Documentación Completa

- **ARCHITECTURE.md** - Estructura y stack detallado
- **SETUP.md** - Guía paso a paso completa
- **README.md** - Overview general
- **packages/database/README.md** - Docs de Prisma

## 🆘 Problemas Comunes

### Bun no instalado
```bash
curl -fsSL https://bun.sh/install | bash
```

### Port 3000 en uso
Cambiar en `apps/web/.env`:
```env
PORT=3002
```

### Port 3001 en uso
Cambiar en `apps/api/.env`:
```env
PORT=3002
```

### Error de Prisma Client
```bash
bun run db:generate
```

## 🚢 Deploy Rápido

### Vercel (Web)
```bash
cd apps/web
vercel
```

### Fly.io (API)
```bash
cd apps/api
fly launch
```

### Railway (Worker)
```bash
cd apps/worker
railway up
```

## 🎉 ¡Listo para desarrollar!

Revisa `ARCHITECTURE.md` para entender la estructura completa.
