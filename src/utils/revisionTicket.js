/**
 * Contador de revisiones del ticket. Cada llamada suma 1.
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
