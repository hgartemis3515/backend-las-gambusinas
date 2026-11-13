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

function armarDetalleTicketAnulado({ ticket, tipo, comandas = [] } = {}) {
  const numeros = (comandas || []).map((c) => {
    const n = c?.numeroComandaDia != null && c.numeroComandaDia !== ''
      ? c.numeroComandaDia
      : c?.comandaNumber;
    if (n == null || n === '') return '';
    return `#${n}`;
  }).filter(Boolean);
  const mesa = ticket?.numMesa ?? comandas[0]?.mesaNumero ?? null;
  const cliente = ticket?.clienteNombre
    || (comandas || []).map((c) => c?.clienteNombre).find(Boolean)
    || '';
  const mozo = ticket?.nombreMozo || ticket?.mozoNombre || comandas[0]?.mozoNombre || '';
  const platos = (ticket?.platos || [])
    .filter((p) => p && p.eliminado !== true)
    .slice(0, 8)
    .map((p) => `${Number(p.cantidad) || 1}x ${p.nombre || 'plato'}`);
  const ticketNum = ticket?.ticketNumber != null ? `Ticket #${ticket.ticketNumber}` : 'Ticket';
  const tipoTxt = String(tipo || '').toUpperCase() === 'ADELANTADO' ? 'pago adelantado' : 'comanda';
  const resumen = [
    ticketNum,
    numeros.length ? `comanda ${numeros.join(' ')}` : '',
    mesa != null && mesa !== '' ? `mesa ${mesa}` : '',
    cliente,
    tipoTxt,
    platos.length ? platos.join(', ') : '',
  ].filter(Boolean).join(' · ');
  const primero = comandas[0] || {};
  const numeroDia = primero.numeroComandaDia != null && primero.numeroComandaDia !== ''
    ? primero.numeroComandaDia
    : (primero.comandaNumber ?? null);
  return { numeros, mesa, cliente, mozo, platos, resumen, tipoTxt, numeroDia };
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
  armarDetalleTicketAnulado,
};
