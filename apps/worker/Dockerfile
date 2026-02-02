# Dockerfile para Worker AXP (Monorepo)
# Build desde el ROOT del monorepo: docker build -f apps/worker/Dockerfile .

FROM oven/bun:latest

WORKDIR /app

# Copiar archivos de configuración del monorepo
COPY package.json bun.lockb* ./

# Copiar workspaces necesarios
COPY packages ./packages
COPY apps/worker ./apps/worker

# Instalar dependencias (resuelve workspaces)
RUN bun install --frozen-lockfile || bun install

# Generar Prisma Client en el paquete database
RUN cd packages/database && bunx prisma generate

# Generar Prisma Client también para el worker (usando el schema de database)
WORKDIR /app/apps/worker
RUN bunx prisma generate --schema=../../packages/database/prisma/schema.prisma

# El comando se define en docker-compose.yml
CMD ["bun", "run", "src/index.ts"]
