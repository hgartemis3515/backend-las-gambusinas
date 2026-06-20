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

const mongoose = require('mongoose');
const aprobacionService = require('../services/aprobacionComanda.service');
const ticketAprobacionRepository = require('../repository/ticketAprobacion.repository');
const ticketPagoAdelantadoRepository = require('../repository/ticketPagoAdelantado.repository');
const comandaModel = require('../database/models/comanda.model');
const boucherModel = require('../database/models/boucher.model');
const configuracionRepository = require('../repository/configuracion.repository');
const labelMetodoPago = require('../services/boucherPagoService').labelMetodoPago;
const logger = require('../utils/logger');

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
        tickets: tickets.map((t) => ({ ...t, tipo: 'COMANDA' })),
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
      ...ticketsComanda.map((t) => ({ ...t, tipo: 'COMANDA' })),
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
 * Body: { tipo: 'COMANDA'|'ADELANTADO', usuarioId, usuarioNombre }
 */
router.put('/aprobacion/:id/aprobar', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, usuarioId, usuarioNombre } = req.body;

    if (!tipo) {
      return res.status(400).json({ success: false, message: 'Debe indicar el tipo de ticket: COMANDA o ADELANTADO' });
    }

    const tipoNormalizado = String(tipo).toUpperCase() === 'ADELANTADO' ? 'ADELANTADO' : 'COMANDA';

    const result = await aprobacionService.aprobarTicketUnificado(id, tipoNormalizado, usuarioId, usuarioNombre);

    // Emitir sockets según tipo
    if (tipoNormalizado === 'COMANDA' && result.ticket) {
      // Cocina: comanda aprobada — platos ahora en KDS
      if (global.emitComandaAprobada) {
        try {
          await global.emitComandaAprobada(result.ticket, result.platosLiberados);
        } catch (e) {
          logger.warn('Error emitiendo comanda-aprobada', { error: e.message });
        }
      }
      // Mozos: mesa pasó de pendiente_aprobar → pagado
      if (global.emitMesaActualizada) {
        try {
          await global.emitMesaActualizada(result.ticket.mesa.toString(), 'pagado');
        } catch (e) {
          logger.warn('Error emitiendo mesa-actualizada tras aprobación', { error: e.message });
        }
      }
    }

    // PPA: los sockets del flujo PPA existente se emiten desde pagoAdelantadoController

    res.json({
      success: true,
      message: `Ticket ${tipoNormalizado} aprobado exitosamente`,
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
 * GET /api/comanda/:id/ticket-imprimible
 * Devuelve los datos mapeados de una comanda para la plantilla de impresión de comanda.
 * Busca primero por comandaId; si no existe ticket de aprobación, construye
 * datos imprimibles desde la comanda + boucher asociado.
 */
router.get('/comanda/:id/ticket-imprimible', async (req, res) => {
  try {
    const { id } = req.params;

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
      return res.json({
        success: true,
        datos: {
          ticketId: ticketPPA._id,
          ticketNumber: ticketPPA.ticketNumber,
          tipo: 'ADELANTADO',
          comandaNumero: ticketPPA.comandasNumbers?.[0] ?? null,
          comandasNumbers: ticketPPA.comandasNumbers || [],
          fechaPedido: ticketPPA.createdAt,
          mesa: ticketPPA.mesa?.nummesa ?? ticketPPA.numMesa,
          mozo: ticketPPA.mozo?.name || ticketPPA.nombreMozo || ticketPPA.mozoNombre,
          area: null,
          moneda: 'PEN',
          tipoPago: ticketPPA.metodoPago || 'efectivo',
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
          cliente: { nombre: 'Invitado', dni: '' },
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

    // Buscar boucher asociado
    const boucher = await boucherModel.findOne({
      comandas: comanda._id,
      isActive: { $ne: false },
    }).sort({ createdAt: -1 }).lean();

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
      comandaNumero: comanda.comandaNumber,
      comandasNumbers: [comanda.comandaNumber],
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
        nombre: boucher?.clienteNombre || comanda.clienteNombre || comanda.cliente?.nombre || 'Invitado',
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