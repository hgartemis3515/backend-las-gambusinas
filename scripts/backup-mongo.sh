#!/bin/bash
# FASE 7: MongoDB Backup Script Production Enterprise Grade
# Inspiración: Netflix/AWS Backup Strategy
# Features: Compression, S3 upload, Encryption, Retention policy

set -euo pipefail

# ============================================
# Configuration
# ============================================
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
MONGO_HOST="${MONGO_HOST:-mongodb-primary}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-lasgambusinas}"
MONGO_USER="${MONGO_ROOT_USERNAME:-admin}"
MONGO_PASS="${MONGO_ROOT_PASSWORD:-changeme}"
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-mongodb-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# Timestamp para nombre de archivo
TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/lasgambusinas-${TIMESTAMP}.gz"
LOG_FILE="${BACKUP_DIR}/backup-${TIMESTAMP}.log"

# ============================================
# Functions
# ============================================
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error_exit() {
    log "ERROR: $*"
    exit 1
}

# ============================================
# Pre-flight Checks
# ============================================
log "Starting MongoDB backup process..."

# Verificar que MongoDB está disponible
if ! mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
    error_exit "MongoDB is not accessible at $MONGO_HOST:$MONGO_PORT"
fi

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# ============================================
# Backup Process
# ============================================
log "Creating backup: $BACKUP_FILE"

# Mongodump con compresión gzip nivel 9 (máxima compresión)
mongodump \
    --host "$MONGO_HOST:$MONGO_PORT" \
    --username "$MONGO_USER" \
    --password "$MONGO_PASS" \
    --authenticationDatabase admin \
    --db "$MONGO_DB" \
    --archive="$BACKUP_FILE" \
    --gzip \
    --quiet

# Verificar que el backup se creó correctamente
if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
    error_exit "Backup file creation failed or is empty"
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created successfully: $BACKUP_FILE ($BACKUP_SIZE)"

# ============================================
# Integrity Check (Dry Run Restore)
# ============================================
log "Verifying backup integrity..."

if mongorestore --archive="$BACKUP_FILE" --gzip --dryRun --quiet > /dev/null 2>&1; then
    log "Backup integrity verified successfully"
else
    error_exit "Backup integrity check failed"
fi

# ============================================
# Encryption (Optional - GPG)
# ============================================
if [ -n "$ENCRYPTION_KEY" ]; then
    log "Encrypting backup with GPG..."
    ENCRYPTED_FILE="${BACKUP_FILE}.gpg"
    echo "$ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 --symmetric --cipher-algo AES256 "$BACKUP_FILE"
    rm "$BACKUP_FILE"  # Remover archivo sin encriptar
    BACKUP_FILE="$ENCRYPTED_FILE"
    log "Backup encrypted: $BACKUP_FILE"
fi

# ============================================
# Upload to S3 (Optional)
# ============================================
if [ -n "$S3_BUCKET" ] && command -v aws > /dev/null 2>&1; then
    log "Uploading backup to S3: s3://${S3_BUCKET}/${S3_PREFIX}/"
    
    S3_KEY="${S3_PREFIX}/$(basename $BACKUP_FILE)"
    
    if aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256 \
        --metadata "backup-date=${TIMESTAMP},database=${MONGO_DB}"; then
        log "Backup uploaded to S3 successfully: s3://${S3_BUCKET}/${S3_KEY}"
    else
        log "WARNING: S3 upload failed, but backup file exists locally"
    fi
fi

# ============================================
# Cleanup Old Backups (Retention Policy)
# ============================================
log "Cleaning up backups older than $RETENTION_DAYS days..."

# Local cleanup
find "$BACKUP_DIR" -name "lasgambusinas-*.gz*" -type f -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "backup-*.log" -type f -mtime +$RETENTION_DAYS -delete

# S3 cleanup (si está configurado)
if [ -n "$S3_BUCKET" ] && command -v aws > /dev/null 2>&1; then
    # Calcular fecha de corte
    CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)
    
    # Listar y eliminar backups antiguos en S3
    aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" | while read -r line; do
        FILE_DATE=$(echo "$line" | awk '{print $1}')
        FILE_NAME=$(echo "$line" | awk '{print $4}')
        
        if [ "$FILE_DATE" \< "$CUTOFF_DATE" ]; then
            log "Deleting old S3 backup: $FILE_NAME"
            aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${FILE_NAME}"
        fi
    done
fi

# ============================================
# Summary
# ============================================
log "Backup process completed successfully"
log "Backup file: $BACKUP_FILE"
log "Backup size: $BACKUP_SIZE"
log "Backup timestamp: $TIMESTAMP"

# Exit success
exit 0

