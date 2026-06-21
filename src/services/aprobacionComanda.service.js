/**
 * Servicio de aprobación de comandas — orquesta la lógica de negocio
 * cuando cocina aprueba o reporta un ticket de aprobación.
 *
 * NO cubre PPA (eso sigue en pagoAdelantadoService).
 * Los sockets se emiten a través de los helpers globales en events.js.
 */
const mongoose = require('mongoose');
const ticketAprobacionRepository = require('../repository/ticketAprobacion.repository');
const ticketPagoAdelantadoRepository = require('../repository/ticketPagoAdelantado.repository');
const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
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
    tipo: t.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA',
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
 * Detecta el tipo real de un ticket buscando en ambas colecciones.
 * Primero intenta en la colección del tipo indicado; si no lo encuentra,
 * prueba en la otra colección.
 * @returns {Promise<{tipo: 'COMANDA'|'ADELANTADO'}>}
 */
async function detectarTipoReal(ticketId, tipoHint) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const err = new Error('ID de ticket inválido');
    err.statusCode = 400;
    throw err;
  }

  // Intentar primero en la colección del tipo indicado
  if (tipoHint === 'ADELANTADO') {
    const ppa = await ticketPagoAdelantadoModel.findById(ticketId).select('_id').lean();
    if (ppa) return { tipo: 'ADELANTADO' };
    // Si no está en PPA, buscar en comandas
    const comanda = await ticketAprobacionModel.findById(ticketId).select('_id').lean();
    if (comanda) {
      logger.warn(`Ticket ${ticketId} indicado como ADELANTADO pero encontrado en TicketAprobacion. Corrigiendo tipo a COMANDA.`);
      return { tipo: 'COMANDA' };
    }
  } else {
    const comanda = await ticketAprobacionModel.findById(ticketId).select('_id').lean();
    if (comanda) return { tipo: 'COMANDA' };
    // Si no está en comandas, buscar en PPA
    const ppa = await ticketPagoAdelantadoModel.findById(ticketId).select('_id').lean();
    if (ppa) {
      logger.warn(`Ticket ${ticketId} indicado como COMANDA pero encontrado en TicketPagoAdelantado. Corrigiendo tipo a ADELANTADO.`);
      return { tipo: 'ADELANTADO' };
    }
  }

  const err = new Error('Ticket no encontrado en ninguna colección');
  err.statusCode = 404;
  throw err;
}

/**
 * Aprobar un ticket — delega al repositorio correspondiente según el tipo.
 * Si el tipo indicado no coincide con la colección donde está el ticket,
 * lo detecta automáticamente y corrige.
 * Devuelve el resultado del repositorio + datos para sockets.
 */
async function aprobarTicketUnificado(ticketId, tipo, usuarioId, usuarioNombre) {
  // Normalizar tipo
  const tipoNormalizado = String(tipo || '').toUpperCase() === 'ADELANTADO' ? 'ADELANTADO' : 'COMANDA';

  // Detectar tipo real del ticket en la base de datos
  const { tipo: tipoReal } = await detectarTipoReal(ticketId, tipoNormalizado);

  if (tipoReal === 'COMANDA') {
    const result = await ticketAprobacionRepository.aprobarTicket(ticketId, usuarioId, usuarioNombre);
    return { ...result, tipo: 'COMANDA' };
  }

  if (tipoReal === 'ADELANTADO') {
    const result = await ticketPagoAdelantadoRepository.aprobarTicket(ticketId, usuarioId, usuarioNombre);
    return { ...result, tipo: 'ADELANTADO' };
  }

  const err = new Error(`Tipo de ticket no reconocido: ${tipoReal}`);
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

/**
 * Tickets (comanda + PPA) asociados a una comanda, cualquier estado.
 */
async function obtenerTicketsPorComanda(comandaId) {
  if (!mongoose.Types.ObjectId.isValid(comandaId)) {
    const err = new Error('ID de comanda inválido');
    err.statusCode = 400;
    throw err;
  }

  const [ticketsComanda, ticketsPPA] = await Promise.all([
    ticketAprobacionRepository.obtenerTicketsPorComanda(comandaId),
    ticketPagoAdelantadoRepository.obtenerTicketsPorComanda(comandaId),
  ]);

  const items = [
    ...ticketsComanda.map((t) => ({
      ...t,
      tipo: t.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA',
      mozoNombre: t.mozoNombre || t.nombreMozo || t.mozo?.name || 'N/A',
      cantidadPlatos: (t.platos || []).length,
    })),
    ...ticketsPPA.map((t) => ({
      ...t,
      tipo: 'ADELANTADO',
      mozoNombre: t.mozoNombre || t.nombreMozo || t.mozo?.name || 'N/A',
      cantidadPlatos: (t.platos || []).length,
    })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return items;
}

/**
 * Editar ticket pendiente (admin). Detecta colección automáticamente.
 */
async function actualizarTicketUnificado(ticketId, tipoHint, data) {
  const tipoNormalizado = String(tipoHint || '').toUpperCase() === 'ADELANTADO' ? 'ADELANTADO' : 'COMANDA';
  const { tipo: tipoReal } = await detectarTipoReal(ticketId, tipoNormalizado);

  if (tipoReal === 'COMANDA') {
    const ticket = await ticketAprobacionRepository.actualizarTicketAdmin(ticketId, data);
    return { ticket, tipo: 'COMANDA' };
  }

  const ticket = await ticketPagoAdelantadoRepository.actualizarTicketAdmin(ticketId, data);
  return { ticket, tipo: 'ADELANTADO' };
}

/**
 * Eliminar/anular ticket pendiente (admin).
 * COMANDA → anula y revierte platos; ADELANTADO → rechaza con motivo.
 */
async function eliminarTicketUnificado(ticketId, tipoHint, motivo, usuarioId, usuarioNombre) {
  const tipoNormalizado = String(tipoHint || '').toUpperCase() === 'ADELANTADO' ? 'ADELANTADO' : 'COMANDA';
  const { tipo: tipoReal } = await detectarTipoReal(ticketId, tipoNormalizado);

  if (tipoReal === 'COMANDA') {
    const result = await ticketAprobacionRepository.eliminarTicketAdmin(
      ticketId, motivo, usuarioId, usuarioNombre
    );
    return { ...result, tipo: 'COMANDA' };
  }

  const result = await ticketPagoAdelantadoRepository.rechazarTicket(
    ticketId, motivo, usuarioId, usuarioNombre
  );
  return { ...result, tipo: 'ADELANTADO' };
}

module.exports = {
  obtenerTicketsUnificadosPendientes,
  obtenerTicketsPorComanda,
  aprobarTicketUnificado,
  actualizarTicketUnificado,
  eliminarTicketUnificado,
  reportarTicketComanda,
  detectarTipoReal,
};