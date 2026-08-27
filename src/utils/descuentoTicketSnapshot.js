/**
 * Adjunta monto/motivo de descuento al ticket de cocina.
 * Usa snapshot del ticket o, si falta, el boucher asociado.
 */
function adjuntarDescuentoTicket(ticket) {
  if (!ticket) return ticket;
  const boucher = ticket.boucher && typeof ticket.boucher === 'object' ? ticket.boucher : null;
  const monto = Number(ticket.montoDescuento ?? boucher?.montoDescuento ?? 0) || 0;
  const descuentos = Array.isArray(ticket.descuentos) && ticket.descuentos.length
    ? ticket.descuentos
    : (boucher?.descuentos || []);
  return {
    ...ticket,
    montoDescuento: monto,
    totalSinDescuento: ticket.totalSinDescuento ?? boucher?.totalSinDescuento ?? null,
    descuentos,
  };
}

const BOUCHER_DESCUENTO_SELECT = 'montoDescuento descuentos totalSinDescuento totalConDescuento';

module.exports = {
  adjuntarDescuentoTicket,
  BOUCHER_DESCUENTO_SELECT,
};
