# ============================================
# STAGE 1: Dependencies
# ============================================
FROM node:22-slim AS deps
WORKDIR /app

# Instalar dependencias del sistema para sharp y prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias y generar Prisma client
RUN npm ci && npx prisma generate

# ============================================
# STAGE 2: Builder
# ============================================
FROM node:22-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generar Prisma y compilar TypeScript
# DATABASE_URL dummy solo para generar el cliente, no conecta a nada
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate && npm run build

# ============================================
# STAGE 3: Production
# ============================================
FROM node:22-slim AS production

# Instalar dependencias runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Crear usuario no-root
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs botuser

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Crear directorio de logs
RUN mkdir -p /app/logs && chown botuser:nodejs /app/logs

# Copiar solo lo necesario
COPY --from=deps --chown=botuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=botuser:nodejs /app/dist ./dist
COPY --from=builder --chown=botuser:nodejs /app/src/generated ./dist/generated
COPY --from=builder --chown=botuser:nodejs /app/package*.json ./
COPY --from=builder --chown=botuser:nodejs /app/prisma ./prisma

# Regenerar Prisma client para producción
RUN npx prisma generate

USER botuser

EXPOSE 3000

# Healthcheck - usa PORT del entorno (Railway asigna dinámicamente)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

CMD ["node", "dist/bot.js"]
