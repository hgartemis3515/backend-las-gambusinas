'use strict';

const moment = require('moment-timezone');
const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
const logger = require('./logger');

function normTipoServicio(v) {
  return v === 'para_llevar' ? 'para_llevar' : 'mesa';
}

function idsIguales(a, b) {
  if (a == null || b == null || a === '') return false;
  return String(a) === String(b);
}

/**
 * Aplica cambios de tipoServicio a líneas de snapshot (ticket / TPA / boucher).
 * Prioridad: platoLineaId → platoId numérico (misma comanda) → ObjectId de catálogo.
 * @returns {number} líneas modificadas
 */
function aplicarTipoServicioEnLineas(platos, cambios, comandaId) {
  if (!Array.isArray(platos) || !Array.isArray(cambios) || cambios.length === 0) return 0;
  const used = new Set();
  let hits = 0;
  const cid = comandaId != null ? String(comandaId) : '';

  for (const c of cambios) {
    const ts = normTipoServicio(c.tipoServicio);
    let idx = -1;

    const linea = c.lineaId != null ? String(c.lineaId) : '';
    if (linea) {
      idx = platos.findIndex((p, i) => !used.has(i) && p && idsIguales(p.platoLineaId, linea));
    }

    if (idx < 0 && c.platoId != null && Number.isFinite(Number(c.platoId))) {
      idx = platos.findIndex((p, i) =>
        !used.has(i) &&
        p &&
        Number(p.platoId) === Number(c.platoId) &&
        (!p.comandaId || idsIguales(p.comandaId, cid))
      );
    }

    if (idx < 0 && c.plato != null) {
      idx = platos.findIndex((p, i) =>
        !used.has(i) &&
        p &&
        idsIguales(p.plato, c.plato) &&
        (!p.comandaId || idsIguales(p.comandaId, cid))
      );
    }

    if (idx < 0) continue;
    used.add(idx);
    if (normTipoServicio(platos[idx].tipoServicio) === ts) continue;
    platos[idx].tipoServicio = ts;
    hits += 1;
  }
  return hits;
}

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
      logger.warn('No se pudo emitir ticket tras tipoServicio', { error: err.message });
    }
  }
}

async function sincronizarTipoServicioSnapshots(comandaId, cambios) {
  const resultado = { tickets: 0, tpas: 0, bouchers: 0 };
  if (!comandaId || !Array.isArray(cambios) || cambios.length === 0) return resultado;

  const query = { comandas: comandaId, isActive: { $ne: false } };
  const emitidos = [];

  const [tas, ppas] = await Promise.all([
    ticketAprobacionModel.find(query),
    ticketPagoAdelantadoModel.find(query),
  ]);

  for (const t of tas) {
    if (aplicarTipoServicioEnLineas(t.platos, cambios, comandaId) > 0) {
      t.markModified('platos');
      await t.save();
      resultado.tickets += 1;
      emitidos.push(t);
    }
  }
  for (const t of ppas) {
    if (aplicarTipoServicioEnLineas(t.platos, cambios, comandaId) > 0) {
      t.markModified('platos');
      await t.save();
      resultado.tpas += 1;
      emitidos.push(t);
    }
  }
  if (emitidos.length) emitirTicketsActualizados(emitidos);

  try {
    const boucherModel = require('../database/models/boucher.model');
    const bouchers = await boucherModel.find({
      comandas: comandaId,
      isActive: { $ne: false },
    });
    for (const b of bouchers) {
      if (aplicarTipoServicioEnLineas(b.platos, cambios, comandaId) > 0) {
        b.markModified('platos');
        await b.save();
        resultado.bouchers += 1;
      }
    }
  } catch (err) {
    logger.warn('No se pudo sincronizar tipoServicio a bouchers', { error: err.message });
  }

  return resultado;
}

module.exports = {
  normTipoServicio,
  aplicarTipoServicioEnLineas,
  sincronizarTipoServicioSnapshots,
};
