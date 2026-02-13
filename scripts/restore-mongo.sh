#!/bin/bash
# FASE 7: MongoDB Restore Script Production Enterprise Grade
# Usage: ./restore-mongo.sh <backup-file.gz>

set -euo pipefail

# ============================================
# Configuration
# ============================================
BACKUP_FILE="${1:-}"
MONGO_HOST="${MONGO_HOST:-mongodb-primary}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-lasgambusinas}"
MONGO_USER="${MONGO_ROOT_USERNAME:-admin}"
MONGO_PASS="${MONGO_ROOT_PASSWORD:-changeme}"
DROP_COLLECTIONS="${DROP_COLLECTIONS:-false}"

# ============================================
# Functions
# ============================================
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

error_exit() {
    log "ERROR: $*"
    exit 1
}

# ============================================
# Validation
# ============================================
if [ -z "$BACKUP_FILE" ]; then
    error_exit "Usage: $0 <backup-file.gz>"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    error_exit "Backup file not found: $BACKUP_FILE"
fi

log "Starting MongoDB restore process..."
log "Backup file: $BACKUP_FILE"
log "Target database: $MONGO_DB"
log "MongoDB host: $MONGO_HOST:$MONGO_PORT"

# ============================================
# Pre-flight Checks
# ============================================
if ! mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
    error_exit "MongoDB is not accessible at $MONGO_HOST:$MONGO_PORT"
fi

# ============================================
# Decryption (if encrypted)
# ============================================
RESTORE_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gpg ]]; then
    log "Decrypting backup file..."
    RESTORE_FILE="${BACKUP_FILE%.gpg}"
    
    if [ -z "$ENCRYPTION_KEY" ]; then
        error_exit "ENCRYPTION_KEY environment variable required for encrypted backups"
    fi
    
    echo "$ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 --decrypt "$BACKUP_FILE" > "$RESTORE_FILE"
    log "Backup decrypted: $RESTORE_FILE"
fi

# ============================================
# Restore Process
# ============================================
log "Restoring database..."

# Opciones de restore
RESTORE_OPTS="--host $MONGO_HOST:$MONGO_PORT"
RESTORE_OPTS="$RESTORE_OPTS --username $MONGO_USER"
RESTORE_OPTS="$RESTORE_OPTS --password $MONGO_PASS"
RESTORE_OPTS="$RESTORE_OPTS --authenticationDatabase admin"
RESTORE_OPTS="$RESTORE_OPTS --archive=$RESTORE_FILE"
RESTORE_OPTS="$RESTORE_OPTS --gzip"

if [ "$DROP_COLLECTIONS" = "true" ]; then
    RESTORE_OPTS="$RESTORE_OPTS --drop"
    log "WARNING: Collections will be dropped before restore"
fi

# Ejecutar restore
if mongorestore $RESTORE_OPTS --quiet; then
    log "Database restored successfully"
else
    error_exit "Restore failed"
fi

# ============================================
# Verification
# ============================================
log "Verifying restored data..."

COLLECTION_COUNT=$(mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin "$MONGO_DB" --eval "db.getCollectionNames().length" --quiet)

log "Restored collections: $COLLECTION_COUNT"
log "Restore process completed successfully"

# Cleanup decrypted file if it was encrypted
if [[ "$BACKUP_FILE" == *.gpg ]] && [ -f "$RESTORE_FILE" ]; then
    rm "$RESTORE_FILE"
fi

exit 0

