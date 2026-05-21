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
  if (!comanda || !platoData) return;

  const mesaNumero = comanda.mesas?.nummesa || comanda.mesas?.numero || '?';
  const nombrePlato = platoData.nombre || platoData.plato?.nombre || 'Un plato';
  const mesaId = comanda.mesas?._id || (comanda.mesas?.toString ? comanda.mesas.toString() : null);

  // Obtener IDs de mozos asignados a la comanda
  const mozoIds = [];
  if (Array.isArray(comanda.mozos)) {
    for (const m of comanda.mozos) {
      mozoIds.push(m._id || m);
    }
  }

  if (mozoIds.length === 0) return;

  return sendPushToMozos(mozoIds, {
    title: '🍽️ Plato Listo',
    body: `${nombrePlato} está listo para recoger. Mesa ${mesaNumero}`,
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
  if (!comanda) return;

  const mesaNumero = comanda.mesas?.nummesa || comanda.mesas?.numero || '?';
  const mesaId = comanda.mesas?._id || (comanda.mesas?.toString ? comanda.mesas.toString() : null);
  const comandaNumber = comanda.comandaNumber || '?';

  const mozoIds = [];
  if (Array.isArray(comanda.mozos)) {
    for (const m of comanda.mozos) {
      mozoIds.push(m._id || m);
    }
  }

  if (mozoIds.length === 0) return;

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

module.exports = {
  sendPushToMozos,
  notifyPlatoListo,
  notifyComandaLista,
};