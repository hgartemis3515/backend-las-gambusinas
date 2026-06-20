/**
 * Servicio de aprobación de comandas — orquesta la lógica de negocio
 * cuando cocina aprueba o reporta un ticket de aprobación.
 *
 * NO cubre PPA (eso sigue en pagoAdelantadoService).
 * Los sockets se emiten a través de los helpers globales en events.js.
 */
const ticketAprobacionRepository = require('../repository/ticketAprobacion.repository');
const ticketPagoAdelantadoRepository = require('../repository/ticketPagoAdelantado.repository');
const mesasModel = require('../database/models/mesas.model');
const logger = require('../utils/logger');

/**
 * Obtener lista unificada de tickets pendientes de aprobación:
 *   - Tickets de comandas completas (TicketAprobacion, tipo 'comanda_completa')
 *   - Tickets de pagos adelantados (TicketPagoAdelantado, tipo PPA)
 *
 * Devuelve un array combinado con campo `tipo` para que la bandeja
 * de cocina pueda distinguir y mostrar el badge correspondiente.
 */
async function obtenerTicketsUnificadosPendientes(fecha) {
  const fechaQuery = fecha || null;

  // Tickets de comandas completas
  const ticketsComanda = await ticketAprobacionRepository.obtenerTicketsPendientes(fechaQuery);
  const comandaItems = ticketsComanda.map((t) => ({
    ...t,
    tipo: 'COMANDA',
  }));

  // Tickets PPA pendientes
  const ticketsPPA = await ticketPagoAdelantadoRepository.obtenerTicketsPendientes(fechaQuery);
  const ppaItems = ticketsPPA.map((t) => ({
    ...t,
    tipo: 'ADELANTADO',
  }));

  // Ordenar combinados por fecha de creación
  const items = [...comandaItems, ...ppaItems].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0);
    const dateB = new Date(b.createdAt || 0);
    return dateA - dateB;
  });

  return items;
}

/**
 * Aprobar un ticket — delega al repositorio correspondiente según el tipo.
 * Devuelve el resultado del repositorio + datos para sockets.
 */
async function aprobarTicketUnificado(ticketId, tipo, usuarioId, usuarioNombre) {
  if (tipo === 'COMANDA') {
    const result = await ticketAprobacionRepository.aprobarTicket(ticketId, usuarioId, usuarioNombre);
    return { ...result, tipo: 'COMANDA' };
  }

  if (tipo === 'ADELANTADO') {
    const result = await ticketPagoAdelantadoRepository.aprobarTicket(ticketId, usuarioId, usuarioNombre);
    return { ...result, tipo: 'ADELANTADO' };
  }

  const err = new Error(`Tipo de ticket no reconocido: ${tipo}`);
  err.statusCode = 400;
  throw err;
}

/**
 * Reportar un ticket de comanda completa.
 * NO aplica a PPA (eso sigue siendo "rechazar" en la UI pero internamente
 * puede mapearse a reportar en fase futura).
 */
async function reportarTicketComanda(ticketId, motivo, usuarioId, usuarioNombre) {
  const result = await ticketAprobacionRepository.reportarTicket(ticketId, motivo, usuarioId, usuarioNombre);
  return { ...result, tipo: 'COMANDA' };
}

module.exports = {
  obtenerTicketsUnificadosPendientes,
  aprobarTicketUnificado,
  reportarTicketComanda,
};