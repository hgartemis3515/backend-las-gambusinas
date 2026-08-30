/**
 * Totales de un TicketPagoAdelantado para impresión y listados.
 *
 * En reservas, `ticket.total` se usó como monto cobrado (0 si “sin adelanto”),
 * mientras las líneas sí tienen subtotales. El total de la comanda es la suma
 * de platos; el cobrado vive en `montoCobrado` / `reserva.pagoAdelantado.montoPagado`.
 */

const { resolverBrutoYNeto, subtotalLineaSnapshot } = require('./descuentoTicketSnapshot');

function sumarSubtotalesPlatosTicket(platos) {
  if (!Array.isArray(platos) || platos.length === 0) return 0;
  const suma = platos.reduce((acc, p) => acc + subtotalLineaSnapshot(p), 0);
  return Number(suma.toFixed(2));
}

function resolverTotalesPedidoPPA(ticket) {
  const sumaPlatos = sumarSubtotalesPlatosTicket(ticket?.platos);
  const totalGuardado = Number(ticket?.total);
  const subtotalGuardado = Number(ticket?.subtotal);
  const esReserva = ticket?.origen === 'reserva';

  let subtotal;
  let total;
  if (esReserva && sumaPlatos > 0) {
    subtotal = sumaPlatos;
    total = sumaPlatos;
  } else if ((!Number.isFinite(totalGuardado) || totalGuardado === 0) && sumaPlatos > 0) {
    subtotal = sumaPlatos;
    total = sumaPlatos;
  } else {
    subtotal = Number.isFinite(subtotalGuardado) ? subtotalGuardado : 0;
    total = Number.isFinite(totalGuardado) ? totalGuardado : 0;
  }

  const { bruto, neto, montoDesc } = resolverBrutoYNeto({
    ...ticket,
    subtotal,
    total,
  }, sumaPlatos);
  if (montoDesc > 0) {
    return { subtotal: bruto, total: neto };
  }
  return { subtotal, total };
}

function aplicarTotalesPedidoPPA(ticket) {
  if (!ticket) return ticket;
  const { subtotal, total } = resolverTotalesPedidoPPA(ticket);
  return { ...ticket, subtotal, total };
}

function resolverMontoCajaPPA(ticket) {
  if (!ticket) return 0;
  if (ticket.montoCobrado != null && Number.isFinite(Number(ticket.montoCobrado))) {
    return Number(ticket.montoCobrado);
  }
  return Number(ticket.total) || 0;
}

module.exports = {
  sumarSubtotalesPlatosTicket,
  resolverTotalesPedidoPPA,
  aplicarTotalesPedidoPPA,
  resolverMontoCajaPPA,
};
