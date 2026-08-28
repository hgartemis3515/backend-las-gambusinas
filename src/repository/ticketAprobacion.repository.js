/**
 * Repositorio de Tickets de Aprobación (comandas completas)
 *
 * NO cubre pagos adelantados — esos viven en ticketPagoAdelantado.repository.js.
 * La bandeja unificada en cocina (Fase D) consulta ambos repositorios.
 */
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
const { adjuntarDescuentoTicket, aplicarDescuentoAVistaTicket, totalesConDescuentoImpresion, BOUCHER_DESCUENTO_SELECT, COMANDA_DESCUENTO_SELECT } = require('../utils/descuentoTicketSnapshot');
const ticketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const AuditoriaAcciones = require('../database/models/auditoriaAcciones.model');
const logger = require('../utils/logger');
const { NOMBRE_CLIENTE_FALLBACK } = require('../constants/clienteDefaults');
const {
  resolverComandasNumbers,
  formatComandasNumbersLabel,
} = require('../utils/comandasNumbers');

const ZONA = 'America/Lima';

function ahora() {
  return moment().tz(ZONA).toDate();
}

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

const MAX_COMANDA_SAVE_RETRIES = 3;

/**
 * Reclama un ticket pendiente de forma atómica para evitar doble aprobación concurrente.
 * Si ya está aprobado, devuelve el ticket existente (idempotente).
 */
async function claimTicketForApproval(ticketId, usuarioObjId, usuarioNombre, ts) {
  const claimed = await ticketAprobacionModel.findOneAndUpdate(
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

  const existing = await ticketAprobacionModel.findById(ticketId);
  if (!existing) {
    const err = new Error('Ticket de aprobación no encontrado');
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

/**
 * Guarda una comanda reintentando ante conflictos de versión (aprobaciones paralelas).
 */
async function saveComandaConReintento(comandaId, applyChanges) {
  for (let intento = 0; intento < MAX_COMANDA_SAVE_RETRIES; intento++) {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) return { modificado: false, platosLiberados: [] };

    const { modificado, platosLiberados, statusUpdate } = applyChanges(comanda);
    if (!modificado) return { modificado: false, platosLiberados };

    comanda.markModified('platos');
    comanda.updatedAt = ahora();
    if (statusUpdate) {
      Object.assign(comanda, statusUpdate);
    }

    try {
      // validateModifiedOnly: no re-validar subdocs legacy (roles custom en finalizadoPor, etc.)
      await comanda.save({ validateModifiedOnly: true });
      return { modificado: true, platosLiberados };
    } catch (err) {
      if (err.name === 'VersionError' && intento < MAX_COMANDA_SAVE_RETRIES - 1) {
        logger.warn('Conflicto al aprobar comanda, reintentando', {
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
    totalSinDescuento: data.totalSinDescuento ?? null,
    montoDescuento: data.montoDescuento || 0,
    descuentos: data.descuentos || [],
    boucher: data.boucher || null,
    voucherId: data.voucherId || null,
    moneda: data.moneda || 'PEN',
    metodoPago: data.metodoPago || 'efectivo',
    montoRecibido: data.montoRecibido ?? null,
    vuelto: data.vuelto ?? null,
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
    .populate('comandas', 'comandaNumber status platos mesas mozos descuento montoDescuento motivoDescuento totalSinDescuento totalCalculado')
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
    .populate('comandas', COMANDA_DESCUENTO_SELECT)
    .populate('boucher', BOUCHER_DESCUENTO_SELECT)
    .sort({ createdAt: 1 })
    .lean()
    .then((tickets) => tickets.map(aplicarDescuentoAVistaTicket));
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
    .populate('comandas', COMANDA_DESCUENTO_SELECT)
    .populate('boucher', BOUCHER_DESCUENTO_SELECT)
    .sort({ createdAt: -1 })
    .lean()
    .then((tickets) => tickets.map(aplicarDescuentoAVistaTicket));
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

  const { ticket, alreadyApproved } = await claimTicketForApproval(
    ticketId,
    usuarioObjId,
    usuarioNombre,
    ts
  );

  // Snapshot para auditoría
  const datosAntes = {
    ticketEstado: alreadyApproved ? 'aprobado' : 'pendiente_aprobacion',
    mesaEstado: (await mesasModel.findById(ticket.mesa).select('estado').lean())?.estado,
    comandas: ticket.comandas.map((c) => c.toString()),
    boucherId: ticket.boucher,
  };

  // Si el ticket ya estaba aprobado pero un save previo falló (p.ej. ValidationError
  // por rol custom), seguimos liberando platos/mesa para sanar el estado inconsistente.
  let platosLiberados = [];
    // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 3):
    // Liberar SOLO los platos que están en el snapshot de este ticket (por platoLineaId).
    const platosSnapshotIds = new Set(
      (ticket.platos || [])
        .map((p) => (p.platoLineaId ? String(p.platoLineaId) : null))
        .filter(Boolean)
    );

    for (const comandaId of ticket.comandas) {
      const { modificado, platosLiberados: liberados } = await saveComandaConReintento(
        comandaId,
        (comanda) => {
          const liberadosLocal = [];
          let modificadoLocal = false;

          for (const plato of comanda.platos) {
            const platoLineaIdStr = plato._id ? String(plato._id) : null;
            if (!platoLineaIdStr || !platosSnapshotIds.has(platoLineaIdStr)) continue;

            const estadoLower = (plato.estado || '').toLowerCase();
            if (estadoLower === 'pendiente') {
              plato.estado = 'pagado';
              if (!plato.tiempos) plato.tiempos = {};
              if (!plato.tiempos.pagado) plato.tiempos.pagado = ts;
              modificadoLocal = true;
              liberadosLocal.push({
                comandaId: comanda._id,
                comandaNumber: comanda.comandaNumber,
                platoLineaId: plato._id,
                platoId: plato.plato,
                estadoNuevo: 'pagado',
              });
            }
          }

          if (!modificadoLocal) {
            return { modificado: false, platosLiberados: liberadosLocal };
          }

          const platosActivos = (comanda.platos || []).filter(
            (p) => !p.eliminado && !p.anulado
          );
          const todosPagados = platosActivos.length > 0
            && platosActivos.every((p) => (p.estado || '').toLowerCase() === 'pagado');

          const statusUpdate = todosPagados
            ? { status: 'pagado', IsActive: false, tiempoPagado: comanda.tiempoPagado || ts }
            : { status: 'pendiente_aprobar', IsActive: true };

          return { modificado: true, platosLiberados: liberadosLocal, statusUpdate };
        }
      );

      if (modificado) {
        platosLiberados = platosLiberados.concat(liberados);
      }
    }

  if (alreadyApproved && platosLiberados.length === 0) {
    // Nada pendiente por liberar: devolver estado actual de mesa.
    return {
      ticket,
      platosLiberados: [],
      mesaEstado: datosAntes.mesaEstado,
      alreadyApproved: true,
    };
  }

  // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 3):
  // Mesa → 'pagado' SOLO si todo el ciclo está cobrado y aprobado.
  // Criterios:
  //   1. No quedan comandas activas con platos 'entregado' (sin cobrar).
  //   2. No quedan comandas activas con platos 'pendiente' (cobrados, sin aprobar).
  //   3. No hay otros tickets 'pendiente_aprobacion' del mismo pedido/mesa hoy.
  let mesaEstadoFinal = null;
  const mesaDoc = await mesasModel.findById(ticket.mesa).select('estado').lean();
  if (mesaDoc) {
    const evaluacion = await evaluarMesaListaParaLiberar(ticket.mesa, ticket.pedido);
    if (evaluacion.lista && mesaDoc.estado !== 'reportado') {
      await mesasModel.findByIdAndUpdate(ticket.mesa, { estado: 'pagado' });
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
      await mesasModel.findByIdAndUpdate(ticket.mesa, { estado: 'pendiente_aprobar' });
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

  // PLAN_BUG_CONEXION_APROBACION_TICKETS_COCINA (Fase 4):
  // Considerar también los PPA (pagos adelantados) pendientes de aprobación
  // para esta mesa hoy. Antes, aprobar un TicketAprobación podía liberar la
  // mesa a 'pagado' aunque existiera un PPA pendiente de aprobación.
  const ppaPendientesQuery = {
    mesa: mesaId,
    estado: 'pendiente_aprobacion',
    createdAt: { $gte: inicioDia, $lte: finDia },
    isActive: true,
  };
  const ppaPendientes = await ticketPagoAdelantadoModel.countDocuments(ppaPendientesQuery);
  if (ppaPendientes > 0) {
    razones.push(`hay ${ppaPendientes} pago(s) adelantado(s) pendiente(s) de aprobación`);
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

  const comandasNumbers = resolverComandasNumbers({
    comandasNumbers: ticket.comandasNumbers,
    platos: ticket.platos,
  });
  const comandaNumeroDisplay = formatComandasNumbersLabel(comandasNumbers)
    || (ticket.comandasNumbers?.[0] != null ? `#${ticket.comandasNumbers[0]}` : '');

  let igvSnap = { igvPorcentaje: 18, nombreImpuesto: 'IGV' };
  try {
    const calculosPrecios = require('../utils/calculosPrecios');
    const cfg = await calculosPrecios.getConfigMonedaCached();
    const pct = Number(cfg?.igvPorcentaje);
    igvSnap = {
      igvPorcentaje: Number.isFinite(pct) ? pct : 18,
      nombreImpuesto: cfg?.nombreImpuestoPrincipal || 'IGV',
    };
  } catch (_) { /* fallback 18% */ }

    const desc = totalesConDescuentoImpresion(ticket, {
      subtotal: ticket.subtotal,
      total: ticket.total,
    });
    return {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    tipo: ticket.tipo,
    comandaNumero: comandasNumbers[0] ?? ticket.comandasNumbers?.[0] ?? null,
    comandasNumbers,
    comandaNumeroDisplay,
    cantidadComandas: comandasNumbers.length || 1,
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
    subtotal: desc.subtotal,
    igv: ticket.igv,
    igvPorcentaje: igvSnap.igvPorcentaje,
    nombreImpuesto: igvSnap.nombreImpuesto,
    total: desc.total,
    montoDescuento: desc.montoDescuento,
    totalSinDescuento: desc.totalSinDescuento,
    descuentos: desc.descuentos,
    cliente: {
      nombre: ticket.clienteNombre || boucherData?.clienteNombre || NOMBRE_CLIENTE_FALLBACK,
      dni: ticket.clienteDni || boucherData?.clienteDni || '',
    },
    voucherId: ticket.voucherId || boucherData?.voucherId || boucherData?.boucherNumber || null,
    montoRecibido: ticket.montoRecibido ?? boucherData?.montoRecibido ?? null,
    vuelto: ticket.vuelto ?? boucherData?.vuelto ?? null,
  };
}

/**
 * Tickets de aprobación asociados a una comanda (cualquier estado).
 */
async function obtenerTicketsPorComanda(comandaId) {
  if (!mongoose.Types.ObjectId.isValid(comandaId)) return [];
  return ticketAprobacionModel
    .find({ comandas: comandaId, isActive: true })
    .populate('mozo', 'name')
    .populate('comandas', COMANDA_DESCUENTO_SELECT)
    .populate('boucher', 'boucherNumber voucherId metodoPago montoDescuento descuentos totalSinDescuento')
    .sort({ createdAt: -1 })
    .lean()
    .then((tickets) => tickets.map(aplicarDescuentoAVistaTicket));
}

/**
 * Editar campos permitidos de un ticket pendiente (admin).
 */
async function actualizarTicketAdmin(ticketId, { observaciones, metodoPago }) {
  const ticket = await ticketAprobacionModel.findById(ticketId);
  if (!ticket || !ticket.isActive) {
    const err = new Error('Ticket de aprobación no encontrado');
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
  }
  await ticket.save();
  return ticket.toObject();
}

/**
 * Anular un ticket pendiente desde admin: revierte platos 'pendiente' → 'entregado'.
 * El boucher contable permanece intacto.
 */
async function eliminarTicketAdmin(ticketId, motivo, usuarioId, usuarioNombre) {
  const motivoLimpio = String(motivo || '').trim();
  if (motivoLimpio.length < 3) {
    const err = new Error('El motivo de eliminación es obligatorio (mínimo 3 caracteres)');
    err.statusCode = 400;
    throw err;
  }

  const ts = ahora();
  const usuarioObjId = toObjectId(usuarioId);
  const ticket = await ticketAprobacionModel.findById(ticketId);

  if (!ticket || !ticket.isActive) {
    const err = new Error('Ticket de aprobación no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (ticket.estado !== 'pendiente_aprobacion') {
    const err = new Error(`No se puede eliminar un ticket en estado "${ticket.estado}"`);
    err.statusCode = 400;
    throw err;
  }

  const platosSnapshotIds = new Set(
    (ticket.platos || [])
      .map((p) => (p.platoLineaId ? String(p.platoLineaId) : null))
      .filter(Boolean)
  );

  const comandasAfectadas = [];
  for (const comandaId of ticket.comandas) {
    const comanda = await comandaModel.findById(comandaId);
    if (!comanda) continue;

    let modificado = false;
    for (const plato of comanda.platos) {
      const platoLineaIdStr = plato._id ? String(plato._id) : null;
      if (!platoLineaIdStr || !platosSnapshotIds.has(platoLineaIdStr)) continue;
      if ((plato.estado || '').toLowerCase() === 'pendiente') {
        plato.estado = 'entregado';
        modificado = true;
      }
    }

    if (modificado) {
      const platosActivos = (comanda.platos || []).filter((p) => !p.eliminado && !p.anulado);
      const hayPendientes = platosActivos.some((p) => (p.estado || '').toLowerCase() === 'pendiente');
      const hayEntregados = platosActivos.some((p) => (p.estado || '').toLowerCase() === 'entregado');
      const todosPagados = platosActivos.length > 0
        && platosActivos.every((p) => (p.estado || '').toLowerCase() === 'pagado');

      if (todosPagados) {
        comanda.status = 'pagado';
      } else if (hayPendientes) {
        comanda.status = 'pendiente_aprobar';
      } else if (hayEntregados) {
        comanda.status = 'entregado';
        comanda.IsActive = true;
      }

      comanda.markModified('platos');
      comanda.updatedAt = ts;
      await comanda.save();
      comandasAfectadas.push(comanda._id);
    }
  }

  ticket.isActive = false;
  ticket.observaciones = ticket.observaciones
    ? `${ticket.observaciones}\n[Anulado admin: ${motivoLimpio}]`
    : `[Anulado admin: ${motivoLimpio}]`;
  await ticket.save();

  try {
    const { recalcularEstadoMesa } = require('./comanda.repository');
    await recalcularEstadoMesa(ticket.mesa);
  } catch (mesaErr) {
    logger.warn('No se pudo recalcular mesa tras anular ticket', { error: mesaErr.message });
  }

  try {
    await AuditoriaAcciones.create({
      accion: 'TICKET_APROBACION_ANULADO_ADMIN',
      entidadId: ticket._id,
      entidadTipo: 'ticket',
      usuario: usuarioObjId,
      motivo: motivoLimpio,
      metadata: {
        ticketNumber: ticket.ticketNumber,
        tipo: ticket.tipo,
        numMesa: ticket.numMesa,
        anuladoPor: usuarioNombre,
        comandasAfectadas,
        boucherId: ticket.boucher,
        boucherIntacto: true,
      },
    });
  } catch (auditErr) {
    logger.error('Error auditoría anulación ticket', { error: auditErr.message });
  }

  logger.info(`TicketAprobacion #${ticket.ticketNumber} anulado por admin (${usuarioNombre})`);
  return { ticket: ticket.toObject(), comandasAfectadas };
}

module.exports = {
  crearTicketAprobacion,
  obtenerTicketPorId,
  obtenerTicketsPendientes,
  obtenerTicketsPorFecha,
  obtenerTicketsPorComanda,
  actualizarTicketAdmin,
  eliminarTicketAdmin,
  aprobarTicket,
  reportarTicket,
  obtenerTicketImprimible,
  evaluarMesaListaParaLiberar,
};
