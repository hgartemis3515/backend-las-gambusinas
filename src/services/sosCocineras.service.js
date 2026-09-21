const redisCache = require('../utils/redisCache');
const logger = require('../utils/logger');

const PREFIX = 'cocina';
const KEY = 'sosCocineras';
const TTL_SECONDS = 60 * 60 * 24 * 7;

function asBool(value) {
  return value === true || value === 1 || value === '1';
}

async function getSosCocineras() {
  try {
    const raw = await redisCache.getCustom(PREFIX, KEY);
    return asBool(raw);
  } catch (error) {
    logger.warn('SOS cocineras: lectura falló', { error: error.message });
    return false;
  }
}

async function setSosCocineras(activo) {
  const next = !!activo;
  await redisCache.setCustom(PREFIX, KEY, next ? '1' : '0', TTL_SECONDS);
  return next;
}

function emitSosCocineras(payload) {
  try {
    if (!global.io || typeof global.io.of !== 'function') return false;
    global.io.of('/cocina').emit('sos-cocineras', {
      activo: !!payload?.activo,
      by: payload?.by || null,
      at: payload?.at || new Date().toISOString(),
    });
    return true;
  } catch (error) {
    logger.warn('SOS cocineras: emit falló', { error: error.message });
    return false;
  }
}

module.exports = {
  getSosCocineras,
  setSosCocineras,
  emitSosCocineras,
};
