/**
 * Snapshot de descuento en tickets de cocina / impresión.
 * Prioridad: campos del ticket → boucher → comandas populadas.
 */

const BOUCHER_DESCUENTO_SELECT = 'montoDescuento descuentos totalSinDescuento totalConDescuento';
const COMANDA_DESCUENTO_SELECT = 'comandaNumber descuento montoDescuento motivoDescuento totalSinDescuento totalCalculado';

function snapshotDesdeComandas(ticket) {
  const comandas = Array.isArray(ticket?.comandas) ? ticket.comandas : [];
  const docs = comandas.filter((c) => c && typeof c === 'object' && (Number(c.montoDescuento) > 0 || Number(c.descuento) > 0));
  if (!docs.length) return { monto: 0, descuentos: [], totalSinDescuento: null };
  const monto = Number(docs.reduce((s, c) => s + (Number(c.montoDescuento) || 0), 0).toFixed(2));
  const descuentos = docs.map((c) => ({
    comandaNumber: c.comandaNumber,
    porcentaje: Number(c.descuento) || 0,
    motivo: c.motivoDescuento || '',
    monto: Number(c.montoDescuento) || 0,
  }));
  const totalSinDescuento = docs.length === 1
    ? (docs[0].totalSinDescuento ?? null)
    : docs.reduce((s, c) => s + (Number(c.totalSinDescuento) || 0), 0) || null;
  return { monto, descuentos, totalSinDescuento };
}

function adjuntarDescuentoTicket(ticket) {
  if (!ticket) return ticket;
  const boucher = ticket.boucher && typeof ticket.boucher === 'object' ? ticket.boucher : null;
  const fromComanda = snapshotDesdeComandas(ticket);
  const descuentosTicket = Array.isArray(ticket.descuentos) && ticket.descuentos.length
    ? ticket.descuentos
    : [];
  const descuentos = descuentosTicket.length
    ? descuentosTicket
    : (boucher?.descuentos?.length ? boucher.descuentos : fromComanda.descuentos);
  const monto = Number(ticket.montoDescuento ?? boucher?.montoDescuento ?? fromComanda.monto ?? 0) || 0;
  return {
    ...ticket,
    montoDescuento: monto,
    totalSinDescuento: ticket.totalSinDescuento ?? boucher?.totalSinDescuento ?? fromComanda.totalSinDescuento ?? null,
    descuentos,
  };
}

function aplicarDescuentoAVistaTicket(ticket) {
  const t = adjuntarDescuentoTicket(ticket);
  const monto = Number(t.montoDescuento) || 0;
  if (monto <= 0) return t;
  const teniaSnapshot = Number(ticket.montoDescuento) > 0;
  const bruto = Number(t.totalSinDescuento)
    || (teniaSnapshot ? Number(ticket.total) + Number(ticket.montoDescuento) : Number(t.total) || 0);
  return {
    ...t,
    totalSinDescuento: bruto,
    total: Number((bruto - monto).toFixed(2)),
  };
}

function totalesConDescuentoImpresion(ticket, totalesBase = {}) {
  const vista = aplicarDescuentoAVistaTicket({ ...ticket, total: totalesBase.total ?? ticket.total });
  return {
    subtotal: totalesBase.subtotal ?? ticket.subtotal ?? 0,
    total: vista.total,
    montoDescuento: Number(vista.montoDescuento) || 0,
    descuentos: vista.descuentos || [],
    totalSinDescuento: vista.totalSinDescuento ?? null,
  };
}

function aplicarDescuentoADocTicket(ticketDoc, snap) {
  const pct = Number(snap?.porcentaje) || 0;
  if (pct <= 0) {
    if (ticketDoc.totalSinDescuento != null) {
      ticketDoc.total = ticketDoc.totalSinDescuento;
    }
    ticketDoc.montoDescuento = 0;
    ticketDoc.descuentos = [];
    ticketDoc.totalSinDescuento = null;
    return ticketDoc;
  }
  if (ticketDoc.totalSinDescuento == null) {
    ticketDoc.totalSinDescuento = Number(ticketDoc.total) || 0;
  }
  const base = Number(ticketDoc.totalSinDescuento) || 0;
  const monto = Number((base * pct / 100).toFixed(2));
  ticketDoc.montoDescuento = monto;
  ticketDoc.total = Number((base - monto).toFixed(2));
  ticketDoc.descuentos = [{
    comandaNumber: snap.comandaNumber,
    porcentaje: pct,
    motivo: snap.motivo || '',
    monto,
  }];
  return ticketDoc;
}

module.exports = {
  adjuntarDescuentoTicket,
  aplicarDescuentoAVistaTicket,
  totalesConDescuentoImpresion,
  aplicarDescuentoADocTicket,
  snapshotDesdeComandas,
  BOUCHER_DESCUENTO_SELECT,
  COMANDA_DESCUENTO_SELECT,
};
