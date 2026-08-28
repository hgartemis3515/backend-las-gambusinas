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

function primerMontoPositivo(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
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
    : (fromComanda.descuentos.length ? fromComanda.descuentos : (boucher?.descuentos || []));
  const monto = primerMontoPositivo(ticket.montoDescuento, fromComanda.monto, boucher?.montoDescuento);
  return {
    ...ticket,
    montoDescuento: monto,
    totalSinDescuento: ticket.totalSinDescuento
      ?? fromComanda.totalSinDescuento
      ?? boucher?.totalSinDescuento
      ?? null,
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

function idRef(id) {
  if (!id) return '';
  if (typeof id === 'object') return String(id._id || id);
  return String(id);
}

function subtotalPlatosComanda(comanda) {
  return (comanda?.platos || []).reduce((s, p, i) => {
    if (!p || p.eliminado || p.anulado) return s;
    const precio = p.precioUnitario != null ? Number(p.precioUnitario) : (p.plato?.precio || p.precio || 0);
    const cant = comanda.cantidades?.[i] ?? p.cantidad ?? 1;
    return s + (Number(precio) || 0) * (Number(cant) || 1);
  }, 0);
}

function subtotalPlatosDocDeComanda(doc, comanda) {
  const cid = idRef(comanda._id);
  const num = Number(comanda.comandaNumber);
  const platos = doc?.platos || [];
  const filtrados = platos.filter((p) => {
    if (p?.comandaId && idRef(p.comandaId) === cid) return true;
    if (p?.comandaNumber != null && Number(p.comandaNumber) === num) return true;
    return false;
  });
  const fuente = filtrados.length ? filtrados : ((doc.comandas || []).length <= 1 ? platos : []);
  return fuente.reduce((s, p) => s + (Number(p.subtotal) || (Number(p.precio) || 0) * (Number(p.cantidad) || 1)), 0);
}

function ratioComandaEnDoc(doc, comanda) {
  const subDoc = subtotalPlatosDocDeComanda(doc, comanda);
  const subCom = subtotalPlatosComanda(comanda);
  if (subDoc > 0 && subCom > 0) return Math.min(1, subDoc / subCom);
  return 1;
}

/**
 * Aplica (o quita) el descuento de UNA comanda sobre un ticket/boucher ya cobrado.
 * Funciona después del pago: ajusta por delta, también en bouchers de varias comandas.
 */
function aplicarDescuentoADocDesdeComanda(doc, comanda) {
  if (!doc || !comanda) return doc;
  const ratio = ratioComandaEnDoc(doc, comanda);
  const num = Number(comanda.comandaNumber);
  const pct = Number(comanda.descuento) || 0;
  const montoNuevo = Number(((Number(comanda.montoDescuento) || 0) * ratio).toFixed(2));

  const descuentos = Array.isArray(doc.descuentos) ? doc.descuentos.slice() : [];
  const idx = descuentos.findIndex((d) => Number(d.comandaNumber) === num);
  const prevMonto = idx >= 0 ? Number(descuentos[idx].monto) || 0 : 0;

  const totalActual = Number(doc.total) || 0;
  const descActual = Number(doc.montoDescuento) || 0;
  const brutoGuardado = Number(doc.totalSinDescuento);
  const bruto = Number.isFinite(brutoGuardado) && brutoGuardado > 0
    ? brutoGuardado
    : Number((totalActual + descActual).toFixed(2));

  const montoDescNuevo = Number(Math.max(0, descActual - prevMonto + montoNuevo).toFixed(2));
  const totalNuevo = Number(Math.max(0, bruto - montoDescNuevo).toFixed(2));

  doc.totalSinDescuento = bruto;
  doc.montoDescuento = montoDescNuevo;
  doc.total = totalNuevo;
  if (doc.totalConDescuento != null || montoDescNuevo > 0 || pct > 0) {
    doc.totalConDescuento = totalNuevo;
  }

  if (montoNuevo > 0 || pct > 0) {
    const entry = {
      comandaNumber: comanda.comandaNumber,
      porcentaje: pct,
      motivo: comanda.motivoDescuento || '',
      monto: montoNuevo,
      aplicadoPor: comanda.descuentoAplicadoPor || null,
    };
    if (idx >= 0) descuentos[idx] = entry;
    else descuentos.push(entry);
    doc.descuentos = descuentos;
  } else {
    doc.descuentos = descuentos.filter((d) => Number(d.comandaNumber) !== num);
    if (!doc.descuentos.length) {
      doc.montoDescuento = 0;
      doc.total = bruto;
      if (doc.totalConDescuento != null) doc.totalConDescuento = bruto;
    }
  }
  return doc;
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
  aplicarDescuentoADocDesdeComanda,
  ratioComandaEnDoc,
  snapshotDesdeComandas,
  BOUCHER_DESCUENTO_SELECT,
  COMANDA_DESCUENTO_SELECT,
};
