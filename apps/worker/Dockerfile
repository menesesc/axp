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

# Working directory para el worker
WORKDIR /app/apps/worker

# El comando se define en docker-compose.yml
CMD ["bun", "run", "src/index.ts"]
