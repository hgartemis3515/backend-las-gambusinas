# FASE 7: Script para migrar .env a .env.production
# Este script ayuda a migrar tu configuración actual a producción

Write-Host "[INFO] Migrando configuracion .env a .env.production" -ForegroundColor Cyan
Write-Host ""

$envFile = ".env"
$prodExampleFile = ".env.production.example"
$prodFile = ".env.production"

# Verificar que .env existe
if (-not (Test-Path $envFile)) {
    Write-Host "[ERROR] Archivo .env no encontrado" -ForegroundColor Red
    Write-Host "Por favor, crea un archivo .env primero" -ForegroundColor Yellow
    exit 1
}

# Leer .env actual
Write-Host "[INFO] Leyendo configuracion actual de .env..." -ForegroundColor Yellow
$envContent = Get-Content $envFile -Raw

# Extraer variables comunes
$port = if ($envContent -match "PORT=(\d+)") { $matches[1] } else { "3000" }
$dblocal = if ($envContent -match "DBLOCAL=(.+?)(?:\r?\n|$)") { $matches[1].Trim() } else { "" }
$jwtSecret = if ($envContent -match "JWT_SECRET=(.+?)(?:\r?\n|$)") { $matches[1].Trim() } else { "" }
$allowedOrigins = if ($envContent -match "ALLOWED_ORIGINS=(.+?)(?:\r?\n|$)") { $matches[1].Trim() } else { "" }

Write-Host "[OK] Variables encontradas:" -ForegroundColor Green
Write-Host "  PORT: $port" -ForegroundColor White
Write-Host "  DBLOCAL: $(if ($dblocal) { 'Configurado' } else { 'No encontrado' })" -ForegroundColor White
Write-Host "  JWT_SECRET: $(if ($jwtSecret) { 'Configurado' } else { 'No encontrado' })" -ForegroundColor White
Write-Host "  ALLOWED_ORIGINS: $(if ($allowedOrigins) { 'Configurado' } else { 'No encontrado' })" -ForegroundColor White
Write-Host ""

# Crear .env.production basado en ejemplo
if (Test-Path $prodExampleFile) {
    Write-Host "[INFO] Creando .env.production desde ejemplo..." -ForegroundColor Yellow
    Copy-Item $prodExampleFile $prodFile -Force
    
    # Actualizar con valores del .env actual
    $prodContent = Get-Content $prodFile -Raw
    
    # Actualizar PORT
    if ($port) {
        $prodContent = $prodContent -replace "PORT=3000", "PORT=$port"
    }
    
    # Actualizar DBLOCAL si existe
    if ($dblocal) {
        # Si es conexión local, mantenerla pero comentar la de Docker
        if ($dblocal -match "localhost|127\.0\.0\.1") {
            Write-Host "[WARN] DBLOCAL apunta a localhost - mantener para desarrollo local" -ForegroundColor Yellow
            $prodContent = $prodContent -replace "# DBLOCAL=mongodb://localhost:27017/lasgambusinas", "DBLOCAL=$dblocal"
        } else {
            # Es una conexión remota, actualizar
            $prodContent = $prodContent -replace "DBLOCAL=mongodb://admin:changeme-production-password@mongodb-primary:27017/lasgambusinas\?authSource=admin&replicaSet=rs0&readPreference=secondaryPreferred", "DBLOCAL=$dblocal"
        }
    }
    
    # Actualizar JWT_SECRET si existe
    if ($jwtSecret) {
        $prodContent = $prodContent -replace "JWT_SECRET=changeme-production-jwt-secret-min-32-chars-generate-with-openssl-rand-base64-32", "JWT_SECRET=$jwtSecret"
    }
    
    # Actualizar ALLOWED_ORIGINS si existe
    if ($allowedOrigins) {
        $prodContent = $prodContent -replace "ALLOWED_ORIGINS=https://lasgambusinas.com,https://www.lasgambusinas.com,https://admin.lasgambusinas.com", "ALLOWED_ORIGINS=$allowedOrigins"
    }
    
    # Guardar archivo
    $prodContent | Out-File -FilePath $prodFile -Encoding utf8 -NoNewline
    
    Write-Host "[OK] Archivo .env.production creado exitosamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "[INFO] Proximos pasos:" -ForegroundColor Cyan
    Write-Host "1. Revisa .env.production y ajusta los valores según tu entorno" -ForegroundColor White
    Write-Host "2. Para Docker: Asegúrate de que DBLOCAL apunte a mongodb-primary:27017" -ForegroundColor White
    Write-Host "3. Para producción: Cambia JWT_SECRET por uno seguro (openssl rand -base64 32)" -ForegroundColor White
    Write-Host "4. Configura ALLOWED_ORIGINS con tus dominios reales" -ForegroundColor White
    Write-Host ""
    
} else {
    Write-Host "[ERROR] Archivo .env.production.example no encontrado" -ForegroundColor Red
    Write-Host "Creando .env.production basico..." -ForegroundColor Yellow
    
    # Crear archivo básico
    $basicContent = @"
# FASE 7: Production Environment Variables
# Migrado desde .env el $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

NODE_ENV=production
PORT=$port
$(if ($dblocal) { "DBLOCAL=$dblocal" } else { "# DBLOCAL=mongodb://localhost:27017/lasgambusinas" })
$(if ($jwtSecret) { "JWT_SECRET=$jwtSecret" } else { "JWT_SECRET=changeme-production-secret-min-32-chars" })
$(if ($allowedOrigins) { "ALLOWED_ORIGINS=$allowedOrigins" } else { "ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001" })
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
PM2_INSTANCES=max
LOG_LEVEL=info
"@
    
    $basicContent | Out-File -FilePath $prodFile -Encoding utf8
    Write-Host "[OK] Archivo .env.production basico creado" -ForegroundColor Green
}

Write-Host ""
Write-Host "[OK] Migracion completada!" -ForegroundColor Green

