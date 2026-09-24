'use strict';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Decide si el monto es un abono o cierra el saldo.
 * Sin monto, cobra el saldo entero (un solo pago).
 */
function decidirMontoCobro(montoCobro, saldo) {
  const saldoR = round2(Math.max(0, Number(saldo) || 0));
  if (saldoR <= 0.009) {
    const err = new Error('Esta cuenta ya no tiene saldo por cobrar');
    err.statusCode = 400;
    throw err;
  }
  const sinMonto = montoCobro == null || montoCobro === '';
  const pedido = sinMonto ? saldoR : round2(Number(montoCobro));
  if (!Number.isFinite(pedido) || pedido <= 0) {
    const err = new Error('El monto a cobrar debe ser mayor a cero');
    err.statusCode = 400;
    throw err;
  }
  if (pedido + 0.009 < saldoR) {
    return { monto: pedido, esAbono: true, saldo: saldoR };
  }
  return { monto: saldoR, esAbono: false, saldo: saldoR };
}

async function sumaAbonosCobroPorCantidad(comandaIds) {
  const ids = (comandaIds || []).filter(Boolean);
  if (!ids.length) return 0;
  const Ticket = require('../database/models/ticketAprobacion.model');
  const Tpa = require('../database/models/ticketPagoAdelantado.model');
  const q = {
    comandas: { $in: ids },
    cobroPorCantidad: true,
    estado: { $in: ['pendiente_aprobacion', 'aprobado'] },
  };
  const [a, b] = await Promise.all([
    Ticket.find(q).select('total').lean(),
    Tpa.find(q).select('total').lean(),
  ]);
  return round2([...a, ...b].reduce((s, t) => s + (Number(t.total) || 0), 0));
}

module.exports = {
  round2,
  decidirMontoCobro,
  sumaAbonosCobroPorCantidad,
};
