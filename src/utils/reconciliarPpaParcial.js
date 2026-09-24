'use strict';

/**
 * Si un pago adelantado cubrió solo parte de una línea (ej. 1 de 4)
 * pero la línea entera quedó marcada como cobrada, separa el resto
 * para que se pueda cobrar y aparezca como pendiente.
 */
const mongoose = require('mongoose');
const comandaModel = require('../database/models/comanda.model');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
const { cantidadUnidadesPlato } = require('./cantidadLineaComanda');
const { aplicarSeparacionCantidadLinea } = require('./separarCantidadLineaPlato');
const logger = require('./logger');

function lineaTienePpa(plato) {
  if (!plato?.pagoAdelantado) return false;
  if (plato.pagoAdelantado.cobrado === true) return true;
  const et = String(plato.pagoAdelantado.estadoTicket || '').toLowerCase();
  return et === 'pendiente_aprobacion' || et === 'aprobado';
}

async function reconciliarComandaPpaParcial(comandaId) {
  if (!comandaId || !mongoose.Types.ObjectId.isValid(String(comandaId))) return false;
  const comanda = await comandaModel.findById(comandaId);
  if (!comanda || !Array.isArray(comanda.platos) || !comanda.platos.length) return false;

  const tickets = await ticketPagoAdelantadoModel.find({
    comandas: comanda._id,
    estado: { $in: ['pendiente_aprobacion', 'aprobado'] },
    isActive: { $ne: false },
  }).select('platos');

  const cubiertoPorLinea = new Map();
  for (const t of tickets) {
    for (const p of t.platos || []) {
      if (p.comandaId && String(p.comandaId) !== String(comanda._id)) continue;
      const id = p.platoLineaId ? String(p.platoLineaId) : '';
      if (!id) continue;
      cubiertoPorLinea.set(id, (cubiertoPorLinea.get(id) || 0) + (Number(p.cantidad) || 1));
    }
  }
  if (!cubiertoPorLinea.size) return false;

  const remapeos = [];
  let cambio = false;
  for (let i = 0; i < comanda.platos.length; i++) {
    const plato = comanda.platos[i];
    if (!plato || plato.eliminado || plato.anulado || !lineaTienePpa(plato)) continue;
    const lineaId = String(plato._id);
    const cubierto = cubiertoPorLinea.get(lineaId) || 0;
    if (cubierto <= 0) continue;
    const total = cantidadUnidadesPlato(comanda, i, plato);
    if (cubierto >= total) continue;

    const idxNueva = comanda.platos.length;
    const sep = aplicarSeparacionCantidadLinea(comanda, i, cubierto);
    if (!sep.didSplit) continue;
    const nueva = comanda.platos[idxNueva];
    if (!nueva) continue;
    nueva.pagoAdelantado = {
      requerido: plato.pagoAdelantado?.requerido !== false,
      cobrado: plato.pagoAdelantado?.cobrado === true,
      ticketId: plato.pagoAdelantado?.ticketId || null,
      estadoTicket: plato.pagoAdelantado?.estadoTicket || null,
      boucherId: plato.pagoAdelantado?.boucherId || null,
    };
    plato.pagoAdelantado = {
      requerido: false,
      cobrado: false,
      ticketId: null,
      estadoTicket: null,
      boucherId: null,
    };
    remapeos.push({ desde: lineaId, hacia: String(nueva._id) });
    cubiertoPorLinea.delete(lineaId);
    cambio = true;
  }

  if (!cambio) return false;
  comanda.markModified('platos');
  comanda.markModified('cantidades');
  await comanda.save();

  for (const map of remapeos) {
    await ticketPagoAdelantadoModel.updateMany(
      { comandas: comanda._id, 'platos.platoLineaId': map.desde },
      { $set: { 'platos.$[p].platoLineaId': new mongoose.Types.ObjectId(map.hacia) } },
      { arrayFilters: [{ 'p.platoLineaId': new mongoose.Types.ObjectId(map.desde) }] }
    );
  }
  logger.info('[PPA parcial] línea separada: lo cobrado queda aparte y el resto sigue pendiente', {
    comandaId: String(comanda._id),
    comandaNumber: comanda.comandaNumber,
    remapeos,
  });
  return true;
}

async function reconciliarComandasPpaParcial(comandaIds) {
  const ids = [...new Set((comandaIds || []).map((id) => String(id?._id || id)).filter(Boolean))];
  for (const id of ids) {
    try {
      await reconciliarComandaPpaParcial(id);
    } catch (err) {
      logger.warn('[PPA parcial] no se pudo reconciliar comanda', { comandaId: id, error: err.message });
    }
  }
}

module.exports = {
  reconciliarComandaPpaParcial,
  reconciliarComandasPpaParcial,
};
