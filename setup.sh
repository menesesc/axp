#!/bin/bash

# Script de setup rápido para AXP Monorepo
# Ejecutar: chmod +x setup.sh && ./setup.sh

set -e

echo "🚀 Setup AXP Monorepo"
echo ""

# Verificar Bun instalado
if ! command -v bun &> /dev/null; then
    echo "❌ Bun no está instalado"
    echo "Instalar desde: https://bun.sh"
    exit 1
fi

echo "✅ Bun encontrado: $(bun --version)"
echo ""

# Instalar dependencias
echo "📦 Instalando dependencias..."
bun install
echo ""

# Crear archivos .env
echo "📝 Creando archivos .env desde ejemplos..."

if [ ! -f apps/web/.env ]; then
    cp apps/web/.env.example apps/web/.env
    echo "✅ Creado apps/web/.env"
fi

if [ ! -f apps/api/.env ]; then
    cp apps/api/.env.example apps/api/.env
    echo "✅ Creado apps/api/.env"
fi

if [ ! -f apps/worker/.env ]; then
    cp apps/worker/.env.example apps/worker/.env
    echo "✅ Creado apps/worker/.env"
fi

if [ ! -f packages/database/.env ]; then
    cp packages/database/.env.example packages/database/.env
    echo "✅ Creado packages/database/.env"
fi

echo ""
echo "⚠️  IMPORTANTE: Editar los archivos .env con tus credenciales de Supabase"
echo ""
echo "📋 Próximos pasos:"
echo "1. Editar packages/database/.env con tu DATABASE_URL de Supabase"
echo "2. Definir modelos en packages/database/prisma/schema.prisma"
echo "3. Ejecutar: bun run db:generate"
echo "4. Ejecutar: bun run db:push"
echo "5. Ejecutar: bun dev"
echo ""
echo "✨ Setup completado!"
