/**
 * Push Notifications Service — Backend Las Gambusinas
 *
 * Envía notificaciones push remotas via Expo Push API cuando:
 * - Un plato cambia a estado "recoger" → notifica al mozo asignado
 * - Una comanda cambia a status "recoger" → notifica al mozo asignado
 *
 * El mozo registra su push token al hacer login (POST /api/mozos/push-token).
 * Este servicio lee los tokens de la BD y usa expo-server-sdk para enviar pushes.
 */

const { Expo } = require('expo-server-sdk');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const expo = new Expo();

/** Evita doble push (emitPlatoActualizado + emitPlatoBatch) */
const recentPlatoListoPush = new Map();
const DEDUPE_MS = 10000;

function shouldSendPlatoListoPush(comandaId, platoId) {
  const key = `${comandaId}-${platoId}`;
  const now = Date.now();
  const last = recentPlatoListoPush.get(key);
  if (last && now - last < DEDUPE_MS) return false;
  recentPlatoListoPush.set(key, now);
  return true;
}

/** platoId puede ser _id del subdocumento o id del catálogo */
function findNombrePlatoEnComanda(comanda, platoId) {
  const target = platoId?.toString?.() || String(platoId);
  for (const p of comanda.platos || []) {
    const subId = p._id?.toString?.();
    const catalogId = p.plato?._id?.toString?.() || (typeof p.plato === 'string' ? p.plato : p.plato?.toString?.());
    const legacyId = p.platoId?.toString?.();
    if (
      (subId && subId === target) ||
      (catalogId && catalogId === target) ||
      (legacyId && legacyId === target)
    ) {
      return p.plato?.nombre || p.nombreOriginal || p.nombre || null;
    }
  }
  return null;
}

function buildPlatoListoBody(nombrePlato, mesaNumero) {
  const nombre = nombrePlato || 'Un plato';
  const mesa = mesaNumero != null && mesaNumero !== '' ? mesaNumero : '?';
  return `${nombre} listo para recoger. Mesa ${mesa}`;
}

/** comanda.mozos es ObjectId único en el schema, no array */
function getMozoIdsFromComanda(comanda) {
  const mozoIds = [];
  if (!comanda?.mozos) return mozoIds;
  if (Array.isArray(comanda.mozos)) {
    for (const m of comanda.mozos) {
      const id = m?._id || m;
      if (id) mozoIds.push(id);
    }
  } else {
    const id = comanda.mozos._id || comanda.mozos;
    if (id) mozoIds.push(id);
  }
  return mozoIds;
}

function getPlatosActivos(comanda) {
  return (comanda.platos || []).filter(p => p.eliminado !== true && p.anulado !== true);
}

/** Todos los platos activos en "recoger" = cocina terminó, mozo debe recoger en mesa */
function isComandaListaParaRecogerEnCocina(comanda) {
  const activos = getPlatosActivos(comanda);
  if (activos.length === 0) return false;
  return activos.every(p => (p.estado || '').toLowerCase() === 'recoger');
}

/** No notificar cuando status comanda→recoger por workaround "todos entregados" */
function shouldNotifyComandaLista(comanda, estadoNuevo) {
  if (estadoNuevo !== 'recoger') return false;
  return isComandaListaParaRecogerEnCocina(comanda);
}

/**
 * Envía notificaciones push a uno o varios mozos.
 * @param {string[]} mozoIds - IDs de mozos (strings u ObjectIds)
 * @param {object} message - { title, body, data? }
 * @returns {Promise<{sent: number, errors: string[]}>}
 */
async function sendPushToMozos(mozoIds, message) {
  if (!Array.isArray(mozoIds) || mozoIds.length === 0) return { sent: 0, errors: [] };

  const Mozos = mongoose.models.Mozo || require('../database/models/mozos.model');
  const objectIds = mozoIds.map(id => {
    try { return new mongoose.Types.ObjectId(id); } catch { return id; }
  });

  const mozos = await Mozos.find({
    _id: { $in: objectIds },
    pushToken: { $exists: true, $ne: '' }
  }).lean();

  if (mozos.length === 0) {
    logger.debug('[push] Ningún mozo con push token registrado', { mozoIds });
    return { sent: 0, errors: [] };
  }

  const messages = [];
  const tokenToMozo = {};

  for (const mozo of mozos) {
    const token = mozo.pushToken;
    if (!Expo.isExpoPushToken(token)) {
      logger.warn('[push] Token inválido, saltando', { mozoId: mozo._id, token: token?.substring(0, 20) });
      continue;
    }
    // Evitar duplicados si un mozo tiene varios dispositivos con mismo token
    tokenToMozo[token] = mozo._id;

    messages.push({
      to: token,
      sound: 'default',
      title: message.title,
      body: message.body,
      data: message.data || {},
      channelId: message.channelId || 'default',
      priority: 'high',
    });
  }

  if (messages.length === 0) {
    return { sent: 0, errors: [] };
  }

  // Enviar en chunks (Expo limita a ~600 por llamada)
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  const errors = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      logger.error('[push] Error enviando chunk', { error: error.message });
      errors.push(error.message);
    }
  }

  // Registrar tickets para verificar recepción luego (opcional)
  let sent = 0;
  for (const ticket of tickets) {
    if (ticket.status === 'ok') {
      sent++;
    } else {
      errors.push(ticket.message || ticket.details?.error || 'unknown');
      // Limpiar tokens inválidos
      if (ticket.details?.error === 'DeviceNotRegistered' || ticket.details?.error === 'InvalidCredentials') {
        const badToken = messages.find(m => m.to?.includes?.(ticket.details?.expoPushToken))?.to;
        if (badToken) {
          await Mozos.updateMany({ pushToken: badToken }, { $unset: { pushToken: 1 } }).catch(() => {});
        }
      }
    }
  }

  logger.info('[push] Notificaciones enviadas', {
    sent,
    total: messages.length,
    errors: errors.length,
    title: message.title
  });

  return { sent, errors };
}

/**
 * Notifica al mozo que un plato está listo para recoger.
 * @param {object} comanda - Comanda populada (con mozos y mesas)
 * @param {object} platoData - { platoId, nombre, nuevoEstado }
 */
async function notifyPlatoListo(comanda, platoData) {
  if (!comanda || !platoData || platoData.nuevoEstado !== 'recoger') return;

  const comandaId = comanda._id?.toString?.() || String(comanda._id);
  const platoId = platoData.platoId?.toString?.() || String(platoData.platoId);
  if (!shouldSendPlatoListoPush(comandaId, platoId)) {
    logger.debug('[push] Plato listo deduplicado', { comandaId, platoId });
    return;
  }

  const mesaNumero = comanda.mesas?.nummesa ?? comanda.mesas?.numero ?? '?';
  const nombrePlato =
    platoData.nombre ||
    findNombrePlatoEnComanda(comanda, platoId) ||
    'Un plato';
  const mesaId = comanda.mesas?._id || (comanda.mesas?.toString ? comanda.mesas.toString() : null);

  const mozoIds = getMozoIdsFromComanda(comanda);
  if (mozoIds.length === 0) {
    logger.debug('[push] Comanda sin mozo asignado', { comandaId: comanda._id });
    return;
  }

  return sendPushToMozos(mozoIds, {
    title: '🍽️ Plato Listo',
    body: buildPlatoListoBody(nombrePlato, mesaNumero),
    channelId: 'plato-listo',
    data: {
      type: 'plato-listo',
      mesaId: mesaId,
      mesaNumero: mesaNumero,
      comandaId: comanda._id?.toString(),
      platoId: platoData.platoId,
      platoNombre: nombrePlato,
    },
  });
}

/**
 * Notifica al mozo que una comanda entera está lista para recoger.
 * @param {object} comanda - Comanda populada (con mozos y mesas)
 */
async function notifyComandaLista(comanda) {
  if (!comanda || !isComandaListaParaRecogerEnCocina(comanda)) return;

  const mesaNumero = comanda.mesas?.nummesa || comanda.mesas?.numero || '?';
  const mesaId = comanda.mesas?._id || (comanda.mesas?.toString ? comanda.mesas.toString() : null);
  const comandaNumber = comanda.comandaNumber || '?';

  const mozoIds = getMozoIdsFromComanda(comanda);
  if (mozoIds.length === 0) {
    logger.debug('[push] Comanda sin mozo asignado (comanda lista)', { comandaId: comanda._id });
    return;
  }

  return sendPushToMozos(mozoIds, {
    title: '✅ Comanda Lista',
    body: `Comanda #${comandaNumber} de Mesa ${mesaNumero} completa para recoger.`,
    channelId: 'plato-listo',
    data: {
      type: 'comanda-lista',
      mesaId: mesaId,
      mesaNumero: mesaNumero,
      comandaId: comanda._id?.toString(),
      comandaNumber,
    },
  });
}

/**
 * Notifica al mozo que un plato salió de cocina (pasó de recoger → salio).
 * Push diferenciado del "plato listo para recoger".
 * @param {object} comanda - Comanda populada (con mozos y mesas)
 * @param {object} platoData - { platoId, nombre, nuevoEstado }
 */
async function notifyPlatoSalioCocina(comanda, platoData) {
  if (!comanda || !platoData || platoData.nuevoEstado !== 'salio') return;

  const comandaId = comanda._id?.toString?.() || String(comanda._id);
  const platoId = platoData.platoId?.toString?.() || String(platoData.platoId);

  const mesaNumero = comanda.mesas?.nummesa ?? comanda.mesas?.numero ?? '?';
  const nombrePlato =
    platoData.nombre ||
    findNombrePlatoEnComanda(comanda, platoId) ||
    'Un plato';
  const mesaId = comanda.mesas?._id || (comanda.mesas?.toString ? comanda.mesas.toString() : null);

  const mozoIds = getMozoIdsFromComanda(comanda);
  if (mozoIds.length === 0) {
    logger.debug('[push] Comanda sin mozo asignado (plato salió de cocina)', { comandaId: comanda._id });
    return;
  }

  return sendPushToMozos(mozoIds, {
    title: '🚶 Plato Salió de Cocina',
    body: `${nombrePlato} salió de cocina. Mesa ${mesaNumero}`,
    channelId: 'plato-salio',
    data: {
      type: 'plato-salio',
      mesaId: mesaId,
      mesaNumero: mesaNumero,
      comandaId: comanda._id?.toString(),
      platoId: platoData.platoId,
      platoNombre: nombrePlato,
    },
  });
}

module.exports = {
  sendPushToMozos,
  notifyPlatoListo,
  notifyPlatoSalioCocina,
  notifyComandaLista,
  isComandaListaParaRecogerEnCocina,
  shouldNotifyComandaLista,
  findNombrePlatoEnComanda,
  buildPlatoListoBody,
};