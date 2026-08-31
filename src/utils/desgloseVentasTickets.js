'use strict';

/**
 * Ventas pendientes / aprobadas según la tabla de tickets de cocina
 * (TicketAprobacion + TicketPagoAdelantado).
 * Pendiente = estado pendiente_aprobacion (aún no se aprobó ni se forzó).
 * Aprobada  = estado aprobado (incluye pago forzado desde caja).
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

const pipelinePorEstadoMozo = [
  {
    $group: {
      _id: { estado: '$estado', mozo: '$mozo' },
      total: { $sum: { $ifNull: ['$total', 0] } }
    }
  }
];

function acumular(rows, out) {
  for (const r of rows || []) {
    const est = r._id && r._id.estado;
    const t = Number(r.total) || 0;
    if (est === 'pendiente_aprobacion') out.ventasPendientes += t;
    else if (est === 'aprobado') out.ventasAprobadas += t;
    const mozoId = r._id && r._id.mozo != null ? String(r._id.mozo) : '';
    if (!mozoId) continue;
    if (!out.porMozo.has(mozoId)) {
      out.porMozo.set(mozoId, { ventasPendientes: 0, ventasAprobadas: 0 });
    }
    const m = out.porMozo.get(mozoId);
    if (est === 'pendiente_aprobacion') m.ventasPendientes += t;
    else if (est === 'aprobado') m.ventasAprobadas += t;
  }
}

async function desgloseVentasPorAprobacion(inicio, fin) {
  const match = matchRango(inicio, fin);
  const pipeline = [{ $match: match }, ...pipelinePorEstadoMozo];
  const [ticketsComanda, ticketsPpa] = await Promise.all([
    ticketAprobacionModel.aggregate(pipeline),
    ticketPagoAdelantadoModel.aggregate(pipeline)
  ]);
  const out = { ventasPendientes: 0, ventasAprobadas: 0, porMozo: new Map() };
  acumular(ticketsComanda, out);
  acumular(ticketsPpa, out);
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

module.exports = { desgloseVentasPorAprobacion };
