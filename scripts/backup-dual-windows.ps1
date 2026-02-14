# FASE 7: Script de Backup Dual MongoDB + JSON para Windows
# Ejecutar diariamente a las 2:00 AM mediante Task Scheduler
# Requiere: MongoDB instalado, PowerShell 5.1+

param(
    [string]$BackupPath = "C:\backups\lasgambusinas",
    [int]$RetentionDays = 7,
    [switch]$Compress = $true
)

$ErrorActionPreference = "Stop"

# ============================================
# Configuración
# ============================================
$DateStamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$BackupDir = Join-Path $BackupPath $DateStamp
$MongoDBName = "lasgambusinas"
$MongoDBHost = "localhost"
$MongoDBPort = 27017
$DataDir = Join-Path $PSScriptRoot "..\data"  # Directorio de archivos JSON

# ============================================
# Funciones Helper
# ============================================
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$Timestamp] [$Level] $Message"
    Write-Host $LogMessage
    Add-Content -Path "$BackupPath\backup.log" -Value $LogMessage
}

function Test-MongoDBConnection {
    try {
        $result = mongosh --eval "db.adminCommand('ping')" --quiet 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
        return $false
    } catch {
        return $false
    }
}

# ============================================
# Inicio del Backup
# ============================================
Write-Log "============================================"
Write-Log "Iniciando Backup Dual MongoDB + JSON"
Write-Log "Fecha: $DateStamp"
Write-Log "============================================"

# Crear directorio de backup
try {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Log "Directorio de backup creado: $BackupDir"
} catch {
    Write-Log "Error al crear directorio de backup: $_" "ERROR"
    exit 1
}

# ============================================
# Backup MongoDB
# ============================================
Write-Log "Iniciando backup de MongoDB..."
try {
    # Verificar conexión MongoDB
    if (-not (Test-MongoDBConnection)) {
        Write-Log "MongoDB no está disponible. Verifica que el servicio esté corriendo." "WARN"
    } else {
        $MongoBackupDir = Join-Path $BackupDir "mongodb"
        New-Item -ItemType Directory -Path $MongoBackupDir -Force | Out-Null
        
        # Ejecutar mongodump
        $MongoDumpCmd = "mongodump --host $MongoDBHost`:$MongoDBPort --db $MongoDBName --out `"$MongoBackupDir`""
        Write-Log "Ejecutando: $MongoDumpCmd"
        
        Invoke-Expression $MongoDumpCmd
        
        if ($LASTEXITCODE -eq 0) {
            $MongoSize = (Get-ChildItem -Path $MongoBackupDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
            Write-Log "✅ Backup MongoDB completado: $([math]::Round($MongoSize, 2)) MB" "SUCCESS"
        } else {
            Write-Log "❌ Error en backup MongoDB (exit code: $LASTEXITCODE)" "ERROR"
        }
    }
} catch {
    Write-Log "❌ Error en backup MongoDB: $_" "ERROR"
}

# ============================================
# Backup Archivos JSON
# ============================================
Write-Log "Iniciando backup de archivos JSON..."
try {
    if (Test-Path $DataDir) {
        $JsonBackupDir = Join-Path $BackupDir "json"
        New-Item -ItemType Directory -Path $JsonBackupDir -Force | Out-Null
        
        # Copiar todos los archivos JSON
        $JsonFiles = Get-ChildItem -Path $DataDir -Filter "*.json" -File
        if ($JsonFiles.Count -gt 0) {
            Copy-Item -Path "$DataDir\*.json" -Destination $JsonBackupDir -Force
            $JsonSize = (Get-ChildItem -Path $JsonBackupDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB
            Write-Log "✅ Backup JSON completado: $([math]::Round($JsonSize, 2)) KB ($($JsonFiles.Count) archivos)" "SUCCESS"
        } else {
            Write-Log "⚠️ No se encontraron archivos JSON en $DataDir" "WARN"
        }
    } else {
        Write-Log "⚠️ Directorio de datos JSON no existe: $DataDir" "WARN"
    }
} catch {
    Write-Log "❌ Error en backup JSON: $_" "ERROR"
}

# ============================================
# Comprimir Backup (Opcional)
# ============================================
if ($Compress) {
    Write-Log "Comprimiendo backup..."
    try {
        $ZipFile = "$BackupPath\backup_$DateStamp.zip"
        Compress-Archive -Path $BackupDir -DestinationPath $ZipFile -Force
        
        $ZipSize = (Get-Item $ZipFile).Length / 1MB
        Write-Log "✅ Backup comprimido: $([math]::Round($ZipSize, 2)) MB → $ZipFile" "SUCCESS"
        
        # Eliminar directorio sin comprimir para ahorrar espacio
        Remove-Item -Path $BackupDir -Recurse -Force
        Write-Log "Directorio temporal eliminado"
    } catch {
        Write-Log "❌ Error al comprimir: $_" "ERROR"
        Write-Log "Backup sin comprimir disponible en: $BackupDir" "WARN"
    }
}

# ============================================
# Limpieza de Backups Antiguos
# ============================================
Write-Log "Limpiando backups antiguos (>$RetentionDays días)..."
try {
    $CutoffDate = (Get-Date).AddDays(-$RetentionDays)
    $OldBackups = Get-ChildItem -Path $BackupPath -Directory | Where-Object { $_.LastWriteTime -lt $CutoffDate }
    $OldZips = Get-ChildItem -Path $BackupPath -Filter "backup_*.zip" | Where-Object { $_.LastWriteTime -lt $CutoffDate }
    
    $DeletedCount = 0
    foreach ($backup in $OldBackups) {
        Remove-Item -Path $backup.FullName -Recurse -Force
        $DeletedCount++
    }
    foreach ($zip in $OldZips) {
        Remove-Item -Path $zip.FullName -Force
        $DeletedCount++
    }
    
    if ($DeletedCount -gt 0) {
        Write-Log "✅ $DeletedCount backups antiguos eliminados" "SUCCESS"
    } else {
        Write-Log "No hay backups antiguos para eliminar"
    }
} catch {
    Write-Log "❌ Error al limpiar backups antiguos: $_" "ERROR"
}

# ============================================
# Resumen Final
# ============================================
Write-Log "============================================"
Write-Log "Backup Dual Completado"
Write-Log "Ubicación: $BackupDir"
if ($Compress) {
    Write-Log "Archivo ZIP: $ZipFile"
}
Write-Log "============================================"

# Opcional: Copiar a Google Drive / NAS (descomentar y configurar)
# $GoogleDrivePath = "C:\Users\$env:USERNAME\Google Drive\Backups\LasGambusinas"
# if (Test-Path $GoogleDrivePath) {
#     Copy-Item -Path $ZipFile -Destination $GoogleDrivePath -Force
#     Write-Log "✅ Backup copiado a Google Drive"
# }

exit 0

