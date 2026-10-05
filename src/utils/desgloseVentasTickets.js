'use strict';

/**
 * Ventas pendientes / pagadas de una comanda vigente, una sola vez.
 *
 * El total es el de la fila (`totalNetoComanda`). Se parte así:
 * - líneas (o monto de abono) con ticket activo `aprobado` → pagadas
 * - el resto → pendientes (ticket `pendiente_aprobacion` o todavía sin cobro aprobado)
 *
 * `pagoAdelantado.cobrado` no decide: el adelanto nace pendiente hasta que
 * el ticket se aprueba. Reserva programada y para llevar en `pedido` /
 * `en_espera` entran a pagadas si el ticket ya está aprobado.
 * Entregar no cobra. Un ticket rechazado o inactivo no suma.
 * Sin ticket activo, status `pagado` / `completado` (o pago forzado) va entero a pagadas.
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

function ticketCuenta(t) {
  if (!t || t.isActive === false) return false;
  const est = String(t.estado || '').toLowerCase();
  return est === 'aprobado' || est === 'pendiente_aprobacion';
}

function subtotalLinea(p) {
  const sub = Number(p && p.subtotal);
  if (Number.isFinite(sub) && sub > 0) return sub;
  return (Number(p && (p.precio || p.precioUnitario)) || 0) * (Number(p && p.cantidad) || 1);
}

function idLinea(p) {
  if (!p) return '';
  return String(p.platoLineaId || p.lineaId || '');
}

function platosTicketEnComanda(t, comandaId) {
  const platos = (Array.isArray(t && t.platos) ? t.platos : []).filter((p) => p && !p.eliminado && !p.anulado);
  const ids = idsComandaDeTicket(t, 0);
  if (ids.length <= 1) return platos;
  const cid = String(comandaId);
  return platos.filter((p) => idDeRef(p.comandaId) === cid);
}

/**
 * Monto aprobado de una comanda, tope `amount`.
 * Con líneas, cada `platoLineaId` entra una vez al subtotal de la fila.
 * Sin líneas, un ticket cuyo total cubre la comanda la cierra; los parciales se suman.
 */
function coberturaAprobada(fila, aprobados, amount) {
  const lineasFila = new Map();
  for (const p of (fila && fila.platos) || []) {
    const id = idLinea(p) || (p && p._id != null ? String(p._id) : '');
    if (id) lineasFila.set(id, Number(p.subtotal) || 0);
  }
  const cubiertas = new Map();
  let montoSinLinea = 0;

  for (const t of aprobados) {
    if (t.pagoForzado === true || String(t.origen || '').toLowerCase() === 'forzado') return amount;
    const platos = platosTicketEnComanda(t, fila && fila._id);
    const conLinea = platos.filter((p) => idLinea(p));
    if (conLinea.length && lineasFila.size) {
      let matched = 0;
      for (const p of conLinea) {
        const id = idLinea(p);
        if (!lineasFila.has(id) || cubiertas.has(id)) continue;
        cubiertas.set(id, lineasFila.get(id));
        matched += 1;
      }
      if (matched > 0) continue;
    } else if (conLinea.length) {
      for (const p of conLinea) {
        const id = idLinea(p);
        if (cubiertas.has(id)) continue;
        cubiertas.set(id, subtotalLinea(p));
      }
      continue;
    }
    const totalT = Number(t.total);
    const tieneTotal = Number.isFinite(totalT) && totalT > 0;
    if (!tieneTotal || totalT + 0.009 >= amount) return amount;
    montoSinLinea += totalT;
  }

  if (lineasFila.size && cubiertas.size >= lineasFila.size) return amount;
  let cov = montoSinLinea;
  for (const s of cubiertas.values()) cov += s;
  return cov;
}

function ticketsDeComanda(tickets, comandaId) {
  const cid = String(comandaId);
  const out = [];
  const seen = new Set();
  (tickets || []).forEach((t, index) => {
    if (!ticketCuenta(t)) return;
    const ids = idsComandaDeTicket(t, index);
    if (!ids.includes(cid)) return;
    const key = t._id != null ? String(t._id) : `i:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  return out;
}

/** Parte el total de la fila en pagada y pendiente. Las dos suman el total. */
function partirTotalFila(fila, tickets) {
  const amount = round2(Number(fila && fila.total) || 0);
  const lista = ticketsDeComanda(tickets, fila && fila._id);
  const aprobados = lista.filter((t) => String(t.estado).toLowerCase() === 'aprobado');
  const hayPendiente = lista.some((t) => String(t.estado).toLowerCase() === 'pendiente_aprobacion');
  const st = String(fila && fila.status || '').toLowerCase();
  const cerrada = st === 'pagado' || st === 'completado' || (fila && fila.pagoForzado === true);

  if (!aprobados.length) {
    if (!hayPendiente && cerrada) return { pagada: amount, pendiente: 0 };
    return { pagada: 0, pendiente: amount };
  }

  let cobertura = coberturaAprobada(fila, aprobados, amount);
  if (!hayPendiente && cerrada) cobertura = amount;
  const pagada = round2(Math.min(amount, Math.max(0, cobertura)));
  const pendiente = round2(Math.max(0, amount - pagada));
  return { pagada, pendiente };
}

function filaEsVentaPagada(fila, lastTicket) {
  const tickets = lastTicket ? [lastTicket] : [];
  const { pagada, pendiente } = partirTotalFila(fila, tickets);
  const amount = round2(Number(fila && fila.total) || 0);
  return pendiente <= 0.009 && pagada + 0.009 >= amount && (amount > 0 || pagada > 0);
}

/**
 * Totales = suma de comandas vigentes (misma cifra que reportes / cierre).
 * El ticket solo dice qué parte del total ya está aprobada.
 */
function acumularDesgloseDesdeFilas(filas, tickets) {
  const out = { ventasPendientes: 0, ventasAprobadas: 0, porMozo: new Map() };
  for (const f of filas || []) {
    if (!f) continue;
    const amount = Number(f.total) || 0;
    if (!(amount > 0) && amount !== 0) continue;
    const { pagada, pendiente } = partirTotalFila(f, tickets);
    out.ventasAprobadas += pagada;
    out.ventasPendientes += pendiente;
    const mozoId = f.mozo != null ? String(f.mozo) : '';
    if (!mozoId) continue;
    if (!out.porMozo.has(mozoId)) {
      out.porMozo.set(mozoId, { ventasPendientes: 0, ventasAprobadas: 0 });
    }
    const m = out.porMozo.get(mozoId);
    m.ventasAprobadas += pagada;
    m.ventasPendientes += pendiente;
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

const CAMPOS_DESGLOSE = 'estado total mozo comandas createdAt ticketNumber tipo origen cobroPorCantidad pagoForzado isActive platos.platoLineaId platos.subtotal platos.precio platos.cantidad platos.comandaId platos.eliminado platos.anulado';

async function desgloseVentasPorAprobacion(inicio, fin) {
  const { listarFilasEstadisticas } = require('./estadisticasComandas');
  const match = matchRango(inicio, fin);
  const [filas, ticketsComanda, ticketsPpa] = await Promise.all([
    listarFilasEstadisticas(inicio, fin),
    ticketAprobacionModel.find(match).select(CAMPOS_DESGLOSE).lean(),
    ticketPagoAdelantadoModel.find(match).select(CAMPOS_DESGLOSE).lean()
  ]);
  return acumularDesgloseDesdeFilas(filas, [...(ticketsComanda || []), ...(ticketsPpa || [])], opts);
}

module.exports = {
  desgloseVentasPorAprobacion,
  ultimoTicketPorComanda,
  acumularTicketsUnicos,
  acumularDesgloseDesdeFilas,
  partirTotalFila,
  filaEsVentaPagada
};
