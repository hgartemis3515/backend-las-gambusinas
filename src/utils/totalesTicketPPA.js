/**
 * Totales de un TicketPagoAdelantado para impresión y listados.
 *
 * En reservas, `ticket.total` se usó como monto cobrado (0 si “sin adelanto”),
 * mientras las líneas sí tienen subtotales. El total de la comanda es la suma
 * de platos; el cobrado vive en `montoCobrado` / `reserva.pagoAdelantado.montoPagado`.
 */

function sumarSubtotalesPlatosTicket(platos) {
  if (!Array.isArray(platos) || platos.length === 0) return 0;
  const suma = platos.reduce((acc, p) => {
    const sub = Number(p?.subtotal);
    if (Number.isFinite(sub)) return acc + sub;
    const precio = Number(p?.precio) || 0;
    const cantidad = Number(p?.cantidad) || 1;
    return acc + precio * cantidad;
  }, 0);
  return Number(suma.toFixed(2));
}

function resolverTotalesPedidoPPA(ticket) {
  const sumaPlatos = sumarSubtotalesPlatosTicket(ticket?.platos);
  const totalGuardado = Number(ticket?.total);
  const subtotalGuardado = Number(ticket?.subtotal);
  const esReserva = ticket?.origen === 'reserva';

  if (esReserva && sumaPlatos > 0) {
    return { subtotal: sumaPlatos, total: sumaPlatos };
  }
  if ((!Number.isFinite(totalGuardado) || totalGuardado === 0) && sumaPlatos > 0) {
    return { subtotal: sumaPlatos, total: sumaPlatos };
  }
  return {
    subtotal: Number.isFinite(subtotalGuardado) ? subtotalGuardado : 0,
    total: Number.isFinite(totalGuardado) ? totalGuardado : 0,
  };
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
