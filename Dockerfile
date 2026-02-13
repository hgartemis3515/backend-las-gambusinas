# FASE 7: Dockerfile Multi-Stage Build (Production Enterprise Grade)
# Inspiración: Rappi/Uber Microservices Architecture
# Base: Node.js 20 Alpine Linux (150MB vs 900MB oficial)

# ============================================
# STAGE 1: Builder Stage (Compilar dependencias)
# ============================================
FROM node:20-alpine AS builder

# Instalar dependencias de build (solo para compilación)
RUN apk add --no-cache python3 make g++

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias primero (cache layer)
COPY package*.json ./

# Instalar dependencias de producción (sin devDependencies)
RUN npm ci --only=production && npm cache clean --force

# ============================================
# STAGE 2: Production Stage (Runtime mínimo)
# ============================================
FROM node:20-alpine AS production

# Crear usuario no-root para seguridad (best practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Instalar dumb-init para manejo correcto de señales (SIGTERM/SIGINT)
RUN apk add --no-cache dumb-init

# Crear directorio de trabajo
WORKDIR /app

# Copiar node_modules desde builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar código de la aplicación
COPY --chown=nodejs:nodejs . .

# Crear directorios necesarios con permisos correctos
RUN mkdir -p logs backups && \
    chown -R nodejs:nodejs logs backups

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto de la aplicación
EXPOSE 3000

# Health check nativo Docker (cada 30 segundos)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usar dumb-init para manejo correcto de señales
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicio (PM2 o Node directo según entorno)
CMD ["node", "index.js"]

