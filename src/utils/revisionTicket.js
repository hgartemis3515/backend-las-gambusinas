/**
 * Contador de revisiones del ticket impreso (baja de plato / descuento).
 */
function bumpRevisionTicketOnDoc(comanda) {
  if (!comanda) return 0;
  const n = Math.max(0, Math.floor(Number(comanda.revisionTicket) || 0)) + 1;
  comanda.revisionTicket = n;
  if (typeof comanda.markModified === 'function') {
    comanda.markModified('revisionTicket');
  }
  return n;
}

module.exports = { bumpRevisionTicketOnDoc };
