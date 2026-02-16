# Dockerfile para Next.js Web App (Monorepo)
# Build desde el ROOT del monorepo: docker build -f apps/web/Dockerfile .

FROM node:20-alpine AS base

# ------- Dependencies -------
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiar archivos de configuración del monorepo
COPY package.json bun.lockb* ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

# Instalar bun para resolver workspaces
RUN npm install -g bun && bun install --frozen-lockfile || bun install

# ------- Builder -------
FROM base AS builder
RUN npm install -g bun
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules 2>/dev/null || true
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules 2>/dev/null || true

# Copiar código fuente
COPY packages ./packages
COPY apps/web ./apps/web
COPY package.json tsconfig.json ./

# Generar Prisma Client
RUN cd packages/database && bunx prisma generate
RUN cd apps/web && bunx prisma generate

# Build de Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN cd apps/web && bun run build

# ------- Runner -------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos estáticos
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copiar standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
