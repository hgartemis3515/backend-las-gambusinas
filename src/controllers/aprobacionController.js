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
const { resolverTotalesPedidoPPA } = require('../utils/totalesTicketPPA');
const { totalesConDescuentoImpresion } = require('../utils/descuentoTicketSnapshot');
const {
  imprimirSoloNombreComercial,
  aplicarOpcionesImpresionProductos,
} = require('../utils/impresionComandaOpciones');

async function snapshotIgvImpresion() {
  try {
    const config = await configuracionRepository.obtenerConfiguracionMoneda();
    const pct = Number(config?.igvPorcentaje);
    return {
      igvPorcentaje: Number.isFinite(pct) ? pct : 18,
      nombreImpuesto: config?.nombreImpuestoPrincipal || 'IGV',
    };
  } catch (_) {
    return { igvPorcentaje: 18, nombreImpuesto: 'IGV' };
  }
}

async function conIgvImpresion(datos) {
  const snap = await snapshotIgvImpresion();
  let solo = true;
  try {
    const config = await configuracionRepository.obtenerConfiguracion();
    solo = imprimirSoloNombreComercial(config);
  } catch (_) { /* default: ocultar guarniciones */ }
  return {
    ...datos,
    ...snap,
    productos: aplicarOpcionesImpresionProductos(datos?.productos, { soloNombreComercial: solo }),
  };
}

function tipoServicioImpresion(p) {
  if (!p) return 'mesa';
  if (p.tipoServicio === 'para_llevar' || p.paraLlevar === true) return 'para_llevar';
  const raw = String(p.tipoServicio || '').toLowerCase().trim().replace(/\s+/g, '_');
  return (raw === 'para_llevar' || raw === 'llevar') ? 'para_llevar' : 'mesa';
}

function mapLineaProductoImprimible(p, comanda, index) {
  const tipoServicio = tipoServicioImpresion(p);
  const cantidad = Number(p.cantidad || comanda?.cantidades?.[index] || 1) || 1;
  const precio = Number(p.precioUnitario ?? p.precio ?? p.plato?.precio) || 0;
  const sub = Number(p.subtotal);
  return {
    nombre: p.plato?.nombre || p.nombre || 'Plato',
    plato: p.plato,
    cantidad,
    precio,
    subtotal: Number.isFinite(sub) && sub > 0 ? sub : precio * cantidad,
    tipoServicio,
    complementos: (p.complementosSeleccionados || p.complementos || []).map((c) => ({
      grupo: c.grupo,
      opcion: c.opcion,
      cantidad: c.cantidad || 1,
      precio: c.precio || 0,
    })),
    notaEspecial: p.notaEspecial || '',
    paraLlevar: tipoServicio === 'para_llevar',
    mostrarResumenComplementos: !!p.mostrarResumenComplementos,
    resumenComplementosImpresion: {
      mostrarCantidad: p.resumenComplementosImpresion?.mostrarCantidad !== false,
      mostrarMontoExtra: p.resumenComplementosImpresion?.mostrarMontoExtra !== false,
    },
  };
}

/**
 * GET /api/aprobacion/pendientes
 * Lista tickets pendientes de aprobación, tipo COMANDA y/o ADELANTADO.
 * Query params: tipo=COMANDA|ADELANTADO (opcional), fecha=YYYY-MM-DD (opcional).
 * Sin fecha: todos los pendientes activos, incluidos los de días anteriores.
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
 * GET /api/aprobacion/turnos-dia
 * Misma respuesta que /cierre-caja/turnos-dia, con JWT de cocina (sin permiso admin).
 */
router.get('/aprobacion/turnos-dia', async (req, res) => {
  try {
    const CierreCajaRestaurante = require('../database/models/cierreCajaRestaurante.model');
    const { obtenerTurnosDia } = require('../utils/cierreCajaTurnosDia');
    const data = await obtenerTurnosDia(CierreCajaRestaurante);
    res.json(data);
  } catch (error) {
    logger.error('Error al obtener turnos DIA/NOCHE', { error: error.message });
    res.status(500).json({ success: false, message: 'Error al obtener turnos del día' });
  }
});

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ZONA_FECHA = 'America/Lima';
const MAX_DIAS_RANGO = 90;

function resolverRangoFechas(fechaDesde, fechaHasta) {
  if (!fechaDesde || !FECHA_ISO.test(fechaDesde)) return null;
  const hastaRaw = fechaHasta && FECHA_ISO.test(fechaHasta) ? fechaHasta : fechaDesde;
  let start = moment.tz(fechaDesde, ZONA_FECHA);
  let end = moment.tz(hastaRaw, ZONA_FECHA);
  if (!start.isValid() || !end.isValid()) return null;
  if (end.isBefore(start)) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  if (end.diff(start, 'days') > MAX_DIAS_RANGO) {
    end = start.clone().add(MAX_DIAS_RANGO, 'days');
  }
  return {
    desde: start.format('YYYY-MM-DD'),
    hasta: end.format('YYYY-MM-DD'),
  };
}

/**
 * GET /api/aprobacion/fecha/:fecha
 * Lista tickets de aprobación (cualquier estado) de una fecha.
 * Query opcional: hasta=YYYY-MM-DD para rango (máx. 90 días).
 */
router.get('/aprobacion/fecha/:fecha', async (req, res) => {
  try {
    const rango = resolverRangoFechas(req.params.fecha, req.query.hasta);
    if (!rango) {
      return res.status(400).json({ success: false, message: 'Fecha inválida' });
    }

    const ticketsComanda = await ticketAprobacionRepository.obtenerTicketsPorFecha(rango.desde, rango.hasta);
    const ticketsPPA = await ticketPagoAdelantadoRepository.obtenerTicketsPorFecha(rango.desde, rango.hasta);

    const tickets = [
      ...ticketsComanda.map((t) => ({
        ...t,
        tipo: t.tipo === 'pago_parcial' ? 'PAGO_PARCIAL' : 'COMANDA',
      })),
      ...ticketsPPA.map((t) => ({ ...t, tipo: 'ADELANTADO' })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, tickets, desde: rango.desde, hasta: rango.hasta });
  } catch (error) {
    logger.error('Error al obtener comandas pendientes de aprobación', { error: error.message });
    res.status(500).json({ success: false, message: 'Error al obtener comandas pendientes' });
  }
});

/**
 * PUT /api/aprobacion/:id/forzar-pago
 * Caja cobra el ticket de la comanda (boucher + aprobado). La mesa no pasa a pendiente_aprobar.
 */
router.put('/aprobacion/:id/forzar-pago', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuarioId, usuarioNombre, metodoPago } = req.body || {};
    const result = await aprobacionService.forzarPagoTicketComanda(id, {
      usuarioId,
      usuarioNombre,
      metodoPago,
    });

    if (result.forzado === false && result.ticket) {
      const estadoMesaFinal = result.mesaEstado || 'pendiente_aprobar';
      if (global.emitComandaAprobada) {
        try {
          await global.emitComandaAprobada(result.ticket, result.platosLiberados, estadoMesaFinal);
        } catch (e) {
          logger.warn('Error emitiendo comanda-aprobada (forzar con boucher)', { error: e.message });
        }
      }
    } else if (result.ticket && global.emitTicketAprobacionNuevo) {
      try {
        await global.emitTicketAprobacionNuevo(result.ticket);
      } catch (e) {
        logger.warn('Error emitiendo ticket tras forzar pago', { error: e.message });
      }
    }

    if (result.ticket?.mesa && global.emitMesaActualizada) {
      try {
        await global.emitMesaActualizada(result.ticket.mesa.toString());
      } catch (e) {
        logger.warn('Error emitiendo mesa-actualizada tras forzar pago', { error: e.message });
      }
    }

    res.json({
      success: true,
      message: result.forzado ? 'Pago forzado y ticket aprobado' : 'Ticket aprobado',
      resultado: result,
    });
  } catch (error) {
    logger.error('Error al forzar pago de ticket', { error: error.message });
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/aprobacion/:id/aprobar
 * Aprueba un ticket (comanda completa o PPA).
 * Body: { tipo?: 'COMANDA'|'ADELANTADO', usuarioId, usuarioNombre }
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

    const io = global.io;

    if (tipoReal === 'COMANDA' && result.ticket) {
      // PLAN_BUG_CONEXION_APROBACION_TICKETS_COCINA:
      // emitComandaAprobada ya emite 'comanda-aprobada' (a cocina, mozos y admin)
      // + 'comanda-actualizada' por cada comanda. NO duplicar aquí.
      // También propagamos el estado real de la mesa.
      const estadoMesaFinal = result.mesaEstado || 'pendiente_aprobar';

      if (global.emitComandaAprobada) {
        try {
          await global.emitComandaAprobada(result.ticket, result.platosLiberados, estadoMesaFinal);
        } catch (e) {
          logger.warn('Error emitiendo comanda-aprobada', { error: e.message });
        }
      }

      // mesa-actualizada: un único canal vía emitMesaActualizada (lee estado de DB).
      if (global.emitMesaActualizada) {
        try {
          await global.emitMesaActualizada(result.ticket.mesa?.toString());
        } catch (e) {
          logger.warn('Error emitiendo mesa-actualizada tras aprobación', { error: e.message });
        }
      }

      // Nota: NO emitimos 'comanda-aprobada' ni 'ticket-ppa-actualizado' aquí;
      // emitComandaAprobada() ya los emitió a cocina/mozos/admin.
      // Antes existía una emisión duplicada que disparaba múltiples fetchItems()
      // en el frontend (tormenta HTTP que se percibía como pérdida de conexión).
    }

    if (tipoReal === 'ADELANTADO' && result.ticket) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
      const ticket = result.ticket;
      const esReserva = ticket.origen === 'reserva' || result.reservaConfirmada === true;

      let estadoMesaPPA = result.mesaEstado || null;
      try {
        const mesaDoc = await mongoose.model('Mesa').findById(ticket.mesa).select('estado nummesa').lean();
        if (mesaDoc) {
          estadoMesaPPA = mesaDoc.estado;
        }
      } catch (e) {
        logger.warn('No se pudo leer estado de mesa tras aprobar PPA', { error: e.message });
      }

      if (io) {
        const payloadAprobado = {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          comandas: ticket.comandas,
          platosLiberados: result.platosLiberados || [],
          mesa: ticket.mesa,
          nummesa: ticket.numMesa,
          origen: ticket.origen || 'comanda',
          reservaId: ticket.reserva || null,
          estadoMesa: esReserva ? (estadoMesaPPA || result.mesaEstado || null) : (estadoMesaPPA || 'pedido'),
          message: esReserva
            ? `Reserva aprobada para mesa ${ticket.numMesa}`
            : `Ticket PPA #${ticket.ticketNumber} aprobado`,
        };

        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-aprobado', payloadAprobado);
        io.of('/mozos').emit('ticket-ppa-aprobado', payloadAprobado);
        io.of('/admin').emit('ticket-ppa-aprobado', payloadAprobado);

        // Reserva inmediata: platos ya en pedido (activarReservaProgramada).
        // Reserva programada: platos siguen pendiente y el KDS vivo los filtra;
        // Mozos necesita el evento para salir de "pendiente de aprobación".
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

        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-actualizado', {
          ticketId: ticket._id,
          estado: 'aprobado',
          ticket,
        });
        io.of('/admin').emit('ticket-ppa-actualizado', {
          ticketId: ticket._id,
          estado: 'aprobado',
        });

        if (ticket.mesa && global.emitMesaActualizada) {
          try {
            await global.emitMesaActualizada(ticket.mesa);
          } catch (e) {
            logger.warn('Error emitiendo mesa-actualizada tras aprobación PPA', { error: e.message });
          }
        }

        if (esReserva && ticket.reserva) {
          try {
            const Reserva = require('../database/models/reserva.model');
            const reservaDoc = await Reserva.findById(ticket.reserva)
              .populate('mesa', 'nummesa estado')
              .populate('mozo', 'name')
              .populate('cocineroEncargado', 'name alias');
            if (reservaDoc) {
              if (global.emitReservaActualizada) {
                await global.emitReservaActualizada(reservaDoc._id, {
                  estado: reservaDoc.estado,
                  origen: 'aprobacion_ppa'
                });
              }
              if (global.emitReservaCreada) await global.emitReservaCreada(reservaDoc);
              const comandaDoc = reservaDoc.comandaGenerada
                ? await mongoose.model('Comanda').findById(reservaDoc.comandaGenerada)
                : null;
              if (global.emitReservaProgramada) await global.emitReservaProgramada(reservaDoc, comandaDoc);
            }
          } catch (e) {
            logger.error('Error al emitir reserva confirmada (aprobación unificada)', { error: e.message });
          }
        }
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
 * POST /api/aprobacion/desde-comanda/:id
 * Dashboard: crea un TicketAprobacion ya aprobado para una comanda sin ticket.
 * No cambia mesa ni manda el ticket a la bandeja pendiente de cocina.
 */
router.post('/aprobacion/desde-comanda/:id', async (req, res) => {
  try {
    const source = String(req.body?.sourceApp || req.headers['x-source-app'] || '').toLowerCase();
    if (source !== 'dashboard' && req.body?.forzarAdmin !== true) {
      return res.status(403).json({ success: false, message: 'Solo disponible desde el dashboard' });
    }

    const ticket = await aprobacionService.crearTicketAprobadoDesdeComanda(req.params.id, {
      usuarioId: req.body?.usuarioId,
      usuarioNombre: req.body?.usuarioNombre,
    });

    res.json({ success: true, ticket });
  } catch (error) {
    logger.error('Error al crear ticket de aprobación desde comanda', { error: error.message });
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
 * Edita observaciones, método de pago y precios de platos (pendiente o aprobado).
 * Body: { tipo?: 'COMANDA'|'ADELANTADO', observaciones?, metodoPago?, platos?: [{ platoLineaId, precio, cantidad }], platosEliminar?: string[] }
 */
router.put('/aprobacion/:id/editar', async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, observaciones, metodoPago, platos, platosEliminar } = req.body;

    const result = await aprobacionService.actualizarTicketUnificado(id, tipo, {
      observaciones,
      metodoPago,
      platos,
      platosEliminar,
    });

    const io = global.io;
    if (io) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
      const payload = {
        ticketId: result.ticket._id,
        ticket: result.ticket,
        tipo: result.tipo,
        estado: result.ticket.estado,
        comandas: result.ticket.comandas,
      };
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-actualizado', payload);
      io.of('/admin').emit('ticket-actualizado', payload);
      if (result.tipo === 'ADELANTADO') {
        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-actualizado', payload);
        io.of('/admin').emit('ticket-ppa-actualizado', payload);
      }
      for (const comandaId of (result.comandasAfectadas || [])) {
        try {
          const comandaActualizada = await comandaModel.findById(comandaId)
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
            io.of('/admin').emit('comanda-actualizada', {
              comandaId,
              comanda: comandaActualizada,
              status: comandaActualizada.status,
            });
            io.of('/mozos').emit('comanda-actualizada', {
              comandaId,
              comanda: comandaActualizada,
              status: comandaActualizada.status,
            });
          }
        } catch (emitErr) {
          logger.warn('Error emitiendo comanda tras editar precios de ticket', { error: emitErr.message });
        }
      }
    }

    res.json({
      success: true,
      ticket: result.ticket,
      tipo: result.tipo,
      comandasAfectadas: result.comandasAfectadas || [],
    });
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
    })
      .populate('comandas', 'comandaNumber descuento montoDescuento motivoDescuento totalSinDescuento totalCalculado')
      .populate('boucher', 'moneda montoRecibido vuelto metodoPago voucherId montoDescuento descuentos totalSinDescuento')
      .lean();

    if (ticketPPA) {
      const boucherPPA = ticketPPA.boucher || null;
      const totalesPPA = resolverTotalesPedidoPPA(ticketPPA);
      const descPPA = totalesConDescuentoImpresion(ticketPPA, totalesPPA);
      const ppaComandasNumbers = resolverComandasNumbers({
        comandasNumbers: ticketPPA.comandasNumbers,
        platos: ticketPPA.platos,
      });
      const ppaDisplay = formatComandasNumbersLabel(ppaComandasNumbers)
        || (ppaComandasNumbers[0] != null ? `#${ppaComandasNumbers[0]}` : '');
      return res.json({
        success: true,
        datos: await conIgvImpresion({
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
          moneda: ticketPPA.moneda || boucherPPA?.moneda || 'PEN',
          tipoPago: labelMetodoPago(ticketPPA.metodoPago || boucherPPA?.metodoPago) || ticketPPA.metodoPago || 'Pendiente',
          observaciones: ticketPPA.observaciones || '',
          productos: (ticketPPA.platos || []).filter((p) => p && !p.eliminado && !p.anulado).map((p) => mapLineaProductoImprimible(p)),
          subtotal: descPPA.subtotal,
          igv: ticketPPA.igv,
          total: descPPA.total,
          montoDescuento: descPPA.montoDescuento,
          totalSinDescuento: descPPA.totalSinDescuento,
          descuentos: descPPA.descuentos,
          cliente: {
            nombre: ticketPPA.clienteNombre || NOMBRE_CLIENTE_FALLBACK,
            dni: ticketPPA.clienteDni || '',
          },
          montoRecibido: ticketPPA.montoRecibido ?? boucherPPA?.montoRecibido ?? null,
          vuelto: ticketPPA.vuelto ?? boucherPPA?.vuelto ?? null,
          voucherId: ticketPPA.voucherId || boucherPPA?.voucherId || null,
        }),
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
    })
      .populate('comandas', 'comandaNumber descuento montoDescuento motivoDescuento totalSinDescuento totalCalculado')
      .sort({ createdAt: -1 })
      .lean();

    if (ticketPPA) {
      const totalesPPA = resolverTotalesPedidoPPA(ticketPPA);
      const descPPA = totalesConDescuentoImpresion(ticketPPA, totalesPPA);
      const ppaComandasNumbers = resolverComandasNumbers({
        comandasNumbers: ticketPPA.comandasNumbers,
        platos: ticketPPA.platos,
      });
      const ppaDisplay = formatComandasNumbersLabel(ppaComandasNumbers)
        || (ppaComandasNumbers[0] != null ? `#${ppaComandasNumbers[0]}` : '');
      return res.json({
        success: true,
        datos: await conIgvImpresion({
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
          tipoPago: labelMetodoPago(ticketPPA.metodoPago) || ticketPPA.metodoPago || 'Pendiente',
          observaciones: ticketPPA.observaciones || '',
          productos: (ticketPPA.platos || []).filter((p) => p && !p.eliminado && !p.anulado).map((p) => mapLineaProductoImprimible(p)),
          subtotal: descPPA.subtotal,
          igv: ticketPPA.igv,
          total: descPPA.total,
          montoDescuento: descPPA.montoDescuento,
          totalSinDescuento: descPPA.totalSinDescuento,
          descuentos: descPPA.descuentos,
          cliente: { nombre: NOMBRE_CLIENTE_FALLBACK, dni: '' },
          voucherId: ticketPPA.voucherId || null,
        }),
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

    let productos = [];
    (comanda.platos || []).forEach((p, i) => {
      if (!p || p.eliminado || p.anulado) return;
      productos.push(mapLineaProductoImprimible(p, comanda, i));
    });
    productos = aplicarOpcionesImpresionProductos(productos, {
      soloNombreComercial: imprimirSoloNombreComercial(config),
    });

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
      subtotal: Number(boucher?.subtotal) || Number(comanda.precioTotal) || productos.reduce((s, p) => s + (Number(p.subtotal) || 0), 0),
      igv: boucher?.igv ?? 0,
      igvPorcentaje: Number.isFinite(Number(config.igvPorcentaje)) ? Number(config.igvPorcentaje) : 18,
      nombreImpuesto: config.nombreImpuestoPrincipal || 'IGV',
      total: (Number(comanda.descuento) > 0 || Number(comanda.montoDescuento) > 0)
        ? (Number.isFinite(Number(comanda.totalCalculado))
          ? Number(comanda.totalCalculado)
          : Math.max(0, productos.reduce((s, p) => s + (Number(p.subtotal) || 0), 0) - (Number(comanda.montoDescuento) || 0)))
        : (Number(boucher?.total) > 0
          ? Number(boucher.total)
          : (Number(comanda.totalCalculado) > 0
            ? Number(comanda.totalCalculado)
            : (Number(comanda.precioTotal) || productos.reduce((s, p) => s + (Number(p.subtotal) || 0), 0)))),
      montoDescuento: (Number(comanda.descuento) > 0 || Number(comanda.montoDescuento) > 0)
        ? (Number(comanda.montoDescuento) || 0)
        : (Number(boucher?.montoDescuento) || 0),
      totalSinDescuento: comanda.totalSinDescuento ?? boucher?.totalSinDescuento ?? null,
      descuentos: (Number(comanda.descuento) > 0 || Number(comanda.montoDescuento) > 0)
        ? [{ porcentaje: comanda.descuento, motivo: comanda.motivoDescuento, monto: comanda.montoDescuento }]
        : (boucher?.descuentos || []),
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