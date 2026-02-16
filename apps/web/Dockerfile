# Dockerfile para Next.js Web App (Monorepo)
# Build desde el ROOT del monorepo: docker build -f apps/web/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ------- Dependencies -------
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copiar archivos de configuración del monorepo
COPY package.json ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/web/package.json ./apps/web/package.json

# pnpm necesita pnpm-workspace.yaml para resolver workspace:*
RUN printf 'packages:\n  - "packages/*"\n  - "apps/*"\n' > pnpm-workspace.yaml

# node-linker=hoisted genera node_modules plano (sin symlinks)
# compatible con Next.js standalone output
RUN printf 'node-linker=hoisted\n' > .npmrc

RUN pnpm install --no-frozen-lockfile

# ------- Builder -------
FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app

# Copiar node_modules (root + workspace packages)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copiar código fuente
COPY packages ./packages
COPY apps/web ./apps/web
COPY package.json tsconfig.json .eslintrc.json ./

# pnpm necesita workspace yaml en builder tambien
COPY --from=deps /app/pnpm-workspace.yaml ./

# Generar Prisma Client (pnpm dlx bypasses build script restrictions)
RUN pnpm dlx prisma@5.22.0 generate --schema=packages/database/prisma/schema.prisma
RUN pnpm dlx prisma@5.22.0 generate --schema=apps/web/prisma/schema.prisma

# Build de Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN cd apps/web && ./node_modules/.bin/next build

# ------- Runner -------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos estáticos
COPY --from=builder /app/apps/web/public ./public

# Copiar standalone output (flat structure - server.js at root)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 8080

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
