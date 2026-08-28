/**
 * Propaga el descuento de una comanda a sus tickets (aprobación y PPA)
 * y avisa a cocina/admin para refrescar la tabla.
 */
const moment = require('moment-timezone');
const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
const { aplicarDescuentoADocDesdeComanda, marcarYRestarPlatosEliminados } = require('./descuentoTicketSnapshot');
const logger = require('./logger');

function emitirTicketsActualizados(tickets) {
  const io = global.io;
  if (!io || !tickets.length) return;
  const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
  for (const t of tickets) {
    const plain = typeof t.toObject === 'function' ? t.toObject() : t;
    const payload = {
      ticketId: t._id,
      ticket: plain,
      estado: t.estado,
      comandas: t.comandas,
    };
    try {
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-actualizado', payload);
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-actualizado', payload);
      io.of('/admin').emit('ticket-actualizado', payload);
      io.of('/admin').emit('ticket-ppa-actualizado', payload);
    } catch (err) {
      logger.warn('No se pudo emitir ticket actualizado tras descuento', { error: err.message });
    }
  }
}

async function sincronizarDescuentoTicketsComanda(comanda) {
  if (!comanda?._id) return [];
  const query = { comandas: comanda._id, isActive: { $ne: false } };
  const [tas, ppas] = await Promise.all([
    ticketAprobacionModel.find(query),
    ticketPagoAdelantadoModel.find(query),
  ]);
  const updated = [];
  for (const t of [...tas, ...ppas]) {
    marcarYRestarPlatosEliminados(t, comanda);
    aplicarDescuentoADocDesdeComanda(t, comanda);
    await t.save();
    updated.push(t);
  }
  emitirTicketsActualizados(updated);

  try {
    const boucherModel = require('../database/models/boucher.model');
    const bouchers = await boucherModel.find({
      comandas: comanda._id,
      isActive: { $ne: false }
    });
    for (const b of bouchers) {
      marcarYRestarPlatosEliminados(b, comanda);
      aplicarDescuentoADocDesdeComanda(b, comanda);
      await b.save();
    }
  } catch (err) {
    logger.warn('No se pudo sincronizar descuento a bouchers', { error: err.message });
  }

  return updated;
}

module.exports = {
  sincronizarDescuentoTicketsComanda,
};
