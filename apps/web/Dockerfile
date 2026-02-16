# Dockerfile para Next.js Web App (Monorepo)
# Build desde el ROOT del monorepo: docker build -f apps/web/Dockerfile .

FROM node:20-alpine AS base

# ------- Dependencies -------
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copiar archivos de configuración del monorepo
COPY package.json ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

# Instalar con npm (node_modules plano, compatible con standalone output)
RUN npm install --legacy-peer-deps

# ------- Builder -------
FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app

# Copiar node_modules
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY packages ./packages
COPY apps/web ./apps/web
COPY package.json tsconfig.json .eslintrc.json ./

# Generar Prisma Client
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npx prisma generate --schema=apps/web/prisma/schema.prisma

# Build de Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN cd apps/web && npm run build

# ------- Runner -------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos estáticos
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copiar standalone output (monorepo preserva estructura apps/web/)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 8080

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# En monorepo standalone, server.js esta en apps/web/
CMD ["node", "apps/web/server.js"]
