#!/bin/bash
# FASE 7: MongoDB Replica Set Initialization Script
# Ejecutar una vez después de iniciar los contenedores MongoDB

set -euo pipefail

MONGO_HOST="${MONGO_HOST:-mongodb-primary}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_USER="${MONGO_ROOT_USERNAME:-admin}"
MONGO_PASS="${MONGO_ROOT_PASSWORD:-changeme}"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log "Initializing MongoDB Replica Set..."

# Esperar a que MongoDB esté listo
log "Waiting for MongoDB to be ready..."
for i in {1..30}; do
    if mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
        log "MongoDB is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        log "ERROR: MongoDB not ready after 30 attempts"
        exit 1
    fi
    sleep 2
done

# Verificar si el replica set ya está inicializado
RS_STATUS=$(mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin --eval "try { rs.status().ok } catch(e) { 0 }" --quiet 2>/dev/null || echo "0")

if [ "$RS_STATUS" = "1" ]; then
    log "Replica Set already initialized"
    mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin --eval "rs.status()" --quiet
    exit 0
fi

# Inicializar replica set
log "Initializing replica set rs0..."

mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin <<EOF
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongodb-primary:27017" },
    { _id: 1, host: "mongodb-secondary-1:27017" },
    { _id: 2, host: "mongodb-secondary-2:27017" }
  ]
})
EOF

log "Waiting for replica set to be ready..."
sleep 10

# Verificar estado
log "Replica Set Status:"
mongosh --host "$MONGO_HOST:$MONGO_PORT" -u "$MONGO_USER" -p "$MONGO_PASS" --authenticationDatabase admin --eval "rs.status()" --quiet

log "✅ MongoDB Replica Set initialized successfully"

