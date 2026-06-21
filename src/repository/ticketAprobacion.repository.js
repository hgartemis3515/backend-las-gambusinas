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
    tipo: 'comanda_completa',
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
 * Aprobar ticket de comanda completa:
 *  1. ticket.estado → 'aprobado'
 *  2. platos asociados: 'pendiente' → 'pedido' (entran al KDS)
 *  3. mesa: 'pendiente_aprobar' → 'pagado'
 *  4. auditoría COMANDA_APROBADA_COCINA
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

  // Liberar platos: 'pendiente' → 'pagado' en cada comanda asociada
  // PLAN_PLANTILLA_COMANDAS v2: cocina aprueba → platos 'pagado' (cobrados),
  // la comanda pasa a status 'pagado' (IsActive=false) y la mesa a 'pagado'.
  // El KDS debe mostrar las comandas con platos en 'pagado' como pendientes de preparar
  // (filtro ajustado en ComandastylePerso.jsx / comandastyle.jsx para no ocultarlas).
  const platosLiberados = [];
  for (const comandaId of ticket.comandas) {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) continue;

    let modificado = false;
    for (const plato of comanda.platos) {
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
      // PLAN_PLANTILLA_COMANDAS: al aprobar, la comanda pasa a 'pagado' (cerrada contablemente).
      comanda.status = 'pagado';
      comanda.IsActive = false;
      if (!comanda.tiempoPagado) comanda.tiempoPagado = ts;
      await comanda.save();
    }
  }

  // Mesa: 'pendiente_aprobar' → 'pagado'
  const mesaDoc = await mesasModel.findById(ticket.mesa);
  if (mesaDoc && mesaDoc.estado === 'pendiente_aprobar') {
    mesaDoc.estado = 'pagado';
    await mesaDoc.save();
  }

  // Auditoría
  try {
    await AuditoriaAcciones.create({
      accion: 'COMANDA_APROBADA_COCINA',
      entidadId: ticket._id,
      entidadTipo: 'comanda',
      usuario: usuarioObjId,
      datosAntes,
      datosDespues: { ticketEstado: 'aprobado', mesaEstado: 'pagado' },
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
      },
    });
  } catch (auditErr) {
    logger.error('Error registrando auditoría de aprobación de comanda', {
      error: auditErr.message,
    });
  }

  logger.info(
    `TicketAprobacion #${ticket.ticketNumber} aprobado por ${usuarioNombre}. Platos liberados: ${platosLiberados.length}`
  );

  return { ticket, platosLiberados, mesaEstado: 'pagado' };
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
};
