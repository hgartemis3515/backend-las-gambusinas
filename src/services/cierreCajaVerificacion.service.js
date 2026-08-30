/**
 * Servicio de Verificación de Tickets antes del Cierre de Caja
 *
 * Unifica tickets de comanda (TicketAprobacion) y pagos adelantados (TicketPagoAdelantado)
 * que pertenecen al período pendiente de cerrar y que aún no fueron incluidos en un cierre.
 *
 * Reglas (ver PLAN_CIERRE_CAJA_VERIFICACION_TICKETS.md):
 *   - Período = desde ultimoCierre.periodoFin hasta now (misma lógica que el cierre).
 *   - Solo tickets con verificacionCierre.incluidoEnCierre == null.
 *   - El cierre de caja se bloquea hasta que todos los tickets del período estén confirmados.
 */
const mongoose = require('mongoose');
const moment = require('moment-timezone');

const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
const CierreCajaRestaurante = require('../database/models/cierreCajaRestaurante.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const logger = require('../utils/logger');
const { aplicarDescuentoAVistaTicket, COMANDA_DESCUENTO_SELECT, BOUCHER_DESCUENTO_SELECT } = require('../utils/descuentoTicketSnapshot');
const { aplicarTotalesPedidoPPA } = require('../utils/totalesTicketPPA');
const {
  montoComandaNum,
  montoDescuentoComandaNum,
  cargarConfigMonedaEstadisticas,
} = require('../utils/estadisticasComandas');
const { obtenerUltimoCierreVigente } = require('../utils/cierreCajaReversion');

const COMANDA_CIERRE_SELECT = `${COMANDA_DESCUENTO_SELECT} status precioTotal precioTotalOriginal platos cantidades mesas mozos procesadoPor procesandoPor`;

const POPULATE_COMANDAS_TICKET = {
  path: 'comandas',
  select: COMANDA_CIERRE_SELECT,
  populate: { path: 'platos.plato', select: 'nombre precio categoria' },
};

const ZONA = 'America/Lima';
const FECHA_BASE_FALLBACK = new Date('2024-01-01');

/** Período pendiente de cerrar: desde el último cierre vigente hasta ahora. */
async function obtenerPeriodoPendiente() {
  const ultimoCierre = await obtenerUltimoCierreVigente(
    CierreCajaRestaurante,
    'fechaCierre periodoFin estado'
  );

  const periodoInicio = ultimoCierre?.periodoFin || FECHA_BASE_FALLBACK;
  const periodoFin = moment.tz(ZONA).toDate();

  return {
    ultimoCierre: ultimoCierre || null,
    periodoInicio,
    periodoFin,
  };
}

/** Filtro base para tickets aún no incluidos en un cierre. */
function filtroNoIncluidoEnCierre() {
  return {
    'verificacionCierre.incluidoEnCierre': null,
    isActive: { $ne: false },
  };
}

/**
 * Lista unificada de tickets del período pendiente de cierre.
 *
 * @returns {Promise<{ periodoInicio: Date, periodoFin: Date, tickets: Array, resumen: Object }>}
 */
async function listarTicketsParaVerificacion() {
  const { periodoInicio, periodoFin } = await obtenerPeriodoPendiente();
  await cargarConfigMonedaEstadisticas();

  const filtroRango = { createdAt: { $gte: periodoInicio, $lte: periodoFin } };

  // Tickets de aprobación de comandas (comanda completa o pago parcial)
  const [ticketsComanda, ticketsAdelantado] = await Promise.all([
    ticketAprobacionModel
      .find({ ...filtroRango, ...filtroNoIncluidoEnCierre() })
      .populate('mesa', 'nummesa estado nombreCombinado')
      .populate('mozo', 'name')
      .populate(POPULATE_COMANDAS_TICKET)
      .populate('boucher', `boucherNumber voucherId metodoPago ${BOUCHER_DESCUENTO_SELECT}`)
      .sort({ createdAt: 1 })
      .lean(),
    ticketPagoAdelantadoModel
      .find({ ...filtroRango, ...filtroNoIncluidoEnCierre() })
      .populate('mesa', 'nummesa estado nombreCombinado')
      .populate('mozo', 'name')
      .populate(POPULATE_COMANDAS_TICKET)
      .populate('boucher', `boucherNumber voucherId metodoPago ${BOUCHER_DESCUENTO_SELECT}`)
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const tickets = [
    ...ticketsComanda.map((t) => normalizarTicket(t, t.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA')),
    ...ticketsAdelantado.map((t) => normalizarTicket(t, 'ADELANTADO')),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const total = tickets.length;
  const confirmados = tickets.filter((t) => t.verificado).length;

  return {
    periodoInicio,
    periodoFin,
    tickets,
    resumen: {
      total,
      confirmados,
      pendientes: total - confirmados,
      puedeCerrar: confirmados === total,
    },
  };
}

function totalesDesdeComandasAsociadas(ticket) {
  const comandas = (ticket?.comandas || []).filter(
    (c) => c && typeof c === 'object' && Number.isFinite(Number(c.comandaNumber))
  );
  if (!comandas.length) return null;
  const total = Number(comandas.reduce((s, c) => s + montoComandaNum(c), 0).toFixed(2));
  const montoDescuento = Number(
    comandas.reduce((s, c) => s + montoDescuentoComandaNum(c), 0).toFixed(2)
  );
  const totalSinDescuento = Number(
    comandas.reduce((s, c) => {
      const neto = montoComandaNum(c);
      const desc = montoDescuentoComandaNum(c);
      const sin = Number(c.totalSinDescuento);
      const bruto = Number.isFinite(sin) && sin > 0 ? sin : neto + desc;
      return s + bruto;
    }, 0).toFixed(2)
  );
  return {
    total,
    subtotal: totalSinDescuento,
    montoDescuento,
    totalSinDescuento,
    descuentos: [],
  };
}

function totalesVistaCierre(t, tipo) {
  const desdeComandas = totalesDesdeComandasAsociadas(t);
  if (desdeComandas) return desdeComandas;
  const base = tipo === 'ADELANTADO' ? aplicarTotalesPedidoPPA(t) : t;
  const vista = aplicarDescuentoAVistaTicket(base);
  return {
    total: Number(vista.total) || 0,
    subtotal: Number(vista.subtotal) || Number(vista.totalSinDescuento) || 0,
    montoDescuento: Number(vista.montoDescuento) || 0,
    totalSinDescuento: vista.totalSinDescuento ?? null,
    descuentos: vista.descuentos || [],
  };
}

/** Normaliza un ticket (de cualquier colección) al formato unificado de la UI. */
function normalizarTicket(t, tipo) {
  const totales = totalesVistaCierre(t, tipo);
  return {
    id: t._id,
    ticketNumber: t.ticketNumber,
    tipo,
    estadoCocina: t.estado,
    mesa: t.mesa,
    numMesa: t.numMesa,
    mozo: t.mozo,
    nombreMozo: t.nombreMozo || t.mozoNombre || t.mozo?.name || null,
    comandas: t.comandas || [],
    comandasNumbers: t.comandasNumbers || [],
    pedido: t.pedido || null,
    total: totales.total,
    subtotal: totales.subtotal,
    montoDescuento: totales.montoDescuento,
    totalSinDescuento: totales.totalSinDescuento,
    descuentos: totales.descuentos,
    montoCobrado: t.montoCobrado != null ? Number(t.montoCobrado) : null,
    igv: t.igv || 0,
    moneda: t.moneda || 'PEN',
    metodoPago: t.metodoPago || null,
    boucher: t.boucher || null,
    voucherId: t.voucherId || null,
    montoRecibido: t.montoRecibido ?? null,
    vuelto: t.vuelto ?? null,
    cliente: t.cliente || null,
    clienteNombre: t.clienteNombre || null,
    clienteDni: t.clienteDni || null,
    observaciones: t.observaciones || '',
    createdAt: t.createdAt,
    verificado: Boolean(t.verificacionCierre?.confirmado),
    verificadoPorNombre: t.verificacionCierre?.confirmadoPorNombre || null,
    verificadoAt: t.verificacionCierre?.confirmadoAt || null,
  };
}

/**
 * Resumen corto (contador) para KPIs y para validar si se puede cerrar caja.
 */
async function obtenerResumenVerificacion() {
  const { periodoInicio, periodoFin } = await obtenerPeriodoPendiente();
  const filtroRango = { createdAt: { $gte: periodoInicio, $lte: periodoFin } };

  const [comandaTotal, comandaConfirmados, adelantadoTotal, adelantadoConfirmados] = await Promise.all([
    ticketAprobacionModel.countDocuments({ ...filtroRango, ...filtroNoIncluidoEnCierre() }),
    ticketAprobacionModel.countDocuments({
      ...filtroRango,
      ...filtroNoIncluidoEnCierre(),
      'verificacionCierre.confirmado': true,
    }),
    ticketPagoAdelantadoModel.countDocuments({ ...filtroRango, ...filtroNoIncluidoEnCierre() }),
    ticketPagoAdelantadoModel.countDocuments({
      ...filtroRango,
      ...filtroNoIncluidoEnCierre(),
      'verificacionCierre.confirmado': true,
    }),
  ]);

  const total = comandaTotal + adelantadoTotal;
  const confirmados = comandaConfirmados + adelantadoConfirmados;

  return {
    periodoInicio,
    periodoFin,
    total,
    confirmados,
    pendientes: total - confirmados,
    puedeCerrar: total === 0 || confirmados === total,
  };
}

/**
 * Detalle completo de un ticket para el modal de comprobación.
 * @param {string} ticketId
 * @param {'COMANDA'|'ADELANTADO'} tipoHint  Opcional: si no se indica, busca en ambas colecciones.
 */
async function obtenerDetalleTicket(ticketId, tipoHint) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const err = new Error('ID de ticket inválido');
    err.statusCode = 400;
    throw err;
  }

  await cargarConfigMonedaEstadisticas();

  const populateComun = [
    { path: 'mesa', select: 'nummesa estado nombreCombinado' },
    { path: 'mozo', select: 'name' },
    {
      path: 'comandas',
      select: COMANDA_CIERRE_SELECT,
      populate: {
        path: 'platos.plato',
        select: 'nombre precio categoria',
      },
    },
    { path: 'boucher', select: `boucherNumber voucherId metodoPago moneda ${BOUCHER_DESCUENTO_SELECT}` },
    { path: 'aprobadoPor', select: 'name' },
  ];

  // TicketAprobacion no tiene rechazadoPor; TicketPagoAdelantado sí.
  const populateComanda = [
    ...populateComun,
    { path: 'reportadoPor', select: 'name' },
  ];
  const populateAdelantado = [
    ...populateComun,
    { path: 'rechazadoPor', select: 'name' },
  ];

  let ticket = null;
  let tipo = null;

  if (tipoHint !== 'ADELANTADO') {
    ticket = await ticketAprobacionModel.findById(ticketId).populate(populateComanda).lean();
    if (ticket) tipo = ticket.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA';
  }

  if (!ticket && tipoHint !== 'COMANDA' && tipoHint !== 'PAGO_PARCIAL') {
    ticket = await ticketPagoAdelantadoModel.findById(ticketId).populate(populateAdelantado).lean();
    if (ticket) tipo = 'ADELANTADO';
  }

  if (!ticket) {
    const err = new Error('Ticket no encontrado');
    err.statusCode = 404;
    throw err;
  }

  return {
    ...normalizarTicket(ticket, tipo),
    platos: ticket.platos || [],
    comandasDetalle: ticket.comandas || [],
    aprobadoPor: ticket.aprobadoPor,
    aprobadoPorNombre: ticket.aprobadoPorNombre,
    fechaAprobacion: ticket.fechaAprobacion,
    reportadoPor: ticket.reportadoPor,
    reportadoPorNombre: ticket.reportadoPorNombre,
    fechaReporte: ticket.fechaReporte,
    motivoReporte: ticket.motivoReporte,
    rechazadoPor: ticket.rechazadoPor,
    motivoRechazo: ticket.motivoRechazo,
    fechaRechazo: ticket.fechaRechazo,
  };
}

/**
 * Confirma (verifica) un único ticket del período pendiente.
 */
async function confirmarTicket(ticketId, tipoHint, usuarioId, usuarioNombre) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const err = new Error('ID de ticket inválido');
    err.statusCode = 400;
    throw err;
  }

  const { periodoInicio, periodoFin } = await obtenerPeriodoPendiente();
  const usuarioObjId = toObjectId(usuarioId);
  const ts = moment.tz(ZONA).toDate();

  const update = {
    'verificacionCierre.confirmado': true,
    'verificacionCierre.confirmadoPor': usuarioObjId,
    'verificacionCierre.confirmadoPorNombre': usuarioNombre,
    'verificacionCierre.confirmadoAt': ts,
  };

  let actualizado = null;
  let tipoReal = null;

  const query = {
    _id: ticketId,
    createdAt: { $gte: periodoInicio, $lte: periodoFin },
    ...filtroNoIncluidoEnCierre(),
  };

  if (tipoHint !== 'ADELANTADO') {
    actualizado = await ticketAprobacionModel.findOneAndUpdate(query, { $set: update }, { new: true });
    if (actualizado) tipoReal = actualizado.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA';
  }
  if (!actualizado && tipoHint !== 'COMANDA') {
    actualizado = await ticketPagoAdelantadoModel.findOneAndUpdate(query, { $set: update }, { new: true });
    if (actualizado) tipoReal = 'ADELANTADO';
  }

  if (!actualizado) {
    const err = new Error('Ticket no encontrado o ya fue incluido en un cierre');
    err.statusCode = 404;
    throw err;
  }

  await registrarAuditoria(
    'TICKET_VERIFICADO_CIERRE',
    actualizado._id,
    usuarioObjId,
    usuarioNombre,
    {
      ticketNumber: actualizado.ticketNumber,
      tipo: tipoReal,
      numMesa: actualizado.numMesa,
      total: actualizado.total,
    }
  );

  return { ticket: normalizarTicket(actualizado, tipoReal), tipo: tipoReal };
}

/**
 * Confirma (verifica) todos los tickets pendientes de verificación del período.
 */
async function confirmarTodos(usuarioId, usuarioNombre) {
  const { periodoInicio, periodoFin } = await obtenerPeriodoPendiente();
  const usuarioObjId = toObjectId(usuarioId);
  const ts = moment.tz(ZONA).toDate();

  const queryBase = {
    createdAt: { $gte: periodoInicio, $lte: periodoFin },
    ...filtroNoIncluidoEnCierre(),
    'verificacionCierre.confirmado': { $ne: true },
  };

  const update = {
    'verificacionCierre.confirmado': true,
    'verificacionCierre.confirmadoPor': usuarioObjId,
    'verificacionCierre.confirmadoPorNombre': usuarioNombre,
    'verificacionCierre.confirmadoAt': ts,
  };

  const [resComanda, resAdelantado] = await Promise.all([
    ticketAprobacionModel.updateMany(queryBase, { $set: update }),
    ticketPagoAdelantadoModel.updateMany(queryBase, { $set: update }),
  ]);

  const totalActualizados = (resComanda?.modifiedCount || 0) + (resAdelantado?.modifiedCount || 0);

  await registrarAuditoria(
    'TICKETS_VERIFICADOS_CIERRE_MASIVO',
    null,
    usuarioObjId,
    usuarioNombre,
    {
      totalConfirmados: totalActualizados,
      periodoInicio,
      periodoFin,
    }
  );

  return { totalConfirmados: totalActualizados };
}

/**
 * Marca todos los tickets confirmados del período como incluidos en el cierre ejecutado.
 * Llamar después de guardar el documento de CierreCajaRestaurante.
 */
async function marcarTicketsComoIncluidosEnCierre(cierreId, periodoInicio, periodoFin) {
  if (!mongoose.Types.ObjectId.isValid(cierreId)) return;

  const query = {
    createdAt: { $gte: periodoInicio, $lte: periodoFin },
    ...filtroNoIncluidoEnCierre(),
    'verificacionCierre.confirmado': true,
  };

  const update = {
    'verificacionCierre.incluidoEnCierre': cierreId,
  };

  await Promise.all([
    ticketAprobacionModel.updateMany(query, { $set: update }),
    ticketPagoAdelantadoModel.updateMany(query, { $set: update }),
  ]);
}

/**
 * Quita la marca de incluidoEnCierre de tickets de un cierre revertido.
 * No toca confirmado: el período vuelve al estado previo a ejecutar el cierre.
 */
async function desmarcarTicketsDeCierre(cierreId) {
  if (!mongoose.Types.ObjectId.isValid(cierreId)) {
    return { ticketsComanda: 0, ticketsAdelantado: 0 };
  }
  const oid = toObjectId(cierreId);
  const query = { 'verificacionCierre.incluidoEnCierre': oid };
  const update = { $set: { 'verificacionCierre.incluidoEnCierre': null } };
  const [a, b] = await Promise.all([
    ticketAprobacionModel.updateMany(query, update),
    ticketPagoAdelantadoModel.updateMany(query, update),
  ]);
  return {
    ticketsComanda: a.modifiedCount || 0,
    ticketsAdelantado: b.modifiedCount || 0,
  };
}

/**
 * Verifica si el período está listo para ejecutar el cierre.
 * Lanza error si hay tickets sin confirmar.
 */
async function validarListoParaCerrar() {
  const resumen = await obtenerResumenVerificacion();
  if (!resumen.puedeCerrar) {
    const err = new Error(
      `Faltan confirmar ${resumen.pendientes} ticket(s) antes de ejecutar el cierre de caja`
    );
    err.statusCode = 400;
    err.code = 'VERIFICACION_INCOMPLETA';
    throw err;
  }
  return resumen;
}

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

async function registrarAuditoria(accion, entidadId, usuarioId, usuarioNombre, metadata) {
  try {
    await AuditoriaAcciones.create({
      accion,
      entidadId,
      entidadTipo: 'ticket_verificacion',
      usuario: usuarioId,
      usuarioNombre,
      metadata,
    });
  } catch (e) {
    logger.error('Error registrando auditoría de verificación de cierre', { error: e.message });
  }
}

module.exports = {
  obtenerPeriodoPendiente,
  listarTicketsParaVerificacion,
  obtenerResumenVerificacion,
  obtenerDetalleTicket,
  confirmarTicket,
  confirmarTodos,
  marcarTicketsComoIncluidosEnCierre,
  desmarcarTicketsDeCierre,
  validarListoParaCerrar,
  obtenerUltimoCierreVigente: () => obtenerUltimoCierreVigente(CierreCajaRestaurante),
};
