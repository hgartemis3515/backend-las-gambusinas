/**
 * Repositorio de Tickets de Pago Adelantado (TPA)
 * Operaciones CRUD y consultas sobre la colección ticketsPagoAdelantado.
 */
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
const comandaModel = require('../database/models/comanda.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const logger = require('../utils/logger');
const { adjuntarDescuentoTicket, aplicarDescuentoAVistaTicket, BOUCHER_DESCUENTO_SELECT, COMANDA_DESCUENTO_SELECT } = require('../utils/descuentoTicketSnapshot');
const { aplicarTotalesPedidoPPA } = require('../utils/totalesTicketPPA');
const { aplicarPreciosEnLineasTicket, quitarLineasDeSnapshot, sincronizarEliminacionEnBoucher, sincronizarPreciosComandaYBoucher } = require('../utils/editarPreciosTicket');

function mapTicketPPAVista(ticket) {
  return aplicarDescuentoAVistaTicket(aplicarTotalesPedidoPPA(ticket));
}

const MAX_COMANDA_SAVE_RETRIES = 3;

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

async function claimPpaTicketForApproval(ticketId, usuarioObjId, usuarioNombre, ts) {
  const claimed = await ticketPagoAdelantadoModel.findOneAndUpdate(
    { _id: ticketId, estado: 'pendiente_aprobacion' },
    {
      $set: {
        estado: 'aprobado',
        aprobadoPor: usuarioObjId,
        aprobadoPorNombre: usuarioNombre,
        fechaAprobacion: ts,
      },
    },
    { new: true }
  );

  if (claimed) return { ticket: claimed, alreadyApproved: false };

  const existing = await ticketPagoAdelantadoModel.findById(ticketId);
  if (!existing) {
    const err = new Error('Ticket de pago adelantado no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (existing.estado === 'aprobado') {
    return { ticket: existing, alreadyApproved: true };
  }

  const err = new Error(`El ticket ya fue ${existing.estado}. No se puede aprobar.`);
  err.statusCode = 400;
  throw err;
}

async function saveComandaConReintento(comandaId, applyChanges) {
  for (let intento = 0; intento < MAX_COMANDA_SAVE_RETRIES; intento++) {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) return { modificado: false, platosLiberados: [] };

    const { modificado, platosLiberados, statusUpdate } = applyChanges(comanda);
    if (!modificado) return { modificado: false, platosLiberados };

    comanda.markModified('platos');
    comanda.updatedAt = moment().tz('America/Lima').toDate();
    if (statusUpdate) {
      Object.assign(comanda, statusUpdate);
    }

    try {
      await comanda.save({ validateModifiedOnly: true });
      return { modificado: true, platosLiberados };
    } catch (err) {
      if (err.name === 'VersionError' && intento < MAX_COMANDA_SAVE_RETRIES - 1) {
        logger.warn('Conflicto al aprobar TPA en comanda, reintentando', {
          comandaId,
          intento: intento + 1,
          error: err.message,
        });
        continue;
      }
      throw err;
    }
  }

  return { modificado: false, platosLiberados: [] };
}

/**
 * Crear un nuevo TPA a partir de los datos del boucher y platos seleccionados.
 */
async function crearTicketPagoAdelantado(data) {
  const zona = 'America/Lima';
  const ahora = moment().tz(zona).toDate();

  const ticket = new ticketPagoAdelantadoModel({
    estado: 'pendiente_aprobacion',
    comandas: data.comandas,
    comandasNumbers: data.comandasNumbers || [],
    mesa: data.mesa,
    numMesa: data.numMesa,
    mozo: data.mozo,
    nombreMozo: data.nombreMozo,
    mozoNombre: data.mozoNombre || data.nombreMozo,
    pedido: data.pedido || null,
    platos: data.platos,
    subtotal: data.subtotal,
    igv: data.igv,
    total: data.total,
    boucher: data.boucher || null,
    voucherId: data.voucherId || null,
    metodoPago: data.metodoPago || 'efectivo',
    moneda: data.moneda || 'PEN',
    montoRecibido: data.montoRecibido ?? null,
    vuelto: data.vuelto ?? null,
    cliente: data.cliente || null,
    clienteNombre: data.clienteNombre || null,
    clienteDni: data.clienteDni || null,
    observaciones: data.observaciones || '',
    createdBy: data.mozo,
    sourceApp: data.sourceApp || 'mozos',
  });

  const saved = await ticket.save();
  logger.info(`TPA #${saved.ticketNumber} creado para mesa ${data.numMesa}, total: ${data.total}`);
  return saved;
}

/**
 * Obtener TPA por ID
 */
async function obtenerTicketPorId(ticketId) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    throw new Error('ID de ticket inválido');
  }
  const ticket = await ticketPagoAdelantadoModel.findById(ticketId)
    .populate('comandas', 'comandaNumber status platos mesas mozos descuento montoDescuento motivoDescuento totalSinDescuento totalCalculado')
    .populate('mesa', 'nummesa estado nombreCombinado')
    .populate('mozo', 'name')
    .populate('boucher')
    .populate('aprobadoPor', 'name')
    .lean();
  return ticket ? mapTicketPPAVista(ticket) : ticket;
}

/**
 * Obtener tickets pendientes de aprobación.
 * Con `fecha`: solo ese día. Sin fecha: todos los pendientes activos (incluye días previos).
 */
async function obtenerTicketsPendientes(fecha) {
  const zona = 'America/Lima';
  const filter = {
    estado: 'pendiente_aprobacion',
    isActive: true,
  };
  if (fecha) {
    const inicioDia = moment.tz(fecha, zona).startOf('day').toDate();
    const finDia = moment.tz(fecha, zona).endOf('day').toDate();
    filter.createdAt = { $gte: inicioDia, $lte: finDia };
  }

  const tickets = await ticketPagoAdelantadoModel.find(filter)
    .populate('mesa', 'nummesa estado nombreCombinado')
    .populate('mozo', 'name')
    .populate('comandas', COMANDA_DESCUENTO_SELECT)
    .populate('boucher', BOUCHER_DESCUENTO_SELECT)
    .sort({ createdAt: 1 })
    .lean();

  return tickets.map(mapTicketPPAVista);
}

/**
 * Obtener tickets por fecha (todos los estados). `fechaHasta` opcional para rango.
 */
async function obtenerTicketsPorFecha(fecha, fechaHasta) {
  const zona = 'America/Lima';
  const inicioDia = moment.tz(fecha, zona).startOf('day').toDate();
  const finDia = moment.tz(fechaHasta || fecha, zona).endOf('day').toDate();

  const tickets = await ticketPagoAdelantadoModel.find({
    createdAt: { $gte: inicioDia, $lte: finDia },
    isActive: true,
  })
    .populate('mesa', 'nummesa estado nombreCombinado')
    .populate('mozo', 'name')
    .populate('comandas', COMANDA_DESCUENTO_SELECT)
    .populate('boucher', BOUCHER_DESCUENTO_SELECT)
    .sort({ createdAt: -1 })
    .lean();

  return tickets.map(mapTicketPPAVista);
}

/**
 * Aprobar un TPA: cambia estado, marca platos y los libera al KDS
 */
async function aprobarTicket(ticketId, usuarioId, usuarioNombre) {
  const zona = 'America/Lima';
  const ahoraTs = moment().tz(zona).toDate();
  const usuarioObjId = toObjectId(usuarioId);

  const { ticket, alreadyApproved } = await claimPpaTicketForApproval(
    ticketId,
    usuarioObjId,
    usuarioNombre,
    ahoraTs
  );

  if (alreadyApproved && !(ticket.origen === 'reserva' && ticket.reserva)) {
    return { ticket, platosLiberados: [], alreadyApproved: true };
  }

  if (ticket.origen === 'reserva' && ticket.reserva) {
    const reservaRepository = require('./reserva.repository');
    const conf = await reservaRepository.confirmarReservaTrasAprobacionPPA(ticket.reserva);
    logger.info(`TPA reserva #${ticket.ticketNumber} aprobado. Reserva confirmada.`, {
      alreadyApproved,
      activada: !!conf.activada
    });
    return {
      ticket,
      platosLiberados: [],
      alreadyApproved,
      reservaConfirmada: true,
      reservaActivada: !!conf.activada,
      mesaEstado: conf.mesaEstado,
      reserva: conf.reserva,
    };
  }

  const platosLiberados = [];
  for (const comandaId of ticket.comandas) {
    const { modificado, platosLiberados: liberados } = await saveComandaConReintento(
      comandaId,
      (comanda) => {
        const liberadosLocal = [];
        let modificadoLocal = false;

        for (const plato of comanda.platos) {
          const platoLineaId = plato._id?.toString();
          const estaEnTicket = ticket.platos.some(
            (tp) => tp.platoLineaId?.toString() === platoLineaId
          );

          if (estaEnTicket && plato.pagoAdelantado?.estadoTicket === 'pendiente_aprobacion') {
            plato.pagoAdelantado.estadoTicket = 'aprobado';
            if (plato.estado === 'pedido') {
              plato.estado = 'en_espera';
              if (!plato.tiempos) plato.tiempos = {};
              plato.tiempos.en_espera = ahoraTs;
            }
            modificadoLocal = true;
            liberadosLocal.push({
              comandaId: comanda._id,
              comandaNumber: comanda.comandaNumber,
              platoId: plato.plato,
              platoLineaId: plato._id,
              nombre: plato.plato?.nombre || plato.platoId,
              estadoNuevo: plato.estado,
            });
          }
        }

        if (!modificadoLocal) {
          return { modificado: false, platosLiberados: liberadosLocal };
        }

        const todosPlatosRetenidos = comanda.platos
          .filter((p) => !p.eliminado && !p.anulado)
          .every((p) => p.estado === 'pedido' || p.estado === 'en_espera');

        let statusUpdate = null;
        if (todosPlatosRetenidos && comanda.status === 'pedido') {
          const platosActivos = comanda.platos.filter((p) => !p.eliminado && !p.anulado);
          const algunoEnEspera = platosActivos.some((p) => p.estado === 'en_espera');
          if (algunoEnEspera) {
            statusUpdate = { status: 'en_espera', tiempoEnEspera: ahoraTs };
          }
        }

        return { modificado: true, platosLiberados: liberadosLocal, statusUpdate };
      }
    );

    if (modificado) {
      platosLiberados.push(...liberados);
    }
  }

  logger.info(`TPA #${ticket.ticketNumber} aprobado por ${usuarioNombre}. Platos liberados: ${platosLiberados.length}`);

  // Restaurar estado de la mesa: de pendiente_pago a pedido/en_espera
  const mesasModel = require('../database/models/mesas.model');
  // Verificar si la mesa aún está en pendiente_pago antes de cambiar
  const mesaActual = await mesasModel.findById(ticket.mesa).lean();
  if (mesaActual && mesaActual.estado === 'pendiente_pago') {
    await mesasModel.findByIdAndUpdate(ticket.mesa, { estado: 'pedido' });
  }

  return { ticket, platosLiberados };
}

/**
 * Rechazar un TPA
 */
async function rechazarTicket(ticketId, motivo, usuarioId, usuarioNombre) {
  const zona = 'America/Lima';
  const ahora = moment().tz(zona).toDate();

  // Motivo obligatorio para auditoría
  if (!motivo || String(motivo).trim().length < 3) {
    const err = new Error('El motivo de rechazo es obligatorio (mínimo 3 caracteres) para registro en auditoría.');
    err.statusCode = 400;
    throw err;
  }
  const motivoLimpio = String(motivo).trim();

  const ticket = await ticketPagoAdelantadoModel.findById(ticketId);
  if (!ticket) {
    const err = new Error('Ticket no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (ticket.estado !== 'pendiente_aprobacion') {
    const err = new Error(`El ticket ya fue ${ticket.estado}. No se puede rechazar.`);
    err.statusCode = 400;
    throw err;
  }

  ticket.estado = 'rechazado';
  ticket.rechazadoPor = usuarioId;
  ticket.motivoRechazo = motivoLimpio;
  ticket.fechaRechazo = ahora;
  await ticket.save();

  if (ticket.origen === 'reserva' && ticket.reserva) {
    const reservaRepository = require('./reserva.repository');
    const r = await reservaRepository.rechazarReservaTrasPPA(ticket.reserva, motivoLimpio);
    logger.info(`TPA reserva #${ticket.ticketNumber} rechazado. Reserva cancelada.`);
    return { ticket, comandasAfectadas: r.comandaId ? [r.comandaId] : [], reservaRechazada: true };
  }

  const usuarioObjId = usuarioId && mongoose.Types.ObjectId.isValid(usuarioId)
    ? new mongoose.Types.ObjectId(usuarioId)
    : null;
  const razonRechazo = `Pago adelantado rechazado por cocina: ${motivoLimpio}`;
  const comandasAfectadas = [];

  // Eliminar (anular) los platos del ticket en cada comanda y registrar auditoría
  for (const comandaId of ticket.comandas) {
    const comanda = await comandaModel.findById(comandaId).populate('platos.plato');
    if (!comanda) continue;

    const datosAntes = comanda.toObject();
    let modificado = false;
    const platosRechazados = [];

    for (let index = 0; index < comanda.platos.length; index++) {
      const plato = comanda.platos[index];
      const platoLineaId = plato._id?.toString();
      const estaEnTicket = ticket.platos.some(
        tp => tp.platoLineaId?.toString() === platoLineaId
      );

      if (
        estaEnTicket &&
        plato.pagoAdelantado?.ticketId?.toString() === ticketId.toString() &&
        !plato.eliminado &&
        !plato.anulado
      ) {
        const estadoAlAnular = plato.estado;
        const nombrePlato = plato.plato?.nombre || 'Plato desconocido';
        const cantidad = comanda.cantidades?.[index] || 1;

        // Marcar el ticket del plato como rechazado
        plato.pagoAdelantado.estadoTicket = 'rechazado';

        // Eliminar/anular el plato (el sistema de pagos y KDS lo excluyen)
        plato.eliminado = true;
        plato.eliminadoPor = usuarioObjId;
        plato.eliminadoAt = ahora;
        plato.eliminadoRazon = razonRechazo;
        plato.estadoAlEliminar = estadoAlAnular;
        plato.anulado = true;
        plato.anuladoPor = usuarioObjId;
        plato.anuladoAt = ahora;
        plato.anuladoRazon = razonRechazo;
        plato.anuladoSourceApp = 'cocina';
        plato.estadoAlAnular = estadoAlAnular;
        plato.tipoAnulacion = 'ppa_rechazado';

        if (!comanda.historialPlatos) comanda.historialPlatos = [];
        comanda.historialPlatos.push({
          platoId: plato.platoId,
          nombreOriginal: nombrePlato,
          cantidadOriginal: cantidad,
          cantidadFinal: 0,
          estado: 'eliminado',
          timestamp: ahora,
          usuario: usuarioObjId,
          motivo: razonRechazo,
          anuladoPor: usuarioObjId,
          anuladoSourceApp: 'cocina',
          tipoAnulacion: 'ppa_rechazado',
        });

        platosRechazados.push({
          index,
          platoId: plato.platoId,
          nombre: nombrePlato,
          cantidad,
          estadoAlAnular,
        });
        modificado = true;
      }
    }

    if (modificado) {
      // Si ya no quedan platos activos, cancelar la comanda completa
      const platosActivos = comanda.platos.filter(p => !p.eliminado && !p.anulado);
      if (platosActivos.length === 0) {
        const statusAnterior = comanda.status;
        comanda.status = 'cancelado';
        comanda.version = (comanda.version || 1) + 1;
        if (!comanda.historialEstados) comanda.historialEstados = [];
        comanda.historialEstados.push({
          status: 'cancelado',
          statusAnterior,
          timestamp: ahora,
          usuario: usuarioObjId,
          accion: 'Comanda cancelada por rechazo de pago adelantado',
          sourceApp: 'cocina',
          motivo: razonRechazo,
        });
      }

      comanda.markModified('platos');
      comanda.updatedAt = ahora;
      await comanda.save({ validateModifiedOnly: true });

      // Registrar en Auditoría
      try {
        await AuditoriaAcciones.create({
          accion: 'COMANDA_ANULADA_COCINA',
          entidadId: comanda._id,
          entidadTipo: 'comanda',
          usuario: usuarioObjId,
          datosAntes,
          datosDespues: comanda.toObject(),
          motivo: razonRechazo,
          metadata: {
            origen: 'ppa_rechazado',
            ticketId: ticket._id,
            ticketNumber: ticket.ticketNumber,
            comandaNumber: comanda.comandaNumber,
            numMesa: ticket.numMesa,
            mozoNombre: ticket.nombreMozo || ticket.mozoNombre,
            rechazadoPor: usuarioNombre,
            platosRechazados,
            comandaCancelada: platosActivos.length === 0,
          },
        });
      } catch (auditErr) {
        logger.error('Error registrando auditoría de rechazo PPA', { error: auditErr.message });
      }

      comandasAfectadas.push(comanda._id);
    }
  }

  logger.info(`TPA #${ticket.ticketNumber} rechazado por ${usuarioNombre}. Motivo: ${motivoLimpio}. Comandas afectadas: ${comandasAfectadas.length}`);

  // Recalcular estado de la mesa (si ya no hay comandas activas, quedará 'libre')
  try {
    const { recalcularEstadoMesa } = require('./comanda.repository');
    await recalcularEstadoMesa(ticket.mesa);
  } catch (mesaErr) {
    logger.warn('No se pudo recalcular estado de mesa tras rechazo PPA', { error: mesaErr.message });
    // Fallback: si la mesa sigue en pendiente_pago, restaurarla a pedido
    const mesasModel = require('../database/models/mesas.model');
    const mesaActual = await mesasModel.findById(ticket.mesa).lean();
    if (mesaActual && mesaActual.estado === 'pendiente_pago') {
      await mesasModel.findByIdAndUpdate(ticket.mesa, { estado: 'pedido' });
    }
  }

  return { ticket, comandasAfectadas };
}

/**
 * Obtener comandas y platos elegibles para Pago Adelantado de una mesa.
 * Reglas:
 * - Plato eliminado/anulado: no elegible
 * - Plato en recoger/entregado/pagado: no elegible (usar Pagar normal)
 * - Plato ya en TPA pendiente_aprobacion o aprobado: no elegible
 * - Plato en pedido/en_espera con tipoServicio para_llevar o mesa: elegible
 */
async function getComandasParaPagoAdelantado(mesaId, comandaIds) {
  // Validar que mesaId sea un ObjectId válido
  if (!mongoose.Types.ObjectId.isValid(mesaId)) {
    throw new Error(`mesaId inválido: ${mesaId}`);
  }

  const query = {
    mesas: new mongoose.Types.ObjectId(mesaId),
    IsActive: true,
    status: { $in: ['en_espera', 'pedido', 'recoger'] },
  };

  if (comandaIds && comandaIds.length > 0) {
    const validIds = comandaIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length > 0) {
      query._id = { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) };
    }
  }

  const comandas = await comandaModel.find(query)
    .populate('platos.plato')
    .populate('mozos', 'name _id')
    .populate('mesas', 'nummesa estado nombreCombinado')
    .sort({ createdAt: -1 })
    .lean();

  // Filtrar platos elegibles para PPA
  comandas.forEach(comanda => {
    comanda.platosElegiblesPPA = (comanda.platos || []).filter(plato => {
      if (plato.eliminado || plato.anulado) return false;
      const estado = (plato.estado || '').toLowerCase();
      if (['recoger', 'entregado', 'pagado'].includes(estado)) return false;
      if (plato.pagoAdelantado?.estadoTicket === 'pendiente_aprobacion') return false;
      if (plato.pagoAdelantado?.estadoTicket === 'aprobado') return false;
      return true;
    });
  });

  return comandas;
}

/**
 * Clasificar comanda por tipo de servicio
 */
function clasificarComandaPorTipoServicio(platosActivos) {
  const tieneMesa = platosActivos.some(p => (p.tipoServicio || 'mesa') === 'mesa');
  const tieneLlevar = platosActivos.some(p => p.tipoServicio === 'para_llevar');
  if (tieneMesa && tieneLlevar) return 'mixta';
  if (tieneLlevar) return 'solo_para_llevar';
  return 'solo_mesa';
}

/**
 * Tickets PPA asociados a una comanda (cualquier estado).
 */
async function obtenerTicketsPorComanda(comandaId) {
  if (!mongoose.Types.ObjectId.isValid(comandaId)) return [];
  return ticketPagoAdelantadoModel
    .find({ comandas: comandaId, isActive: true })
    .populate('mozo', 'name')
    .populate('comandas', COMANDA_DESCUENTO_SELECT)
    .populate('boucher', 'boucherNumber voucherId metodoPago montoDescuento descuentos totalSinDescuento')
    .sort({ createdAt: -1 })
    .lean()
    .then((tickets) => tickets.map(mapTicketPPAVista));
}

/**
 * Editar observaciones / método / precios de un TPA pendiente o aprobado (admin).
 */
async function actualizarTicketAdmin(ticketId, { observaciones, metodoPago, platos, platosEliminar }) {
  const ticket = await ticketPagoAdelantadoModel.findById(ticketId);
  if (!ticket || !ticket.isActive) {
    const err = new Error('Ticket de pago adelantado no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (!['pendiente_aprobacion', 'aprobado'].includes(ticket.estado)) {
    const err = new Error(`No se puede editar un ticket ${ticket.estado}`);
    err.statusCode = 400;
    throw err;
  }
  if (observaciones !== undefined) ticket.observaciones = String(observaciones || '');
  if (metodoPago && ['efectivo', 'digital', 'tarjeta'].includes(metodoPago)) {
    ticket.metodoPago = metodoPago;
    if (ticket.boucher) {
      try {
        const labels = { efectivo: 'Efectivo', digital: 'YAPE/PLIN', tarjeta: 'CRÉDITO/DÉBITO' };
        await mongoose.model('Boucher').findByIdAndUpdate(ticket.boucher, {
          metodoPago,
          metodoPagoLabel: labels[metodoPago],
        });
      } catch (_) { /* boucher opcional */ }
    }
  }
  let comandasAfectadas = [];
  const quit = quitarLineasDeSnapshot(ticket, platosEliminar);
  if (quit.changed) {
    await sincronizarEliminacionEnBoucher(ticket.boucher, quit.ids);
  }
  const precios = aplicarPreciosEnLineasTicket(ticket, platos);
  if (precios.changed) {
    comandasAfectadas = await sincronizarPreciosComandaYBoucher(
      precios.cambiosComanda,
      ticket.boucher
    );
  }
  await ticket.save();
  if (comandasAfectadas.length) {
    try {
      const { sincronizarDescuentoTicketsComanda } = require('../utils/descuentoTicketsComanda');
      for (const cid of comandasAfectadas) {
        const c = await comandaModel.findById(cid);
        if (c) await sincronizarDescuentoTicketsComanda(c);
      }
    } catch (syncErr) {
      logger.warn('No se pudo sincronizar otros tickets tras editar cantidad/precio PPA', { error: syncErr.message });
    }
  }
  const fresh = await ticketPagoAdelantadoModel.findById(ticketId);
  return { ticket: (fresh || ticket).toObject(), comandasAfectadas };
}

module.exports = {
  crearTicketPagoAdelantado,
  obtenerTicketPorId,
  obtenerTicketsPendientes,
  obtenerTicketsPorFecha,
  obtenerTicketsPorComanda,
  actualizarTicketAdmin,
  aprobarTicket,
  rechazarTicket,
  getComandasParaPagoAdelantado,
  clasificarComandaPorTipoServicio,
};