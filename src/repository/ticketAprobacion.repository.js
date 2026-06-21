/**
 * Repositorio de Tickets de Aprobación (comandas completas)
 *
 * NO cubre pagos adelantados — esos viven en ticketPagoAdelantado.repository.js.
 * La bandeja unificada en cocina (Fase D) consulta ambos repositorios.
 */
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const logger = require('../utils/logger');
const { NOMBRE_CLIENTE_FALLBACK } = require('../constants/clienteDefaults');

const ZONA = 'America/Lima';

function ahora() {
  return moment().tz(ZONA).toDate();
}

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

/**
 * Crea un TicketAprobacion a partir de un pago completo (no PPA).
 * Snapshot de platos tomado de las comandas afectadas para que la bandeja
 * y la impresión no dependan de consultas posteriores.
 *
 * @param {object} data
 *   - comandas: ObjectId[] (comandas afectadas, ya pagadas en boucher)
 *   - comandasNumbers, mesa, numMesa, mozo, nombreMozo, pedido
 *   - platos: [{ comandaId, comandaNumber, platoLineaId, plato, platoId, nombre,
 *               precio, cantidad, subtotal, tipoServicio, complementosSeleccionados, notaEspecial }]
 *   - subtotal, igv, total, boucher, voucherId, moneda, metodoPago
 *   - cliente, clienteNombre, clienteDni, observaciones, mozoId (createdBy)
 */
async function crearTicketAprobacion(data) {
  const ticket = new ticketAprobacionModel({
    // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 2): tipo puede ser
    // 'comanda_completa' (cobro único que cubre toda la mesa) o
    // 'pago_parcial' (cobro de un subconjunto de platos).
    tipo: data.tipo === 'pago_parcial' ? 'pago_parcial' : 'comanda_completa',
    estado: 'pendiente_aprobacion',
    comandas: data.comandas || [],
    comandasNumbers: data.comandasNumbers || [],
    mesa: data.mesa,
    numMesa: data.numMesa,
    mozo: data.mozo,
    nombreMozo: data.nombreMozo,
    mozoNombre: data.mozoNombre || data.nombreMozo,
    pedido: data.pedido || null,
    platos: data.platos || [],
    subtotal: data.subtotal || 0,
    igv: data.igv || 0,
    total: data.total || 0,
    boucher: data.boucher || null,
    voucherId: data.voucherId || null,
    moneda: data.moneda || 'PEN',
    metodoPago: data.metodoPago || 'efectivo',
    cliente: data.cliente || null,
    clienteNombre: data.clienteNombre || null,
    clienteDni: data.clienteDni || null,
    observaciones: data.observaciones || '',
    createdBy: data.mozoId || data.mozo || null,
    sourceApp: data.sourceApp || 'mozos',
  });

  const saved = await ticket.save();
  logger.info(
    `TicketAprobacion #${saved.ticketNumber} creado para mesa ${data.numMesa} (tipo ${saved.tipo}, total ${saved.total})`
  );
  return saved;
}

/**
 * Obtiene un ticket por id con populate completo (para detalle / impresión).
 */
async function obtenerTicketPorId(ticketId) {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const err = new Error('ID de ticket inválido');
    err.statusCode = 400;
    throw err;
  }
  return ticketAprobacionModel
    .findById(ticketId)
    .populate('comandas', 'comandaNumber status platos mesas mozos')
    .populate('mesa', 'nummesa estado nombreCombinado')
    .populate('mozo', 'name')
    .populate('boucher')
    .populate('aprobadoPor', 'name')
    .populate('reportadoPor', 'name')
    .lean();
}

/**
 * Tickets pendientes de aprobación del día (o de la fecha indicada).
 */
async function obtenerTicketsPendientes(fecha) {
  const fechaQuery = fecha || moment().tz(ZONA).format('YYYY-MM-DD');
  const inicioDia = moment.tz(fechaQuery, ZONA).startOf('day').toDate();
  const finDia = moment.tz(fechaQuery, ZONA).endOf('day').toDate();

  return ticketAprobacionModel
    .find({
      estado: 'pendiente_aprobacion',
      createdAt: { $gte: inicioDia, $lte: finDia },
      isActive: true,
    })
    .populate('mesa', 'nummesa estado nombreCombinado')
    .populate('mozo', 'name')
    .sort({ createdAt: 1 })
    .lean();
}

/**
 * Lista todos los tickets de aprobación de una fecha (cualquier estado).
 */
async function obtenerTicketsPorFecha(fecha) {
  const inicioDia = moment.tz(fecha, ZONA).startOf('day').toDate();
  const finDia = moment.tz(fecha, ZONA).endOf('day').toDate();

  return ticketAprobacionModel
    .find({
      createdAt: { $gte: inicioDia, $lte: finDia },
      isActive: true,
    })
    .populate('mesa', 'nummesa estado nombreCombinado')
    .populate('mozo', 'name')
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Aprobar ticket de comanda completa o pago parcial:
 *  1. ticket.estado → 'aprobado'
 *  2. platos del SNAPSHOT del ticket: 'pendiente' → 'pagado' (solo esos, no toda la comanda)
 *  3. comanda: solo se cierra si TODOS sus platos activos quedan en 'pagado'
 *  4. mesa: solo pasa a 'pagado' si no quedan platos 'entregado'/'pendiente'
 *     en el ciclo Y no hay otros tickets pendientes del mismo pedido
 *  5. auditoría COMANDA_APROBADA_COCINA
 *
 * BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 3):
 * Antes, aprobar cualquier ticket cerraba la comanda entera y ponía la mesa en
 * 'pagado'. Ahora se aprueban SOLO los platos del snapshot del ticket y la mesa
 * solo se libera cuando todo el ciclo está cobrado y aprobado.
 *
 * No toca boucher (registro contable intacto).
 * No aplica a pagos adelantados (esos tienen su propia aprobación en ticketPagoAdelantado.repository).
 */
async function aprobarTicket(ticketId, usuarioId, usuarioNombre) {
  const ts = ahora();
  const usuarioObjId = toObjectId(usuarioId);

  const ticket = await ticketAprobacionModel.findById(ticketId);
  if (!ticket) {
    const err = new Error('Ticket de aprobación no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (ticket.estado !== 'pendiente_aprobacion') {
    const err = new Error(`El ticket ya fue ${ticket.estado}. No se puede aprobar.`);
    err.statusCode = 400;
    throw err;
  }

  // Snapshot para auditoría
  const datosAntes = {
    ticketEstado: ticket.estado,
    mesaEstado: (await mesasModel.findById(ticket.mesa).select('estado').lean())?.estado,
    comandas: ticket.comandas.map((c) => c.toString()),
    boucherId: ticket.boucher,
  };

  ticket.estado = 'aprobado';
  ticket.aprobadoPor = usuarioObjId;
  ticket.aprobadoPorNombre = usuarioNombre;
  ticket.fechaAprobacion = ts;
  await ticket.save();

  // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 3):
  // Liberar SOLO los platos que están en el snapshot de este ticket (por platoLineaId).
  // Antes se cambiaban TODOS los 'pendiente' de la comanda, lo que rompía el ciclo
  // cuando había varios tickets parciales sobre la misma comanda.
  const platosSnapshotIds = new Set(
    (ticket.platos || [])
      .map((p) => (p.platoLineaId ? String(p.platoLineaId) : null))
      .filter(Boolean)
  );

  const platosLiberados = [];
  for (const comandaId of ticket.comandas) {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) continue;

    let modificado = false;
    for (const plato of comanda.platos) {
      const platoLineaIdStr = plato._id ? String(plato._id) : null;
      // Solo tocar platos que están en el snapshot del ticket
      if (!platoLineaIdStr || !platosSnapshotIds.has(platoLineaIdStr)) continue;

      const estadoLower = (plato.estado || '').toLowerCase();
      if (estadoLower === 'pendiente') {
        plato.estado = 'pagado';
        if (!plato.tiempos) plato.tiempos = {};
        if (!plato.tiempos.pagado) plato.tiempos.pagado = ts;
        modificado = true;
        platosLiberados.push({
          comandaId: comanda._id,
          comandaNumber: comanda.comandaNumber,
          platoLineaId: plato._id,
          platoId: plato.plato,
          estadoNuevo: 'pagado',
        });
      }
    }

    if (modificado) {
      comanda.markModified('platos');
      comanda.updatedAt = ts;

      // Solo cerrar la comanda si TODOS sus platos activos quedaron en 'pagado'.
      // Si quedan 'entregado' (por cobrar) o 'pendiente' (esperando otro ticket),
      // mantener la comanda activa.
      const platosActivos = (comanda.platos || []).filter(
        (p) => !p.eliminado && !p.anulado
      );
      const todosPagados = platosActivos.length > 0
        && platosActivos.every((p) => (p.estado || '').toLowerCase() === 'pagado');

      if (todosPagados) {
        comanda.status = 'pagado';
        comanda.IsActive = false;
        if (!comanda.tiempoPagado) comanda.tiempoPagado = ts;
      } else {
        // Aún hay platos pendientes de cobro o de aprobación → comanda sigue activa
        comanda.status = 'pendiente_aprobar';
        comanda.IsActive = true;
      }
      await comanda.save();
    }
  }

  // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 3):
  // Mesa → 'pagado' SOLO si todo el ciclo está cobrado y aprobado.
  // Criterios:
  //   1. No quedan comandas activas con platos 'entregado' (sin cobrar).
  //   2. No quedan comandas activas con platos 'pendiente' (cobrados, sin aprobar).
  //   3. No hay otros tickets 'pendiente_aprobacion' del mismo pedido/mesa hoy.
  let mesaEstadoFinal = null;
  const mesaDoc = await mesasModel.findById(ticket.mesa);
  if (mesaDoc) {
    const evaluacion = await evaluarMesaListaParaLiberar(ticket.mesa, ticket.pedido);
    if (evaluacion.lista && mesaDoc.estado !== 'reportado') {
      mesaDoc.estado = 'pagado';
      await mesaDoc.save();
      mesaEstadoFinal = 'pagado';

      // Cerrar pedido del ciclo al liberar mesa
      try {
        const pedidoModel = mongoose.model('Pedido');
        const pedidoId = ticket.pedido;
        if (pedidoId) {
          const pedido = await pedidoModel.findById(pedidoId);
          if (pedido && pedido.estado === 'abierto') {
            pedido.estado = 'pagado';
            pedido.fechaPago = ts;
            pedido.boucher = ticket.boucher;
            await pedido.save();
          }
        }
      } catch (pedidoErr) {
        logger.warn('No se pudo cerrar el pedido al liberar mesa', {
          error: pedidoErr.message,
          mesaId: ticket.mesa,
        });
      }
    } else if (mesaDoc.estado !== 'reportado' && mesaDoc.estado !== 'pagado') {
      // Mantener mesa en pendiente_aprobar mientras falten platos o tickets
      mesaDoc.estado = 'pendiente_aprobar';
      await mesaDoc.save();
      mesaEstadoFinal = 'pendiente_aprobar';
    } else {
      mesaEstadoFinal = mesaDoc.estado;
    }
  }

  // Auditoría
  try {
    await AuditoriaAcciones.create({
      accion: 'COMANDA_APROBADA_COCINA',
      entidadId: ticket._id,
      entidadTipo: 'comanda',
      usuario: usuarioObjId,
      datosAntes,
      datosDespues: { ticketEstado: 'aprobado', mesaEstado: mesaEstadoFinal },
      metadata: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        tipo: ticket.tipo,
        mesaId: ticket.mesa,
        numMesa: ticket.numMesa,
        mozoNombre: ticket.nombreMozo || ticket.mozoNombre,
        comandasNumbers: ticket.comandasNumbers,
        platosLiberados: platosLiberados.length,
        aprobadoPor: usuarioNombre,
        boucherId: ticket.boucher,
        mesaListaParaLiberar: mesaEstadoFinal === 'pagado',
      },
    });
  } catch (auditErr) {
    logger.error('Error registrando auditoría de aprobación de comanda', {
      error: auditErr.message,
    });
  }

  logger.info(
    `TicketAprobacion #${ticket.ticketNumber} aprobado por ${usuarioNombre}. Platos liberados: ${platosLiberados.length}. Mesa → ${mesaEstadoFinal}`
  );

  return { ticket, platosLiberados, mesaEstado: mesaEstadoFinal };
}

/**
 * BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 3):
 * Evalúa si una mesa está lista para liberar (pasar a 'pagado').
 * Criterios:
 *   1. No hay comandas activas con platos 'entregado' (sin cobrar).
 *   2. No hay comandas activas con platos 'pendiente' (cobrados, esperando otro ticket).
 *   3. No hay tickets 'pendiente_aprobacion' hoy para la mesa/pedido.
 *
 * @param {string|ObjectId} mesaId
 * @param {string|ObjectId|null} [pedidoId]
 * @returns {Promise<{ lista: boolean, razones: string[] }>}
 */
async function evaluarMesaListaParaLiberar(mesaId, pedidoId = null) {
  const razones = [];

  // 1 y 2: revisar comandas activas de la mesa
  const comandasActivas = await comandaModel
    .find({
      mesas: mesaId,
      IsActive: true,
      eliminada: { $ne: true },
      status: { $nin: ['cancelado', 'anulado', 'completado'] },
    })
    .select('platos status pedido')
    .lean();

  let hayEntregadosSinCobrar = false;
  let hayPendientesSinAprobar = false;
  for (const c of comandasActivas) {
    for (const p of c.platos || []) {
      if (p.eliminado || p.anulado) continue;
      const e = (p.estado || '').toLowerCase();
      if (e === 'entregado') hayEntregadosSinCobrar = true;
      if (e === 'pendiente') hayPendientesSinAprobar = true;
    }
  }
  if (hayEntregadosSinCobrar) razones.push('quedan platos en entregado sin cobrar');
  if (hayPendientesSinAprobar) razones.push('quedan platos en pendiente esperando aprobación');

  // 3: tickets pendientes de aprobación para la mesa hoy
  const inicioDia = moment().tz(ZONA).startOf('day').toDate();
  const finDia = moment().tz(ZONA).endOf('day').toDate();
  const ticketQuery = {
    mesa: mesaId,
    estado: 'pendiente_aprobacion',
    createdAt: { $gte: inicioDia, $lte: finDia },
    isActive: true,
  };
  if (pedidoId) {
    // Si conocemos el pedido, acotamos a ese ciclo
    ticketQuery.pedido = pedidoId;
  }
  const ticketsPendientes = await ticketAprobacionModel.countDocuments(ticketQuery);
  if (ticketsPendientes > 0) {
    razones.push(`hay ${ticketsPendientes} ticket(s) pendiente(s) de aprobación`);
  }

  return { lista: razones.length === 0, razones };
}

/**
 * Reportar ticket de comanda completa (NO elimina boucher, NO elimina platos).
 *
 *  1. ticket.estado → 'reportado' + motivoReporte + reportadoPor
 *  2. mesa.estado → 'reportado' (rojo en mapa mozos)
 *  3. platos permanecen en 'pendiente' (no entran al KDS mientras esté reportado)
 *  4. auditoría COMANDA_REPORTADA_COCINA + snapshot
 *  5. boucher intacto
 */
async function reportarTicket(ticketId, motivo, usuarioId, usuarioNombre) {
  // Motivo obligatorio (mínimo 3 caracteres) — alineado con PpaSidebar.jsx
  const motivoLimpio = String(motivo || '').trim();
  if (motivoLimpio.length < 3) {
    const err = new Error('El motivo de reporte es obligatorio (mínimo 3 caracteres).');
    err.statusCode = 400;
    throw err;
  }

  const ts = ahora();
  const usuarioObjId = toObjectId(usuarioId);

  const ticket = await ticketAprobacionModel.findById(ticketId);
  if (!ticket) {
    const err = new Error('Ticket de aprobación no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (ticket.estado !== 'pendiente_aprobacion') {
    const err = new Error(`El ticket ya fue ${ticket.estado}. No se puede reportar.`);
    err.statusCode = 400;
    throw err;
  }

  // Snapshot antes
  const mesaAntes = await mesasModel.findById(ticket.mesa).select('estado nummesa').lean();
  const datosAntes = {
    ticketEstado: ticket.estado,
    mesaEstado: mesaAntes?.estado,
    comandas: ticket.comandas.map((c) => c.toString()),
    boucherId: ticket.boucher,
  };

  ticket.estado = 'reportado';
  ticket.reportadoPor = usuarioObjId;
  ticket.reportadoPorNombre = usuarioNombre;
  ticket.fechaReporte = ts;
  ticket.motivoReporte = motivoLimpio;
  await ticket.save();

  // Mesa: 'pendiente_aprobar' → 'reportado'
  const mesaDoc = await mesasModel.findById(ticket.mesa);
  if (mesaDoc) {
    mesaDoc.estado = 'reportado';
    await mesaDoc.save();
  }

  // Auditoría
  try {
    await AuditoriaAcciones.create({
      accion: 'COMANDA_REPORTADA_COCINA',
      entidadId: ticket._id,
      entidadTipo: 'comanda',
      usuario: usuarioObjId,
      datosAntes,
      datosDespues: { ticketEstado: 'reportado', mesaEstado: 'reportado' },
      motivo: motivoLimpio,
      metadata: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        tipo: ticket.tipo,
        mesaId: ticket.mesa,
        numMesa: ticket.numMesa,
        mozoNombre: ticket.nombreMozo || ticket.mozoNombre,
        clienteNombre: ticket.clienteNombre,
        comandasNumbers: ticket.comandasNumbers,
        total: ticket.total,
        moneda: ticket.moneda,
        reportadoPor: usuarioNombre,
        boucherId: ticket.boucher,
        boucherIntacto: true,
      },
    });

    // Auditoría paralela a nivel mesa (para trazabilidad cruzada)
    await AuditoriaAcciones.create({
      accion: 'MESA_ESTADO_REPORTADO',
      entidadId: ticket.mesa,
      entidadTipo: 'mesa',
      usuario: usuarioObjId,
      datosAntes: { estado: mesaAntes?.estado },
      datosDespues: { estado: 'reportado' },
      motivo: motivoLimpio,
      metadata: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        numMesa: ticket.numMesa,
        origen: 'comanda_reportada',
        reportadoPor: usuarioNombre,
      },
    });
  } catch (auditErr) {
    logger.error('Error registrando auditoría de reporte de comanda', {
      error: auditErr.message,
    });
  }

  logger.info(
    `TicketAprobacion #${ticket.ticketNumber} reportado por ${usuarioNombre}. Motivo: ${motivoLimpio}`
  );

  return { ticket, mesaEstado: 'reportado', motivo: motivoLimpio };
}

/**
 * Construye un payload plano mapeado para la plantilla de comanda (preview / impresión).
 * Reúne datos del ticket + boucher asociado (si viene) + configuración de moneda.
 *
 * Sale del modelo pero no la persiste — usado por el endpoint
 *   GET /api/comanda/:id/ticket-imprimible
 * y por el dashboard / cocina.
 */
async function obtenerTicketImprimible(ticketId, { boucher } = {}) {
  const ticket = await obtenerTicketPorId(ticketId);
  if (!ticket) {
    const err = new Error('Ticket no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const boucherData = boucher || ticket.boucher || null;

  const productos = (ticket.platos || []).map((p) => ({
    nombre: p.nombre,
    cantidad: p.cantidad,
    precio: p.precio,
    subtotal: p.subtotal,
    tipoServicio: p.tipoServicio,
    complementos: (p.complementosSeleccionados || []).map((c) => ({
      grupo: c.grupo,
      opcion: c.opcion,
      cantidad: c.cantidad,
    })),
    notaEspecial: p.notaEspecial || '',
    paraLlevar: p.tipoServicio === 'para_llevar',
  }));

  return {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    tipo: ticket.tipo,
    comandaNumero: ticket.comandasNumbers?.[0] ?? null,
    comandasNumbers: ticket.comandasNumbers || [],
    comandaNumeroDisplay: (ticket.comandasNumbers || []).filter((n) => n != null).length > 1
      ? (ticket.comandasNumbers || []).filter((n) => n != null).sort((a, b) => a - b).map((n) => `#${n}`).join('+')
      : ticket.comandasNumbers?.[0] != null ? `#${ticket.comandasNumbers[0]}` : '',
    cantidadComandas: (ticket.comandasNumbers || []).filter((n) => n != null).length,
    fechaPedido: ticket.createdAt,
    mesa: ticket.mesa?.nummesa ?? ticket.numMesa,
    mozo: ticket.mozo?.name || ticket.nombreMozo || ticket.mozoNombre,
    area: null, // se completa en controller si se requiere
    moneda: boucherData?.moneda || ticket.moneda || 'PEN',
    tipoPago: ticket.estado === 'pendiente_aprobacion'
      ? 'Pendiente'
      : (boucherData?.metodoPagoLabel || ticket.metodoPago || 'Pendiente'),
    observaciones: ticket.observaciones || '',
    productos,
    subtotal: ticket.subtotal,
    igv: ticket.igv,
    total: ticket.total,
    cliente: {
      nombre: ticket.clienteNombre || boucherData?.clienteNombre || NOMBRE_CLIENTE_FALLBACK,
      dni: ticket.clienteDni || boucherData?.clienteDni || '',
    },
    voucherId: ticket.voucherId || boucherData?.voucherId || boucherData?.boucherNumber || null,
  };
}

module.exports = {
  crearTicketAprobacion,
  obtenerTicketPorId,
  obtenerTicketsPendientes,
  obtenerTicketsPorFecha,
  aprobarTicket,
  reportarTicket,
  obtenerTicketImprimible,
  evaluarMesaListaParaLiberar,
};
