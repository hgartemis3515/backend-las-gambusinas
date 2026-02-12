# FASE 5: Script de Instalacion Redis para Windows
# Ejecutar como Administrador: powershell -ExecutionPolicy Bypass -File install-redis-windows.ps1

Write-Host "FASE 5: Instalando Redis para Windows..." -ForegroundColor Cyan

# Verificar si Chocolatey esta instalado
$chocoInstalled = Get-Command choco -ErrorAction SilentlyContinue

if (-not $chocoInstalled) {
    Write-Host "Instalando Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    Write-Host "Chocolatey instalado" -ForegroundColor Green
} else {
    Write-Host "Chocolatey ya esta instalado" -ForegroundColor Green
}

# Verificar si Redis ya esta instalado
$redisInstalled = Get-Service -Name "Redis" -ErrorAction SilentlyContinue

if (-not $redisInstalled) {
    Write-Host "Instalando Redis..." -ForegroundColor Yellow
    choco install redis-64 -y
    Write-Host "Redis instalado" -ForegroundColor Green
} else {
    Write-Host "Redis ya esta instalado" -ForegroundColor Green
}

# Iniciar Redis
Write-Host "Iniciando Redis..." -ForegroundColor Yellow
Start-Service Redis -ErrorAction SilentlyContinue

# Verificar que Redis esta corriendo
Start-Sleep -Seconds 2
$redisRunning = Get-Service -Name "Redis" -ErrorAction SilentlyContinue

if ($redisRunning -and $redisRunning.Status -eq 'Running') {
    Write-Host "Redis esta corriendo" -ForegroundColor Green
    
    # Probar conexion
    Write-Host "Probando conexion Redis..." -ForegroundColor Yellow
    $testResult = redis-cli ping 2>&1
    
    if ($testResult -match "PONG") {
        Write-Host "Redis conectado correctamente (PONG recibido)" -ForegroundColor Green
    } else {
        Write-Host "Redis instalado pero no responde. Intenta: redis-server" -ForegroundColor Yellow
    }
} else {
    Write-Host "Redis no esta corriendo. Inicia manualmente con: redis-server" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Proximos pasos:" -ForegroundColor Cyan
Write-Host "1. Verifica que Redis este corriendo: redis-cli ping" -ForegroundColor White
Write-Host "2. Si no esta corriendo: redis-server" -ForegroundColor White
Write-Host "3. Configura .env: REDIS_ENABLED=true" -ForegroundColor White
Write-Host "4. Reinicia el backend: npm start" -ForegroundColor White
Write-Host ""
Write-Host "Instalacion completada!" -ForegroundColor Green
