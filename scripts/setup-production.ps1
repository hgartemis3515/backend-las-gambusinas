# FASE 7: Production Setup Script (Windows PowerShell)
# Ejecutar este script para configurar el entorno de producción en Windows

Write-Host "🚀 FASE 7: Production Setup - Las Gambusinas POS" -ForegroundColor Cyan
Write-Host ""

# Verificar Docker
Write-Host "Checking Docker installation..." -ForegroundColor Yellow
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "✅ Docker installed" -ForegroundColor Green
    docker --version
} else {
    Write-Host "❌ Docker not found. Please install Docker Desktop from https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    exit 1
}

# Verificar Docker Compose
Write-Host "Checking Docker Compose..." -ForegroundColor Yellow
if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    Write-Host "✅ Docker Compose installed" -ForegroundColor Green
    docker-compose --version
} else {
    Write-Host "❌ Docker Compose not found" -ForegroundColor Red
    exit 1
}

# Crear archivo .env.production si no existe
Write-Host "Setting up environment variables..." -ForegroundColor Yellow
if (-not (Test-Path ".env.production")) {
    if (Test-Path ".env.production.example") {
        Copy-Item ".env.production.example" ".env.production"
        Write-Host "✅ Created .env.production from example" -ForegroundColor Green
        Write-Host "⚠️  Please edit .env.production with your production values" -ForegroundColor Yellow
    } else {
        Write-Host "⚠️  .env.production.example not found, creating basic .env.production" -ForegroundColor Yellow
        @"
NODE_ENV=production
PORT=3000
DBLOCAL=mongodb://admin:changeme@mongodb-primary:27017/lasgambusinas?authSource=admin&replicaSet=rs0
REDIS_URL=redis://redis:6379
JWT_SECRET=changeme-production-secret-min-32-chars
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
PM2_INSTANCES=max
LOG_LEVEL=info
"@ | Out-File -FilePath ".env.production" -Encoding utf8
    }
} else {
    Write-Host "✅ .env.production already exists" -ForegroundColor Green
}

# Crear directorios necesarios
Write-Host "Creating necessary directories..." -ForegroundColor Yellow
$directories = @("logs", "backups", "nginx\ssl")
foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created directory: $dir" -ForegroundColor Green
    }
}

# Instalar dependencias npm
Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
if (Test-Path "package.json") {
    npm install
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "⚠️  package.json not found" -ForegroundColor Yellow
}

# Verificar que los scripts de backup tienen permisos de ejecución (en Linux/Mac)
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Edit .env.production with your production values" -ForegroundColor White
Write-Host "2. Run: docker-compose up -d --build" -ForegroundColor White
Write-Host "3. Wait for services to start (check with: docker-compose ps)" -ForegroundColor White
Write-Host "4. Initialize MongoDB replica set: docker-compose exec mongodb-primary mongosh --eval 'rs.initiate()'" -ForegroundColor White
Write-Host "5. Verify health: curl http://localhost/health" -ForegroundColor White
Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green

