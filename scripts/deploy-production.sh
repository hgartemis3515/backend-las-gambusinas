#!/bin/bash
# FASE 7: Production Deployment Script
# Usage: ./deploy-production.sh [rollback]

set -euo pipefail

DEPLOY_MODE="${1:-deploy}"
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost/health}"
MAX_RETRIES=3
RETRY_DELAY=10

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

health_check() {
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -f -s "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            log "Health check passed"
            return 0
        fi
        retries=$((retries + 1))
        log "Health check failed, retry $retries/$MAX_RETRIES..."
        sleep $RETRY_DELAY
    done
    return 1
}

# ============================================
# Deployment
# ============================================
if [ "$DEPLOY_MODE" = "deploy" ]; then
    log "Starting production deployment..."
    
    # Pre-deployment backup
    log "Creating pre-deployment backup..."
    if [ -f "scripts/backup-mongo.sh" ]; then
        bash scripts/backup-mongo.sh || log "WARNING: Backup failed, continuing deployment"
    fi
    
    # Pull latest code
    log "Pulling latest code..."
    git pull origin main || error_exit "Git pull failed"
    
    # Install dependencies
    log "Installing dependencies..."
    npm ci --only=production || error_exit "npm install failed"
    
    # Build Docker images (if using Docker)
    if [ -f "docker-compose.yml" ]; then
        log "Building Docker images..."
        docker-compose build backend || error_exit "Docker build failed"
    fi
    
    # Zero-downtime reload
    if command -v pm2 > /dev/null 2>&1; then
        log "Reloading PM2 cluster (zero-downtime)..."
        pm2 reload ecosystem.config.js || error_exit "PM2 reload failed"
    elif [ -f "docker-compose.yml" ]; then
        log "Restarting Docker containers..."
        docker-compose up -d --no-deps backend || error_exit "Docker restart failed"
    else
        error_exit "No deployment method found (PM2 or Docker)"
    fi
    
    # Health check
    log "Waiting for service to be ready..."
    sleep 5
    
    if health_check; then
        log "✅ Deployment successful!"
        exit 0
    else
        log "❌ Health check failed after deployment"
        log "Rolling back..."
        bash "$0" rollback
        error_exit "Deployment failed, rolled back"
    fi

# ============================================
# Rollback
# ============================================
elif [ "$DEPLOY_MODE" = "rollback" ]; then
    log "Starting rollback..."
    
    # Git revert
    log "Reverting to previous commit..."
    git reset --hard HEAD~1 || error_exit "Git revert failed"
    
    # Restart services
    if command -v pm2 > /dev/null 2>&1; then
        pm2 restart ecosystem.config.js
    elif [ -f "docker-compose.yml" ]; then
        docker-compose restart backend
    fi
    
    # Health check
    sleep 5
    if health_check; then
        log "✅ Rollback successful!"
        exit 0
    else
        error_exit "Rollback failed, manual intervention required"
    fi
else
    error_exit "Usage: $0 [deploy|rollback]"
fi

