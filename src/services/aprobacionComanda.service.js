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
const comandaModel = require('../database/models/comanda.model');
const boucherModel = require('../database/models/boucher.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const logger = require('../utils/logger');
const { resolverComandasNumbers } = require('../utils/comandasNumbers');

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

async function totalPendienteCobroMozo(mozoId) {
  if (!mozoId || !mongoose.Types.ObjectId.isValid(String(mozoId))) {
    return 0;
  }
  const mid = new mongoose.Types.ObjectId(String(mozoId));
  const base = { mozo: mid, isActive: { $ne: false } };
  const [a, b] = await Promise.all([
    ticketAprobacionModel.aggregate([
      { $match: { ...base, estado: { $in: ['pendiente_aprobacion', 'reportado'] } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } },
    ]),
    ticketPagoAdelantadoModel.aggregate([
      { $match: { ...base, estado: 'pendiente_aprobacion' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$total', 0] } } } },
    ]),
  ]);
  const suma = (a[0]?.total || 0) + (b[0]?.total || 0);
  return Math.round(Number(suma) * 100) / 100;
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
    const ticketDoc = await ticketAprobacionModel.findById(ticketId).select('boucher origen estado').lean();
    if (ticketDoc && ticketDoc.estado === 'pendiente_aprobacion' && !ticketDoc.boucher) {
      const err = new Error('Este ticket aún no tiene cobro. Use Forzar pago o espere la solicitud del mozo.');
      err.statusCode = 400;
      throw err;
    }
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
  const { ticketEsAltaSinPago } = require('../utils/ticketAltaComanda');
  const ticketDoc = await ticketAprobacionModel.findById(ticketId).select('boucher origen estado').lean();
  if (ticketEsAltaSinPago(ticketDoc) || (ticketDoc && ticketDoc.estado === 'pendiente_aprobacion' && !ticketDoc.boucher)) {
    const err = new Error('No se puede reportar un ticket sin cobro. Use Forzar pago o espere la solicitud del mozo.');
    err.statusCode = 400;
    throw err;
  }
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
      cantidadPlatos: (t.platos || []).filter((p) => p && !p.eliminado && !p.anulado).length,
    })),
    ...ticketsPPA.map((t) => ({
      ...t,
      tipo: 'ADELANTADO',
      mozoNombre: t.mozoNombre || t.nombreMozo || t.mozo?.name || 'N/A',
      cantidadPlatos: (t.platos || []).filter((p) => p && !p.eliminado && !p.anulado).length,
    })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return items;
}

function toOid(id) {
  if (!id) return null;
  const s = String(id);
  return mongoose.Types.ObjectId.isValid(s) && s.length === 24
    ? new mongoose.Types.ObjectId(s)
    : null;
}

function tipoServicioDeLinea(p) {
  if (!p) return 'mesa';
  if (p.tipoServicio === 'para_llevar' || p.paraLlevar === true) return 'para_llevar';
  const raw = String(p.tipoServicio || '').toLowerCase().trim().replace(/\s+/g, '_');
  if (raw === 'para_llevar' || raw === 'llevar') return 'para_llevar';
  return 'mesa';
}

/**
 * El ticket ya aprobado se crea desde comandas.html sobre comandas vigentes,
 * incluidas las ya pagadas (IsActive=false). Solo se bloquea si no existe o está eliminada.
 */
function assertComandaParaTicketYaAprobado(comanda) {
  if (!comanda) {
    const err = new Error('Comanda no encontrada');
    err.statusCode = 404;
    throw err;
  }
  if (comanda.eliminada === true) {
    const err = new Error('La comanda está eliminada');
    err.statusCode = 404;
    throw err;
  }
}

function armarSnapshotYTotales(comanda) {
  const platosSnapshot = [];
  (comanda.platos || []).forEach((p, i) => {
    if (!p || p.eliminado || p.anulado) return;
    const cantidad = Number(p.cantidad || comanda.cantidades?.[i] || 1) || 1;
    const cat = p.plato && typeof p.plato === 'object' ? p.plato : null;
    const precio = Number(p.precioUnitario ?? p.precio ?? cat?.precio) || 0;
    const tipoServicio = tipoServicioDeLinea(p);
    platosSnapshot.push({
      comandaId: comanda._id,
      comandaNumber: comanda.comandaNumber,
      platoLineaId: p._id || null,
      plato: cat?._id || p.plato || null,
      platoId: p.platoId || cat?.id || null,
      nombre: cat?.nombre || p.nombre || 'Plato',
      precio,
      cantidad,
      subtotal: Number((precio * cantidad).toFixed(2)),
      tipoServicio,
      complementosSeleccionados: (p.complementosSeleccionados || []).map((c) => ({
        grupo: c.grupo || '',
        opcion: c.opcion || '',
        cantidad: Number(c.cantidad) || 1,
        precio: Number(c.precio) || 0,
        pronombre: c.pronombre || '',
      })),
      notaEspecial: p.notaEspecial || '',
      precioBase: p.precioBase != null ? p.precioBase : null,
      extraComplementos: p.extraComplementos != null ? p.extraComplementos : 0,
      precioUnitario: p.precioUnitario != null ? p.precioUnitario : precio,
      mostrarResumenComplementos: !!p.mostrarResumenComplementos,
      resumenComplementosImpresion: {
        mostrarCantidad: p.resumenComplementosImpresion?.mostrarCantidad !== false,
        mostrarMontoExtra: p.resumenComplementosImpresion?.mostrarMontoExtra !== false,
      },
    });
  });
  const subtotal = Number(platosSnapshot.reduce((s, p) => s + (Number(p.subtotal) || 0), 0).toFixed(2));
  const montoDescuento = Number(comanda.montoDescuento) || 0;
  const totalSinDescuento = Number(comanda.totalSinDescuento) > 0
    ? Number(comanda.totalSinDescuento)
    : subtotal;
  const totalNeto = Number(comanda.totalCalculado) > 0
    ? Number(Number(comanda.totalCalculado).toFixed(2))
    : Number(Math.max(0, totalSinDescuento - montoDescuento).toFixed(2));
  return { platosSnapshot, subtotal, montoDescuento, totalSinDescuento, totalNeto };
}

async function cargarComandaParaTicket(comandaId) {
  return comandaModel.findById(comandaId)
    .populate('platos.plato', 'nombre nombreCocina precio id')
    .populate('mozos', 'name')
    .populate({ path: 'mesas', select: 'nummesa estado area', populate: { path: 'area', select: 'nombre' } })
    .populate('cliente', 'nombre dni');
}

/**
 * Ticket PENDIENTE al crear la comanda. Caja lo ve de inmediato. No cambia la mesa.
 */
async function crearTicketPendienteDesdeComanda(comandaIdOrDoc) {
  const comandaId = comandaIdOrDoc?._id || comandaIdOrDoc;
  if (!mongoose.Types.ObjectId.isValid(comandaId)) return null;

  const existentes = await ticketAprobacionRepository.obtenerTicketsPorComanda(comandaId);
  if (existentes.some((t) => t.isActive !== false && t.estado !== 'reportado')) {
    return existentes[0];
  }
  const tpa = await ticketPagoAdelantadoModel.findOne({
    comandas: comandaId,
    isActive: { $ne: false },
  }).select('_id').lean();
  if (tpa) return null;

  const comanda = (comandaIdOrDoc && comandaIdOrDoc.platos)
    ? comandaIdOrDoc
    : await cargarComandaParaTicket(comandaId);
  if (!comanda || comanda.eliminada === true || comanda.IsActive === false) return null;

  const mesaId = comanda.mesas?._id || comanda.mesas;
  const numMesa = comanda.mesas?.nummesa ?? comanda.mesaNumero;
  const mozoId = comanda.mozos?._id || comanda.mozos;
  const nombreMozo = comanda.mozos?.name || comanda.mozoNombre || 'N/A';
  if (!mesaId || numMesa == null || !mozoId) return null;

  const { platosSnapshot, subtotal, montoDescuento, totalSinDescuento, totalNeto } = armarSnapshotYTotales(comanda);
  if (platosSnapshot.length === 0) return null;

  const ticket = await ticketAprobacionRepository.crearTicketAprobacion({
    tipo: 'comanda_completa',
    estado: 'pendiente_aprobacion',
    origen: 'alta_comanda',
    comandas: [comanda._id],
    comandasNumbers: resolverComandasNumbers({
      comandasNumbers: [comanda.comandaNumber],
      platos: platosSnapshot,
    }),
    mesa: mesaId,
    numMesa,
    mozo: mozoId,
    nombreMozo,
    mozoNombre: nombreMozo,
    pedido: comanda.pedido || null,
    platos: platosSnapshot,
    subtotal,
    igv: 0,
    total: totalNeto,
    totalSinDescuento,
    montoDescuento,
    descuentos: montoDescuento > 0 ? [{
      comandaNumber: comanda.comandaNumber,
      porcentaje: Number(comanda.descuento) || 0,
      motivo: comanda.motivoDescuento || '',
      monto: montoDescuento,
    }] : [],
    boucher: null,
    moneda: 'PEN',
    metodoPago: 'efectivo',
    cliente: comanda.cliente?._id || comanda.cliente || null,
    clienteNombre: comanda.cliente?.nombre || comanda.clienteNombre || null,
    clienteDni: comanda.cliente?.dni || null,
    observaciones: 'Comanda creada — pago pendiente',
    mozoId,
    sourceApp: comanda.origenCreacion === 'dashboard' ? 'admin' : 'mozos',
  });

  try {
    if (global.emitTicketAprobacionNuevo) {
      await global.emitTicketAprobacionNuevo(ticket);
    }
  } catch (e) {
    logger.warn('No se pudo emitir ticket-aprobacion-nuevo (alta comanda)', { error: e.message });
  }
  return ticket;
}

async function fijarMesaServicioTrasForzar(ticket) {
  const mesaAntes = ticket.mesa
    ? await mesasModel.findById(ticket.mesa).select('estado').lean()
    : null;
  const esReserva = await ticketComandasSonReserva(ticket);
  const mesaEstadoServicio = esReserva || mesaAntes?.estado === 'reservado'
    ? 'reservado'
    : (['pedido', 'preparado', 'entregado', 'esperando'].includes(mesaAntes?.estado)
      ? mesaAntes.estado
      : 'pedido');
  if (ticket.mesa && !['pedido', 'preparado', 'entregado', 'esperando', 'reservado'].includes(mesaAntes?.estado)) {
    await mesasModel.findByIdAndUpdate(ticket.mesa, { estado: mesaEstadoServicio });
  }
  return mesaEstadoServicio;
}

/** Si cocina ya entregó, cierra comanda/mesa pagado para que el mozo pueda Liberar. */
async function cerrarComandasSiYaEntregadasTrasForzar(ticket) {
  if (!ticket?.comandas?.length) return;
  const { actualizarComandaSiTodosEntregados } = require('../repository/comanda.repository');
  for (const cid of ticket.comandas) {
    try {
      await actualizarComandaSiTodosEntregados(cid);
    } catch (e) {
      logger.warn('No se pudo cerrar comanda tras forzar (ya entregada)', {
        comandaId: cid,
        error: e.message,
      });
    }
  }
}

/**
 * Caja cobra el ticket de la comanda (boucher + aprobado) sin pasar por Pagos del mozo.
 * Los platos siguen en cocina; el mozo libera la mesa cuando ya entregó.
 */
async function forzarPagoTicketComanda(ticketId, {
  usuarioId, usuarioNombre, metodoPago = 'efectivo',
  montoRecibido, vuelto,
} = {}) {
  const { ticketPuedeAprobarse } = require('../utils/ticketAltaComanda');
  const { aplicarDescuentoAVistaTicket } = require('../utils/descuentoTicketSnapshot');
  const ticket = await ticketAprobacionModel.findById(ticketId);
  if (!ticket || ticket.isActive === false) {
    const err = new Error('Ticket no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (ticket.estado !== 'pendiente_aprobacion') {
    const err = new Error('El ticket ya no está pendiente');
    err.statusCode = 400;
    throw err;
  }

  const totalNeto = Number(aplicarDescuentoAVistaTicket(
    typeof ticket.toObject === 'function' ? ticket.toObject() : ticket
  ).total) || 0;
  if (Number(ticket.total) !== totalNeto) {
    ticket.total = totalNeto;
    await ticket.save();
  }

  if (ticket.boucher || ticketPuedeAprobarse(ticket)) {
    ticket.origen = 'forzado';
    ticket.pagoForzado = true;
    await ticket.save();
    const result = await ticketAprobacionRepository.aprobarTicket(ticketId, usuarioId, usuarioNombre, {
      pagoForzado: true,
    });
    await marcarPlatosComoPpaDesdeTicket(ticket, ticket.boucher);
    let mesaEstadoServicio = await fijarMesaServicioTrasForzar(ticket);
    await cerrarComandasSiYaEntregadasTrasForzar(ticket);
    if (ticket.mesa) {
      const mesaDespues = await mesasModel.findById(ticket.mesa).select('estado').lean();
      if (mesaDespues?.estado) mesaEstadoServicio = mesaDespues.estado;
    }
    return {
      ...result,
      forzado: true,
      yaTeniaBoucher: true,
      comoPpa: true,
      mesaEstado: mesaEstadoServicio,
    };
  }

  const { crearBoucher } = require('../repository/boucher.repository');
  const platosBoucher = (ticket.platos || [])
    .filter((p) => !p.eliminado)
    .map((p) => ({
      plato: p.plato,
      platoId: p.platoId,
      platoSubdocId: p.platoLineaId,
      nombre: p.nombre,
      precio: p.precio,
      cantidad: p.cantidad,
      subtotal: p.subtotal,
      comandaNumber: p.comandaNumber,
      tipoServicio: p.tipoServicio || 'mesa',
      complementosSeleccionados: p.complementosSeleccionados || [],
    }));
  if (!platosBoucher.length) {
    const err = new Error('El ticket no tiene platos para cobrar');
    err.statusCode = 400;
    throw err;
  }

  const metodo = ['efectivo', 'digital', 'tarjeta'].includes(metodoPago) ? metodoPago : 'efectivo';
  const total = totalNeto;
  let recibidoFinal = metodo === 'efectivo' ? total : null;
  let vueltoFinal = metodo === 'efectivo' ? 0 : null;
  if (metodo === 'efectivo' && montoRecibido != null && montoRecibido !== '') {
    recibidoFinal = Math.round((Number(montoRecibido) || 0) * 100) / 100;
    if (recibidoFinal + 0.001 < total) {
      const err = new Error('El monto recibido no puede ser menor al total');
      err.statusCode = 400;
      throw err;
    }
    vueltoFinal = Number.isFinite(Number(vuelto))
      ? Math.round((Number(vuelto) || 0) * 100) / 100
      : Math.max(0, Math.round((recibidoFinal - total) * 100) / 100);
  }

  const boucher = await crearBoucher({
    mesa: ticket.mesa,
    numMesa: ticket.numMesa,
    mozo: ticket.mozo,
    nombreMozo: ticket.nombreMozo || ticket.mozoNombre || 'N/A',
    cliente: ticket.cliente || null,
    pedido: ticket.pedido,
    comandas: ticket.comandas,
    comandasNumbers: ticket.comandasNumbers,
    platos: platosBoucher,
    subtotal: ticket.subtotal,
    igv: ticket.igv || 0,
    total,
    totalSinDescuento: ticket.totalSinDescuento,
    montoDescuento: ticket.montoDescuento,
    metodoPago: metodo,
    metodoPagoLabel: metodo === 'digital' ? 'YAPE/PLIN' : metodo === 'tarjeta' ? 'CRÉDITO/DÉBITO' : 'Efectivo',
    montoRecibido: recibidoFinal,
    vuelto: vueltoFinal,
    esPagoAdelantado: true,
    observaciones: 'Pago adelantado forzado desde caja (tabla de tickets)',
  });

  ticket.boucher = boucher._id;
  ticket.voucherId = boucher.voucherId || (boucher.boucherNumber != null ? String(boucher.boucherNumber) : null);
  ticket.metodoPago = metodo;
  ticket.montoRecibido = recibidoFinal;
  ticket.vuelto = vueltoFinal;
  ticket.origen = 'forzado';
  ticket.pagoForzado = true;
  ticket.observaciones = `${ticket.observaciones || ''} [PAGO FORZADO CAJA]`.trim();
  await ticket.save();

  await marcarPlatosComoPpaDesdeTicket(ticket, boucher._id);

  let mesaEstadoServicio = await fijarMesaServicioTrasForzar(ticket);

  const result = await ticketAprobacionRepository.aprobarTicket(ticketId, usuarioId, usuarioNombre, {
    pagoForzado: true,
  });

  // Si cocina aún no entregó, la mesa queda en servicio. Si ya entregó,
  // actualizarComandaSiTodosEntregados pone mesa pagado para Liberar.
  if (ticket.mesa) {
    await mesasModel.findByIdAndUpdate(ticket.mesa, { estado: mesaEstadoServicio });
  }
  await cerrarComandasSiYaEntregadasTrasForzar(ticket);
  if (ticket.mesa) {
    const mesaDespues = await mesasModel.findById(ticket.mesa).select('estado').lean();
    if (mesaDespues?.estado) mesaEstadoServicio = mesaDespues.estado;
  }
  return {
    ...result,
    forzado: true,
    boucher,
    comoPpa: true,
    mesaEstado: mesaEstadoServicio,
  };
}

async function ticketComandasSonReserva(ticket) {
  if (!ticket?.comandas?.length) return false;
  const comandas = await comandaModel.find({ _id: { $in: ticket.comandas } })
    .select('origenReserva origenCreacion programadaPorReserva')
    .lean();
  return comandas.some((c) => c.origenReserva || c.origenCreacion === 'reserva' || c.programadaPorReserva === true);
}

async function marcarPlatosComoPpaDesdeTicket(ticket, boucherId) {
  if (!ticket.comandas?.length) return;
  const payloadPpa = {
    requerido: true,
    cobrado: true,
    ticketId: ticket._id,
    estadoTicket: 'aprobado',
    boucherId,
  };
  for (const comandaId of ticket.comandas) {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) continue;
    let modificado = false;
    for (const plato of comanda.platos || []) {
      if (plato.eliminado || plato.anulado) continue;
      plato.pagoAdelantado = { ...payloadPpa };
      modificado = true;
    }
    if (modificado) {
      comanda.markModified('platos');
      await comanda.save({ validateModifiedOnly: true });
    }
  }
}

/**
 * Dashboard: crea un TicketAprobacion ya aprobado para una comanda que no lo tiene.
 * No cambia estado de mesa ni emite el ticket a la bandeja pendiente de cocina.
 */
async function crearTicketAprobadoDesdeComanda(comandaId, { usuarioId, usuarioNombre } = {}) {
  if (!mongoose.Types.ObjectId.isValid(comandaId)) {
    const err = new Error('ID de comanda inválido');
    err.statusCode = 400;
    throw err;
  }

  const existentes = await ticketAprobacionRepository.obtenerTicketsPorComanda(comandaId);
  if (existentes.length > 0) {
    const err = new Error('Esta comanda ya tiene un ticket de aprobación');
    err.statusCode = 400;
    throw err;
  }

  const comanda = await comandaModel.findById(comandaId)
    .populate('platos.plato', 'nombre nombreCocina precio id')
    .populate('mozos', 'name')
    .populate({ path: 'mesas', select: 'nummesa estado area', populate: { path: 'area', select: 'nombre' } })
    .populate('cliente', 'nombre dni')
    .lean();

  assertComandaParaTicketYaAprobado(comanda);

  const mesaId = comanda.mesas?._id || comanda.mesas;
  const numMesa = comanda.mesas?.nummesa ?? comanda.mesaNumero;
  const mozoId = comanda.mozos?._id || comanda.mozos;
  const nombreMozo = comanda.mozos?.name || comanda.mozoNombre || 'N/A';

  if (!mesaId || numMesa == null) {
    const err = new Error('La comanda no tiene mesa asignada');
    err.statusCode = 400;
    throw err;
  }
  if (!mozoId) {
    const err = new Error('La comanda no tiene mozo asignado');
    err.statusCode = 400;
    throw err;
  }

  const platosSnapshot = [];
  (comanda.platos || []).forEach((p, i) => {
    if (!p || p.eliminado || p.anulado) return;
    const cantidad = Number(p.cantidad || comanda.cantidades?.[i] || 1) || 1;
    const cat = p.plato && typeof p.plato === 'object' ? p.plato : null;
    const precio = Number(p.precioUnitario ?? p.precio ?? cat?.precio) || 0;
    const tipoServicio = tipoServicioDeLinea(p);
    platosSnapshot.push({
      comandaId: comanda._id,
      comandaNumber: comanda.comandaNumber,
      platoLineaId: p._id || null,
      plato: cat?._id || p.plato || null,
      platoId: p.platoId || cat?.id || null,
      nombre: cat?.nombre || p.nombre || 'Plato',
      precio,
      cantidad,
      subtotal: Number((precio * cantidad).toFixed(2)),
      tipoServicio,
      complementosSeleccionados: (p.complementosSeleccionados || []).map((c) => ({
        grupo: c.grupo || '',
        opcion: c.opcion || '',
        cantidad: Number(c.cantidad) || 1,
        precio: Number(c.precio) || 0,
        pronombre: c.pronombre || '',
      })),
      notaEspecial: p.notaEspecial || '',
      precioBase: p.precioBase != null ? p.precioBase : null,
      extraComplementos: p.extraComplementos != null ? p.extraComplementos : 0,
      precioUnitario: p.precioUnitario != null ? p.precioUnitario : precio,
      mostrarResumenComplementos: !!p.mostrarResumenComplementos,
      resumenComplementosImpresion: {
        mostrarCantidad: p.resumenComplementosImpresion?.mostrarCantidad !== false,
        mostrarMontoExtra: p.resumenComplementosImpresion?.mostrarMontoExtra !== false,
      },
    });
  });

  if (platosSnapshot.length === 0) {
    const err = new Error('La comanda no tiene platos para armar el ticket');
    err.statusCode = 400;
    throw err;
  }

  const subtotal = Number(platosSnapshot.reduce((s, p) => s + (Number(p.subtotal) || 0), 0).toFixed(2));
  const montoDescuento = Number(comanda.montoDescuento) || 0;
  const totalSinDescuento = Number(comanda.totalSinDescuento) > 0
    ? Number(comanda.totalSinDescuento)
    : subtotal;
  const totalNeto = Number(comanda.totalCalculado) > 0
    ? Number(Number(comanda.totalCalculado).toFixed(2))
    : Number(Math.max(0, totalSinDescuento - montoDescuento).toFixed(2));

  const boucher = await boucherModel.findOne({
    isActive: { $ne: false },
    eliminadaPorComanda: { $ne: true },
    $or: [{ comandas: comanda._id }, { usadoEnComanda: comanda._id }],
  }).sort({ createdAt: -1 }).lean();

  const metodoPago = ['efectivo', 'digital', 'tarjeta'].includes(boucher?.metodoPago)
    ? boucher.metodoPago
    : 'efectivo';

  const actorOid = toOid(usuarioId);
  const actorNombre = usuarioNombre || 'Admin';

  const ticket = await ticketAprobacionRepository.crearTicketAprobacion({
    tipo: 'comanda_completa',
    estado: 'aprobado',
    aprobadoPor: actorOid,
    aprobadoPorNombre: actorNombre,
    comandas: [comanda._id],
    comandasNumbers: resolverComandasNumbers({
      comandasNumbers: [comanda.comandaNumber],
      platos: platosSnapshot,
    }),
    mesa: mesaId,
    numMesa,
    mozo: mozoId,
    nombreMozo,
    mozoNombre: nombreMozo,
    pedido: comanda.pedido || null,
    platos: platosSnapshot,
    subtotal,
    igv: 0,
    total: totalNeto,
    totalSinDescuento,
    montoDescuento,
    descuentos: montoDescuento > 0 ? [{
      comandaNumber: comanda.comandaNumber,
      porcentaje: Number(comanda.descuento) || 0,
      motivo: comanda.motivoDescuento || '',
      monto: montoDescuento,
    }] : [],
    boucher: boucher?._id || null,
    voucherId: boucher?.voucherId || (boucher?.boucherNumber != null ? String(boucher.boucherNumber) : null),
    moneda: boucher?.moneda || 'PEN',
    metodoPago,
    montoRecibido: boucher?.montoRecibido ?? null,
    vuelto: boucher?.vuelto ?? null,
    cliente: comanda.cliente?._id || comanda.cliente || null,
    clienteNombre: comanda.cliente?.nombre || comanda.clienteNombre || null,
    clienteDni: comanda.cliente?.dni || null,
    origen: 'pago',
    observaciones: comanda.observaciones || 'Ticket creado desde dashboard (ya aprobado)',
    mozoId,
    sourceApp: 'admin',
  });

  try {
    await AuditoriaAcciones.create({
      accion: 'COMANDA_APROBADA_COCINA',
      entidadId: ticket._id,
      entidadTipo: 'comanda',
      usuario: actorOid,
      usuarioNombre: actorNombre,
      datosAntes: null,
      datosDespues: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        origen: 'dashboard_sin_ticket',
        estado: 'aprobado',
      },
      metadata: {
        comandaId: comanda._id,
        comandaNumber: comanda.comandaNumber,
        mesaId,
        numMesa,
        creadoYaAprobado: true,
      },
    });
  } catch (auditErr) {
    logger.warn('No se pudo auditar ticket aprobado desde dashboard', { error: auditErr.message });
  }

  logger.info('Ticket de aprobación creado ya aprobado desde dashboard', {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    comandaId: comanda._id,
    comandaNumber: comanda.comandaNumber,
    isActiveComanda: comanda.IsActive,
    statusComanda: comanda.status,
  });

  return ticket;
}

/**
 * Editar ticket pendiente (admin). Detecta colección automáticamente.
 */
async function actualizarTicketUnificado(ticketId, tipoHint, data) {
  const tipoNormalizado = String(tipoHint || '').toUpperCase() === 'ADELANTADO' ? 'ADELANTADO' : 'COMANDA';
  const { tipo: tipoReal } = await detectarTipoReal(ticketId, tipoNormalizado);

  if (tipoReal === 'COMANDA') {
    const out = await ticketAprobacionRepository.actualizarTicketAdmin(ticketId, data);
    return { ticket: out.ticket, comandasAfectadas: out.comandasAfectadas || [], tipo: 'COMANDA' };
  }

  const out = await ticketPagoAdelantadoRepository.actualizarTicketAdmin(ticketId, data);
  return { ticket: out.ticket, comandasAfectadas: out.comandasAfectadas || [], tipo: 'ADELANTADO' };
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
  totalPendienteCobroMozo,
  obtenerTicketsPorComanda,
  crearTicketAprobadoDesdeComanda,
  assertComandaParaTicketYaAprobado,
  crearTicketPendienteDesdeComanda,
  forzarPagoTicketComanda,
  aprobarTicketUnificado,
  actualizarTicketUnificado,
  eliminarTicketUnificado,
  reportarTicketComanda,
  detectarTipoReal,
};