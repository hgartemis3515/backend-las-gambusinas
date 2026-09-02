'use strict';

/**
 * Ventas pendientes / pagadas según la tabla de tickets de cocina
 * (TicketAprobacion + TicketPagoAdelantado).
 *
 * Una comanda puede generar varios tickets (PPA/forzar pago, reintentos,
 * ticket de comanda completa). Cada uno suele guardar el total de la comanda;
 * sumarlos infla “pagadas” por encima de ventas totales.
 *
 * Regla: por cada comanda se cuenta solo el ticket más reciente (createdAt,
 * luego ticketNumber). Un ticket que cubre varias comandas se cuenta una vez.
 *
 * Pendiente = último ticket en pendiente_aprobacion.
 * Pagadas   = último ticket en aprobado (campo API: ventasAprobadas).
 */

const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function matchRango(inicio, fin) {
  return {
    createdAt: { $gte: inicio, $lte: fin },
    isActive: { $ne: false }
  };
}

function idDeRef(v) {
  if (v == null) return '';
  if (typeof v === 'object') return String(v._id || v.id || '');
  return String(v);
}

function idsComandaDeTicket(t, index) {
  const raw = Array.isArray(t && t.comandas) ? t.comandas : [];
  const ids = raw.map(idDeRef).filter(Boolean);
  if (ids.length) return ids;
  if (t && t.comandaId != null) {
    const cid = idDeRef(t.comandaId);
    if (cid) return [cid];
  }
  if (t && t._id != null) return [String(t._id)];
  return [`__orphan_${index}`];
}

function tsTicket(t) {
  const d = t && t.createdAt ? new Date(t.createdAt).getTime() : 0;
  return Number.isFinite(d) ? d : 0;
}

function ticketMasNuevo(a, b) {
  const ta = tsTicket(a);
  const tb = tsTicket(b);
  if (ta !== tb) return ta > tb ? a : b;
  const na = Number(a && a.ticketNumber) || 0;
  const nb = Number(b && b.ticketNumber) || 0;
  if (na !== nb) return na > nb ? a : b;
  return String(a && a._id) >= String(b && b._id) ? a : b;
}

/**
 * Un ticket por comanda (el más reciente). Si el mismo ticket es el último
 * de varias comandas, queda una sola vez.
 */
function ultimoTicketPorComanda(tickets) {
  const byComanda = new Map();
  (tickets || []).forEach((t, index) => {
    if (!t) return;
    for (const cid of idsComandaDeTicket(t, index)) {
      const prev = byComanda.get(cid);
      byComanda.set(cid, prev ? ticketMasNuevo(t, prev) : t);
    }
  });
  const seenObj = new Set();
  const seenId = new Set();
  const out = [];
  for (const t of byComanda.values()) {
    if (seenObj.has(t)) continue;
    seenObj.add(t);
    if (t._id != null) {
      const id = String(t._id);
      if (seenId.has(id)) continue;
      seenId.add(id);
    }
    out.push(t);
  }
  return out;
}

function acumularTicketsUnicos(tickets) {
  const out = { ventasPendientes: 0, ventasAprobadas: 0, porMozo: new Map() };
  for (const t of ultimoTicketPorComanda(tickets)) {
    const est = t.estado;
    const total = Number(t.total) || 0;
    if (est === 'pendiente_aprobacion') out.ventasPendientes += total;
    else if (est === 'aprobado') out.ventasAprobadas += total;
    const mozoId = t.mozo != null ? String(t.mozo) : '';
    if (!mozoId) continue;
    if (!out.porMozo.has(mozoId)) {
      out.porMozo.set(mozoId, { ventasPendientes: 0, ventasAprobadas: 0 });
    }
    const m = out.porMozo.get(mozoId);
    if (est === 'pendiente_aprobacion') m.ventasPendientes += total;
    else if (est === 'aprobado') m.ventasAprobadas += total;
  }
  out.ventasPendientes = round2(out.ventasPendientes);
  out.ventasAprobadas = round2(out.ventasAprobadas);
  for (const [id, m] of out.porMozo) {
    out.porMozo.set(id, {
      ventasPendientes: round2(m.ventasPendientes),
      ventasAprobadas: round2(m.ventasAprobadas)
    });
  }
  return out;
}

const CAMPOS_DESGLOSE = 'estado total mozo comandas createdAt ticketNumber';

async function desgloseVentasPorAprobacion(inicio, fin) {
  const match = matchRango(inicio, fin);
  const [ticketsComanda, ticketsPpa] = await Promise.all([
    ticketAprobacionModel.find(match).select(CAMPOS_DESGLOSE).lean(),
    ticketPagoAdelantadoModel.find(match).select(CAMPOS_DESGLOSE).lean()
  ]);
  return acumularTicketsUnicos([...(ticketsComanda || []), ...(ticketsPpa || [])]);
}

module.exports = {
  desgloseVentasPorAprobacion,
  ultimoTicketPorComanda,
  acumularTicketsUnicos
};
