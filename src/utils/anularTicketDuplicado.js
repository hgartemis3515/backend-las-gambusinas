/**
 * Anula un ticket duplicado: sale de la tabla de cocina y de los totales.
 * No revierte platos ni rechaza PPA (el ticket “bueno” sigue).
 */

function motivoDuplicadoValido(motivo) {
  const motivoLimpio = String(motivo || '').trim();
  if (motivoLimpio.length < 3) {
    const err = new Error('El motivo es obligatorio (mínimo 3 caracteres)');
    err.statusCode = 400;
    throw err;
  }
  return motivoLimpio;
}

function aplicarAnulacionDuplicado(ticket, motivoLimpio) {
  if (!ticket) return ticket;
  ticket.isActive = false;
  const nota = `[Duplicado anulado: ${motivoLimpio}]`;
  ticket.observaciones = ticket.observaciones
    ? `${ticket.observaciones}\n${nota}`
    : nota;
  return ticket;
}

async function anularTicketDuplicadoEnModelo(model, ticketId, motivo, usuarioNombre) {
  const motivoLimpio = motivoDuplicadoValido(motivo);
  const ticket = await model.findById(ticketId);
  if (!ticket) {
    const err = new Error('Ticket no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (ticket.isActive === false) {
    const err = new Error('El ticket ya estaba anulado');
    err.statusCode = 400;
    throw err;
  }
  aplicarAnulacionDuplicado(ticket, motivoLimpio);
  await ticket.save({ validateBeforeSave: false });
  return {
    ticket: typeof ticket.toObject === 'function' ? ticket.toObject() : ticket,
    comandasAfectadas: [],
    duplicado: true,
    anuladoPor: usuarioNombre || 'Admin',
  };
}

module.exports = {
  motivoDuplicadoValido,
  aplicarAnulacionDuplicado,
  anularTicketDuplicadoEnModelo,
};
