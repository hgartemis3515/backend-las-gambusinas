/**
 * Controller de Aprobación de Comandas — Las Gambusinas
 *
 * Endpoints:
 *   GET  /api/aprobacion/pendientes           — Lista unificada (comandas + PPA)
 *   PUT  /api/aprobacion/:id/aprobar          — Aprueba comanda o PPA
 *   PUT  /api/aprobacion/:id/reportar          — Reporta comanda con motivo obligatorio
 *   GET  /api/comanda/:id/ticket-imprimible    — Datos mapeados para plantilla comanda
 */
const express = require('express');
const router = express.Router();

const moment = require('moment-timezone');
const mongoose = require('mongoose');
const aprobacionService = require('../services/aprobacionComanda.service');
const ticketAprobacionRepository = require('../repository/ticketAprobacion.repository');
const ticketPagoAdelantadoRepository = require('../repository/ticketPagoAdelantado.repository');
const comandaModel = require('../database/models/comanda.model');
const boucherModel = require('../database/models/boucher.model');
const configuracionRepository = require('../repository/configuracion.repository');
const { NOMBRE_CLIENTE_FALLBACK } = require('../constants/clienteDefaults');
const labelMetodoPago = require('../services/boucherPagoService').labelMetodoPago;
const logger = require('../utils/logger');
const {
  resolverComandasNumbers,
  formatComandasNumbersLabel,
} = require('../utils/comandasNumbers');

/**
 * GET /api/aprobacion/pendientes
 * Lista tickets pendientes de aprobación, tipo COMANDA y/o ADELANTADO.
 * Query params: tipo=COMANDA|ADELANTADO (opcional), fecha=YYYY-MM-DD (opcional)
 */
router.get('/aprobacion/pendientes', async (req, res) => {
  try {
    const { tipo, fecha } = req.query;

    if (tipo === 'ADELANTADO') {
      const tickets = await ticketPagoAdelantadoRepository.obtenerTicketsPendientes(fecha || null);
      return res.json({
        success: true,
        tickets: tickets.map((t) => ({ ...t, tipo: 'ADELANTADO' })),
      });
    }

    if (tipo === 'COMANDA') {
      const tickets = await ticketAprobacionRepository.obtenerTicketsPendientes(fecha || null);
      return res.json({
        success: true,
        tickets: tickets.map((t) => ({
          ...t,
          tipo: t.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA',
        })),
      });
    }

    // Sin tipo: lista unificada
    const tickets = await aprobacionService.obtenerTicketsUnificadosPendientes(fecha || null);
    res.json({ success: true, tickets });
  } catch (error) {
    logger.error('Error al obtener tickets de aprobación', { error: error.message });
    res.status(500).json({ success: false, message: 'Error al obtener tickets de aprobación' });
  }
});

/**
 * GET /api/aprobacion/fecha/:fecha
 * Lista todos los tickets de aprobación (cualquier estado) de una fecha.
 */
router.get('/aprobacion/fecha/:fecha', async (req, res) => {
  try {
    const { fecha } = req.params;
    const ticketsComanda = await ticketAprobacionRepository.obtenerTicketsPorFecha(fecha);
    const ticketsPPA = await ticketPagoAdelantadoRepository.obtenerTicketsPorFecha(fecha);

    const tickets = [
      ...ticketsComanda.map((t) => ({
        ...t,
        tipo: t.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA',
      })),
      ...ticketsPPA.map((t) => ({ ...t, tipo: 'ADELANTADO' })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, tickets });
  } catch (error) {
    logger.error('Error al obtener comandas pendientes de aprobación', { error: error.message });
    res.status(500).json({ success: false, message: 'Error al obtener comandas pendientes' });
  }
});

/**
 * PUT /api/aprobacion/:id/aprobar
 * Aprueba un ticket (comanda completa o PPA).
 * Body: { tipo?: 'COMANDA'|'ADELANTADO', usuarioId, usuarioNombre }
 * El tipo es opcional: si no se indica o no coincide con la colección,
 * se detecta automáticamente buscando en ambas colecciones.
 */
router.put('/aprobacion/:id/aprobar', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, usuarioId, usuarioNombre } = req.body;

    // Normalizar tipo (puede estar vacío — el servicio lo detecta automáticamente)
    const tipoHint = tipo
      ? (String(tipo).toUpperCase() === 'ADELANTADO' ? 'ADELANTADO' : 'COMANDA')
      : 'COMANDA';

    const result = await aprobacionService.aprobarTicketUnificado(id, tipoHint, usuarioId, usuarioNombre);

    // Emitir sockets según tipo real del resultado
    const tipoReal = result.tipo;

    if (tipoReal === 'COMANDA' && result.ticket) {
      // Cocina: comanda aprobada — platos ahora en KDS
      if (global.emitComandaAprobada) {
        try {
          await global.emitComandaAprobada(result.ticket, result.platosLiberados);
        } catch (e) {
          logger.warn('Error emitiendo comanda-aprobada', { error: e.message });
        }
      }
      // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 3):
      // La mesa puede quedar en 'pendiente_aprobar' (faltan más tickets del ciclo)
      // o pasar a 'pagado' (último ticket aprobado). El estado viene en result.mesaEstado.
      const estadoMesaFinal = result.mesaEstado || 'pendiente_aprobar';
      if (global.emitMesaActualizada) {
        try {
          await global.emitMesaActualizada(result.ticket.mesa?.toString(), estadoMesaFinal);
        } catch (e) {
          logger.warn('Error emitiendo mesa-actualizada tras aprobación', { error: e.message });
        }
      }

      // Socket cocina: actualizar bandeja de aprobación
      const io = global.io;
      if (io) {
        const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('comanda-aprobada', {
          ticketId: result.ticket._id,
          ticketNumber: result.ticket.ticketNumber,
          tipo: 'COMANDA',
          aprobadoPorNombre: usuarioNombre,
          fechaAprobacion: result.ticket.fechaAprobacion || new Date().toISOString(),
          mesaEstado: estadoMesaFinal,
        });
        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-actualizado', {
          ticketId: result.ticket._id,
          estado: 'aprobado',
        });
        // Mozos: comunicar el estado real de la mesa (pagado solo si es liberable)
        io.of('/mozos').to(`mesa-${result.ticket.mesa}`).emit('mesa-actualizada', {
          mesaId: result.ticket.mesa?.toString(),
          estado: estadoMesaFinal,
          listaParaLiberar: estadoMesaFinal === 'pagado',
        });
      }
    }

    if (tipoReal === 'ADELANTADO' && result.ticket) {
      // PPA aprobado: emitir sockets de PPA (los mismos que en pagoAdelantadoController)
      const io = global.io;
      if (io) {
        const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
        const ticket = result.ticket;

        // Notificar a cocina
        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-aprobado', {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          comandas: ticket.comandas,
          platosLiberados: result.platosLiberados || [],
          message: `Ticket PPA #${ticket.ticketNumber} aprobado`,
        });

        // Notificar al mozo
        io.of('/mozos').to(`mozo-${ticket.mozo}`).emit('ticket-ppa-aprobado', {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          mesa: ticket.mesa,
          message: `Pago adelantado aprobado por cocina para mesa ${ticket.numMesa}`,
        });

        // Notificar a la mesa
        io.of('/mozos').to(`mesa-${ticket.mesa}`).emit('ticket-ppa-aprobado', {
          ticketId: ticket._id,
          comandas: ticket.comandas,
          message: 'Pago adelantado aprobado',
        });

        // Emitir comandas actualizadas
        for (const comandaId of (ticket.comandas || [])) {
          try {
            const comandaActualizada = await mongoose.model('Comanda').findById(comandaId)
              .populate('platos.plato', 'nombre precio id')
              .populate('mozos', 'name')
              .populate('mesas', 'nummesa estado nombreCombinado')
              .lean();

            if (comandaActualizada) {
              io.of('/cocina').to(`fecha-${fechaHoy}`).emit('comanda-actualizada', {
                comandaId,
                comanda: comandaActualizada,
                status: comandaActualizada.status,
              });
              io.of('/mozos').to(`mesa-${ticket.mesa}`).emit('comanda-actualizada', {
                comandaId,
                comanda: comandaActualizada,
                status: comandaActualizada.status,
              });
            }
          } catch (emitErr) {
            logger.warn('Error emitiendo comanda-actualizada tras aprobación PPA', { error: emitErr.message });
          }
        }

        // Actualizar bandeja PPA en cocina
        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-actualizado', {
          ticketId: ticket._id,
          estado: 'aprobado',
          ticket,
        });
        io.of('/admin').emit('ticket-ppa-actualizado', {
          ticketId: ticket._id,
          estado: 'aprobado',
        });

        // Mesa: pendiente_pago → pedido
        io.of('/mozos').emit('mesa-actualizada', {
          mesaId: ticket.mesa,
          estado: 'pedido',
          nummesa: ticket.numMesa,
        });
        io.of('/admin').emit('mesa-actualizada', {
          mesaId: ticket.mesa,
          estado: 'pedido',
          nummesa: ticket.numMesa,
        });
      }
    }

    res.json({
      success: true,
      message: `Ticket ${tipoReal} aprobado exitosamente`,
      resultado: result,
    });
  } catch (error) {
    logger.error('Error al aprobar ticket de aprobación', { error: error.message });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/aprobacion/:id/reportar
 * Reporta una comanda completa con motivo obligatorio.
 * NO aplica a PPA (usar rechazar en PPA existente).
 * Body: { motivo, usuarioId, usuarioNombre }
 */
router.put('/aprobacion/:id/reportar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo, usuarioId, usuarioNombre } = req.body;

    const result = await aprobacionService.reportarTicketComanda(id, motivo, usuarioId, usuarioNombre);

    // Socket mozos: mesa reportada (rojo en mapa)
    if (result.ticket && global.emitMesaReportada) {
      try {
        await global.emitMesaReportada(
          result.ticket.mesa.toString(),
          'reportado',
          result.motivo
        );
      } catch (e) {
        logger.warn('Error emitiendo mesa-reportada', { error: e.message });
      }
    }

    // Socket cocina: actualizar bandeja
    if (result.ticket && global.emitTicketReportado) {
      try {
        await global.emitTicketReportado(result.ticket);
      } catch (e) {
        logger.warn('Error emitiendo ticket-reportado', { error: e.message });
      }
    }

    res.json({
      success: true,
      message: 'Comanda reportada exitosamente',
      resultado: {
        ticketId: result.ticket._id,
        ticketNumber: result.ticket.ticketNumber,
        mesaId: result.ticket.mesa,
        numMesa: result.ticket.numMesa,
        mozoNombre: result.ticket.nombreMozo || result.ticket.mozoNombre,
        comandasNumbers: result.ticket.comandasNumbers,
        estado: result.ticket.estado,
        motivo: result.motivo,
      },
    });
  } catch (error) {
    logger.error('Error al reportar comanda', { error: error.message });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/comanda/:id/tickets
 * Lista todos los tickets (comanda, parcial, adelantado) asociados a una comanda.
 */
router.get('/comanda/:id/tickets', async (req, res) => {
  try {
    const { id } = req.params;
    const tickets = await aprobacionService.obtenerTicketsPorComanda(id);
    res.json({ success: true, tickets });
  } catch (error) {
    logger.error('Error al obtener tickets de comanda', { error: error.message });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/aprobacion/:id/editar
 * Edita observaciones/método de pago de un ticket pendiente (admin).
 * Body: { tipo?: 'COMANDA'|'ADELANTADO', observaciones?, metodoPago? }
 */
router.put('/aprobacion/:id/editar', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, observaciones, metodoPago } = req.body;

    const result = await aprobacionService.actualizarTicketUnificado(id, tipo, {
      observaciones,
      metodoPago,
    });

    const io = global.io;
    if (io) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
      const payload = {
        ticketId: result.ticket._id,
        ticket: result.ticket,
        tipo: result.tipo,
        comandas: result.ticket.comandas,
      };
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-actualizado', payload);
      io.of('/admin').emit('ticket-actualizado', payload);
    }

    res.json({ success: true, ticket: result.ticket, tipo: result.tipo });
  } catch (error) {
    logger.error('Error al editar ticket', { error: error.message });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/aprobacion/:id/eliminar
 * Anula un ticket pendiente desde admin (motivo obligatorio).
 * Body: { tipo?: 'COMANDA'|'ADELANTADO', motivo, usuarioId?, usuarioNombre? }
 */
router.put('/aprobacion/:id/eliminar', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, motivo, usuarioId, usuarioNombre } = req.body;

    const result = await aprobacionService.eliminarTicketUnificado(
      id,
      tipo,
      motivo,
      usuarioId || 'admin',
      usuarioNombre || 'Admin'
    );

    const io = global.io;
    if (io) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
      const ticket = result.ticket;
      const payload = {
        ticketId: ticket._id,
        estado: result.tipo === 'ADELANTADO' ? 'rechazado' : 'anulado',
        tipo: result.tipo,
        comandas: ticket.comandas,
        comandasAfectadas: result.comandasAfectadas || [],
      };
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-eliminado', payload);
      io.of('/admin').emit('ticket-eliminado', payload);

      for (const comandaId of (result.comandasAfectadas || ticket.comandas || [])) {
        try {
          const comandaActualizada = await comandaModel.findById(comandaId)
            .populate('platos.plato', 'nombre precio id')
            .populate('mozos', 'name')
            .populate('mesas', 'nummesa estado nombreCombinado')
            .lean();
          if (comandaActualizada) {
            io.of('/admin').emit('comanda-actualizada', {
              comandaId,
              comanda: comandaActualizada,
              status: comandaActualizada.status,
            });
          }
        } catch (emitErr) {
          logger.warn('Error emitiendo comanda tras eliminar ticket', { error: emitErr.message });
        }
      }
    }

    res.json({
      success: true,
      message: 'Ticket eliminado correctamente',
      resultado: result,
    });
  } catch (error) {
    logger.error('Error al eliminar ticket', { error: error.message });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/aprobacion/:id/ticket-imprimible
 * Datos de impresión para un TicketAprobacion o TicketPagoAdelantado específico.
 */
router.get('/aprobacion/:id/ticket-imprimible', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'ID de ticket inválido' });
    }

    const ticketAprobacion = await mongoose.model('TicketAprobacion').findOne({
      _id: id,
      isActive: true,
    }).lean();

    if (ticketAprobacion) {
      const imprimible = await ticketAprobacionRepository.obtenerTicketImprimible(ticketAprobacion._id);
      return res.json({ success: true, datos: imprimible });
    }

    const ticketPPA = await mongoose.model('TicketPagoAdelantado').findOne({
      _id: id,
      isActive: true,
    }).lean();

    if (ticketPPA) {
      const ppaComandasNumbers = resolverComandasNumbers({
        comandasNumbers: ticketPPA.comandasNumbers,
        platos: ticketPPA.platos,
      });
      const ppaDisplay = formatComandasNumbersLabel(ppaComandasNumbers)
        || (ppaComandasNumbers[0] != null ? `#${ppaComandasNumbers[0]}` : '');
      return res.json({
        success: true,
        datos: {
          ticketId: ticketPPA._id,
          ticketNumber: ticketPPA.ticketNumber,
          tipo: 'ADELANTADO',
          comandaNumero: ppaComandasNumbers[0] ?? null,
          comandasNumbers: ppaComandasNumbers,
          comandaNumeroDisplay: ppaDisplay,
          cantidadComandas: ppaComandasNumbers.length || 1,
          fechaPedido: ticketPPA.createdAt,
          mesa: ticketPPA.numMesa,
          mozo: ticketPPA.nombreMozo || ticketPPA.mozoNombre,
          area: null,
          moneda: 'PEN',
          tipoPago: ticketPPA.estado === 'pendiente_aprobacion'
            ? 'Pendiente'
            : (ticketPPA.metodoPago || 'efectivo'),
          observaciones: ticketPPA.observaciones || '',
          productos: (ticketPPA.platos || []).map((p) => ({
            nombre: p.nombre,
            cantidad: p.cantidad,
            precio: p.precio,
            subtotal: p.subtotal,
            tipoServicio: p.tipoServicio,
            complementos: (p.complementosSeleccionados || []).map((c) => ({
              grupo: c.grupo,
              opcion: c.opcion,
            })),
            notaEspecial: p.notaEspecial || '',
            paraLlevar: p.tipoServicio === 'para_llevar',
          })),
          subtotal: ticketPPA.subtotal,
          igv: ticketPPA.igv,
          total: ticketPPA.total,
          cliente: { nombre: NOMBRE_CLIENTE_FALLBACK, dni: '' },
          voucherId: ticketPPA.voucherId || null,
        },
      });
    }

    return res.status(404).json({ success: false, message: 'Ticket no encontrado' });
  } catch (error) {
    logger.error('Error al obtener ticket imprimible por id', { error: error.message });
    res.status(500).json({ success: false, message: 'Error al obtener datos de impresión' });
  }
});

/**
 * GET /api/comanda/:id/ticket-imprimible
 * Devuelve los datos mapeados de una comanda para la plantilla de impresión de comanda.
 * Busca primero por comandaId; si no existe ticket de aprobación, construye
 * datos imprimibles desde la comanda + boucher asociado.
 */
router.get('/comanda/:id/ticket-imprimible', async (req, res) => {
  try {
    const { id } = req.params;
    const { ticketId } = req.query;

    // Si se indica ticketId, devolver ese ticket concreto (pagos parciales)
    if (ticketId && mongoose.Types.ObjectId.isValid(ticketId)) {
      const ticketEspecifico = await mongoose.model('TicketAprobacion').findOne({
        _id: ticketId,
        comandas: id,
        isActive: true,
      }).lean();

      if (ticketEspecifico) {
        const imprimible = await ticketAprobacionRepository.obtenerTicketImprimible(ticketEspecifico._id);
        return res.json({ success: true, datos: imprimible });
      }
    }

    // 1. Buscar TicketAprobacion que contenga esta comanda
    const ticketComanda = await ticketAprobacionRepository.obtenerTicketPorId
      ? await ticketAprobacionRepository.obtenerTicketsPendientes()
      : [];

    // Buscar por comandas array
    const ticketAprobacion = await mongoose.model('TicketAprobacion').findOne({
      comandas: id,
      isActive: true,
    }).sort({ createdAt: -1 }).lean();

    if (ticketAprobacion) {
      const imprimible = await ticketAprobacionRepository.obtenerTicketImprimible(ticketAprobacion._id);
      return res.json({ success: true, datos: imprimible });
    }

    // 2. Buscar TicketPagoAdelantado
    const ticketPPA = await mongoose.model('TicketPagoAdelantado').findOne({
      comandas: id,
      isActive: true,
    }).sort({ createdAt: -1 }).lean();

    if (ticketPPA) {
      const ppaComandasNumbers = resolverComandasNumbers({
        comandasNumbers: ticketPPA.comandasNumbers,
        platos: ticketPPA.platos,
      });
      const ppaDisplay = formatComandasNumbersLabel(ppaComandasNumbers)
        || (ppaComandasNumbers[0] != null ? `#${ppaComandasNumbers[0]}` : '');
      return res.json({
        success: true,
        datos: {
          ticketId: ticketPPA._id,
          ticketNumber: ticketPPA.ticketNumber,
          tipo: 'ADELANTADO',
          comandaNumero: ppaComandasNumbers[0] ?? null,
          comandasNumbers: ppaComandasNumbers,
          comandaNumeroDisplay: ppaDisplay,
          cantidadComandas: ppaComandasNumbers.length || 1,
          fechaPedido: ticketPPA.createdAt,
          mesa: ticketPPA.mesa?.nummesa ?? ticketPPA.numMesa,
          mozo: ticketPPA.mozo?.name || ticketPPA.nombreMozo || ticketPPA.mozoNombre,
          area: null,
          moneda: 'PEN',
          tipoPago: ticketPPA.estado === 'pendiente_aprobacion'
            ? 'Pendiente'
            : (ticketPPA.metodoPago || 'efectivo'),
          observaciones: ticketPPA.observaciones || '',
          productos: (ticketPPA.platos || []).map((p) => ({
            nombre: p.nombre,
            cantidad: p.cantidad,
            precio: p.precio,
            subtotal: p.subtotal,
            tipoServicio: p.tipoServicio,
            complementos: (p.complementosSeleccionados || []).map((c) => ({
              grupo: c.grupo,
              opcion: c.opcion,
            })),
            notaEspecial: p.notaEspecial || '',
            paraLlevar: p.tipoServicio === 'para_llevar',
          })),
          subtotal: ticketPPA.subtotal,
          igv: ticketPPA.igv,
          total: ticketPPA.total,
          cliente: { nombre: NOMBRE_CLIENTE_FALLBACK, dni: '' },
          voucherId: ticketPPA.voucherId || null,
        },
      });
    }

    // 3. Sin ticket: construir datos imprimibles desde la comanda directamente
    const comanda = await comandaModel.findById(id)
      .populate('platos.plato')
      .populate('mozos', 'name _id')
      .populate({ path: 'mesas', populate: { path: 'area' } })
      .populate('cliente')
      .lean();

    if (!comanda) {
      return res.status(404).json({ success: false, message: 'Comanda no encontrada' });
    }

    // Buscar boucher asociado (fuente de comandasNumbers post-pago)
    const boucher = await boucherModel.findOne({
      comandas: comanda._id,
      isActive: { $ne: false },
    }).sort({ createdAt: -1 }).lean();

    // Resolver comandasNumbers: boucher > pedido > platos snapshot > sola
    let comandasNumbers = boucher?.comandasNumbers?.length
      ? resolverComandasNumbers({ comandasNumbers: boucher.comandasNumbers })
      : [comanda.comandaNumber];

    if (!boucher?.comandasNumbers?.length && comanda.pedido) {
      try {
        const pedido = await mongoose.model('Pedido').findById(comanda.pedido).lean();
        if (pedido?.comandasNumbers?.length) {
          comandasNumbers = resolverComandasNumbers({ comandasNumbers: pedido.comandasNumbers });
        }
      } catch (e) {
        // Pedido no encontrado: usar comandaNumber individual
      }
    }

    const comandaNumeroDisplay = formatComandasNumbersLabel(comandasNumbers)
      || (comanda.comandaNumber != null ? `#${comanda.comandaNumber}` : '');

    const config = await configuracionRepository.obtenerConfiguracion();

    const productos = (comanda.platos || [])
      .filter((p) => !p.eliminado && !p.anulado)
      .map((p) => ({
        nombre: p.plato?.nombre || 'Plato',
        cantidad: comanda.cantidades?.[comanda.platos.indexOf(p)] || 1,
        precio: p.plato?.precio || p.precio || 0,
        subtotal: (p.plato?.precio || p.precio || 0) * (comanda.cantidades?.[comanda.platos.indexOf(p)] || 1),
        tipoServicio: p.tipoServicio || 'mesa',
        complementos: (p.complementosSeleccionados || []).map((c) => ({
          grupo: c.grupo,
          opcion: c.opcion,
        })),
        notaEspecial: p.notaEspecial || '',
        paraLlevar: p.tipoServicio === 'para_llevar',
      }));

    const imprimible = {
      ticketId: null,
      ticketNumber: comanda.comandaNumber,
      tipo: 'COMANDA',
      comandaNumero: comandasNumbers[0] ?? comanda.comandaNumber,
      comandasNumbers,
      comandaNumeroDisplay,
      cantidadComandas: comandasNumbers.length || 1,
      fechaPedido: comanda.createdAt,
      mesa: comanda.mesas?.nummesa ?? comanda.mesaNumero ?? null,
      mozo: comanda.mozos?.name || comanda.mozoNombre || 'N/A',
      area: comanda.mesas?.area?.nombre ?? comanda.areaNombre ?? null,
      moneda: boucher?.moneda || config.moneda || 'PEN',
      tipoPago: boucher?.metodoPagoLabel || labelMetodoPago(boucher?.metodoPago) || 'Pendiente',
      observaciones: comanda.observaciones || '',
      productos,
      subtotal: boucher?.subtotal ?? comanda.precioTotal ?? 0,
      igv: boucher?.igv ?? 0,
      total: boucher?.total ?? comanda.precioTotal ?? 0,
      cliente: {
        nombre: boucher?.clienteNombre || comanda.clienteNombre || comanda.cliente?.nombre || NOMBRE_CLIENTE_FALLBACK,
        dni: boucher?.clienteDni || comanda.cliente?.dni || '',
      },
      voucherId: boucher?.voucherId || boucher?.boucherNumber || null,
    };

    res.json({ success: true, datos: imprimible });
  } catch (error) {
    logger.error('Error al obtener datos imprimible', { error: error.message });
    res.status(500).json({ success: false, message: 'Error al obtener datos de comanda imprimible' });
  }
});

module.exports = router;