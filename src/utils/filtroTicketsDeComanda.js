const mongoose = require('mongoose');

function toOid(id) {
  if (!id) return null;
  const s = String(id._id != null ? id._id : id);
  if (!mongoose.Types.ObjectId.isValid(s) || s.length !== 24) return null;
  return new mongoose.Types.ObjectId(s);
}

function idStr(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v._id != null) return String(v._id);
  return String(v);
}

/**
 * Tickets ligados a una comanda aunque `comandas[]` esté vacío
 * (duplicados que sí aparecen en la tabla de cocina y se suman).
 */
function filtroTicketsVinculadosAComanda(comandaId, extras = {}) {
  const oid = toOid(comandaId);
  if (!oid) return null;

  const or = [
    { comandas: oid },
    { 'platos.comandaId': oid },
  ];

  const n = Number(extras.comandaNumber);
  const mesa = extras.mesaId ? toOid(extras.mesaId) : null;
  if (Number.isFinite(n) && n > 0 && mesa) {
    or.push({ comandasNumbers: n, mesa });
    or.push({ 'platos.comandaNumber': n, mesa });
  }

  const lineas = (extras.platoLineaIds || []).map(toOid).filter(Boolean);
  if (lineas.length) {
    or.push({ 'platos.platoLineaId': { $in: lineas } });
  }

  const q = { $or: or };
  if (extras.incluirInactivos !== true) q.isActive = true;
  return q;
}

function ticketEnComandasArray(ticket, comandaId) {
  const cid = String(comandaId);
  return (ticket?.comandas || []).some((c) => idStr(c) === cid);
}

function anotarTicketsDeComanda(tickets, comandaId) {
  const lista = Array.isArray(tickets) ? tickets : [];
  const porNumero = {};
  for (const t of lista) {
    if (t?.ticketNumber == null) continue;
    const k = String(t.ticketNumber);
    porNumero[k] = (porNumero[k] || 0) + 1;
  }
  const activos = lista.filter((t) => t && t.isActive !== false);
  return lista.map((t) => {
    const vinculoDebil = !ticketEnComandasArray(t, comandaId);
    return {
      ...t,
      vinculoDebil,
      inactivo: t.isActive === false,
      duplicadoNumero: porNumero[String(t.ticketNumber)] > 1,
      duplicadoHuerfano: vinculoDebil && t.isActive !== false,
      variosTicketsActivos: activos.length > 1 && t.isActive !== false,
    };
  });
}

function parseTicketNumber(raw) {
  const n = parseInt(String(raw || '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

module.exports = {
  toOid,
  idStr,
  filtroTicketsVinculadosAComanda,
  ticketEnComandasArray,
  anotarTicketsDeComanda,
  parseTicketNumber,
};
