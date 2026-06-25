/**
 * Controller de Tickets de Pago Adelantado (TPA)
 * Endpoints REST para crear, listar, aprobar y rechazar TPA.
 */
const express = require('express');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const router = express.Router();
const {
  crearTicketPagoAdelantado,
  obtenerTicketPorId,
  obtenerTicketsPendientes,
  obtenerTicketsPorFecha,
  aprobarTicket,
  rechazarTicket,
  getComandasParaPagoAdelantado,
} = require('../repository/ticketPagoAdelantado.repository');
const { procesarPagoBoucher } = require('../services/boucherPagoService');
const { recalcularEstadoMesa } = require('../repository/comanda.repository');
const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const pedidoModel = require('../database/models/pedido.model');
const logger = require('../utils/logger');

/**
 * POST /pago-adelantado
 * Crear un pago adelantado: genera boucher + ticket TPA
 */
router.post('/pago-adelantado', async (req, res) => {
  try {
    const {
      mesaId,
      mozoId,
      clienteId,
      comandasIds,
      platosSeleccionados,   // Array de { comandaId, platoLineaId, platoSubdocId, cantidad }
      observaciones,
      metodoPago,
      montoRecibido,
      vuelto,
      moneda,
      tipoCambioUsd,
      esPagoAdelantado,
    } = req.body;

    console.log('🔥 [PPA] POST /pago-adelantado - Request body:', {
      mesaId, mozoId, clienteId,
      platosSeleccionadosCount: platosSeleccionados?.length || 0,
      platosSeleccionadosKeys: platosSeleccionados?.map(ps => Object.keys(ps)) || [],
      platosSeleccionadosSample: platosSeleccionados?.slice(0, 2) || [],
      metodoPago, moneda, esPagoAdelantado,
    });

    if (!mesaId || !mozoId) {
      return res.status(400).json({ error: 'mesaId y mozoId son requeridos' });
    }

    // Obtener comandas elegibles para PPA
    const comandas = await getComandasParaPagoAdelantado(mesaId, comandasIds);
    if (!comandas || comandas.length === 0) {
      return res.status(400).json({ error: 'No hay comandas elegibles para pago adelantado' });
    }

    console.log('🔥 [PPA] Comandas encontradas:', comandas.length, '- Platos elegibles por comanda:',
      comandas.map(c => ({ id: c._id?.toString()?.slice(-6), num: c.comandaNumber, status: c.status, platosElegibles: c.platosElegiblesPPA?.length || 0 }))
    );

    // Construir platos para boucher y ticket
    const platosParaBoucher = [];
    const platosParaTicket = [];

    for (const comanda of comandas) {
      const mozoPop = comanda.mozos;
      const mesaPop = comanda.mesas;

      for (const platoItem of (comanda.platosElegiblesPPA || [])) {
        // Verificar si este plato fue seleccionado
        // Soportar tanto platoLineaId como platoSubdocId (el frontend envía platoSubdocId)
        const platoItemStr = platoItem._id?.toString();
        const seleccionado = (platosSeleccionados || []).find(
          ps => ps.comandaId === comanda._id.toString()
            && (ps.platoLineaId === platoItemStr || ps.platoSubdocId === platoItemStr)
        );
        if (!seleccionado) continue;

        const cantidad = seleccionado.cantidad || comanda.cantidades?.[comanda.platos.indexOf(platoItem)] || 1;
        const platoData = platoItem.plato || {};
        const precio = platoData.precio || platoItem.precio || 0;
        const subtotal = precio * cantidad;

        platosParaBoucher.push({
          plato: platoData._id || platoItem.plato,
          platoId: platoItem.platoId || platoData.id || null,
          nombre: platoData.nombre || 'Plato',
          precio,
          cantidad,
          subtotal,
          comandaNumber: comanda.comandaNumber || null,
          complementosSeleccionados: platoItem.complementosSeleccionados || [],
          tipoServicio: platoItem.tipoServicio || 'mesa',
          cocinero: null,
          cocineroId: null,
          tiempoPreparacion: null,
        });

        platosParaTicket.push({
          comandaId: comanda._id,
          comandaNumber: comanda.comandaNumber,
          platoLineaId: platoItem._id,
          plato: platoData._id || platoItem.plato,
          platoId: platoItem.platoId || platoData.id || null,
          nombre: platoData.nombre || 'Plato',
          precio,
          cantidad,
          subtotal,
          tipoServicio: platoItem.tipoServicio || 'mesa',
          complementosSeleccionados: platoItem.complementosSeleccionados || [],
          notaEspecial: platoItem.notaEspecial || '',
          estadoAlPagoAdelantado: platoItem.estado || 'pedido',
        });
      }
    }

    if (platosParaBoucher.length === 0) {
      console.warn('⚠️ [PPA] No se encontraron platos seleccionados válidos.', {
        platosSeleccionados: platosSeleccionados?.length || 0,
        comandasElegibles: comandas.length,
        platosElegiblesPPA: comandas.reduce((sum, c) => sum + (c.platosElegiblesPPA?.length || 0), 0),
      });
      return res.status(400).json({ error: 'No hay platos seleccionados válidos para pago adelantado' });
    }

    console.log('🔥 [PPA] Platos matched:', platosParaBoucher.length, '/', platosSeleccionados?.length || 0, 'seleccionados');

    // Calcular totales
    const subtotalTotal = platosParaBoucher.reduce((sum, p) => sum + (p.subtotal || 0), 0);
    const igvPorcentaje = 18;
    const igv = subtotalTotal * (igvPorcentaje / 100);
    const total = subtotalTotal + igv;

    // Crear boucher usando el servicio existente (modificado para PPA)
    // Primero, procesar el boucher directamente
    const primeraComanda = comandas[0];
    const mesaInfo = primeraComanda.mesas || await mesasModel.findById(mesaId).select('nummesa estado nombreCombinado').lean();
    const mozoInfo = primeraComanda.mozos || { name: 'N/A' };

    // Usar el servicio de boucher existente con flag esPagoAdelantado
    const platosSeleccionadosForBoucher = platosParaTicket.map(p => ({
      comandaId: p.comandaId?.toString(),
      platoSubdocId: p.platoLineaId?.toString(),
      platoId: p.platoId,
      cantidad: p.cantidad,
    }));

    console.log('🔥 [PPA] Llamando procesarPagoBoucher con:', {
      mesaId,
      mozoId,
      comandasIds: comandas.map(c => c._id.toString()),
      platosSeleccionados: platosSeleccionadosForBoucher,
      metodoPago: metodoPago || 'efectivo',
      moneda: moneda || 'PEN',
      esPagoAdelantado: true,
    });

    const boucherResult = await procesarPagoBoucher({
      mesaId,
      mozoId,
      clienteId: clienteId || null,
      comandasIds: comandas.map(c => c._id.toString()),
      platosSeleccionados: platosSeleccionadosForBoucher,
      observaciones: observaciones || 'Pago Adelantado',
      metodoPago: metodoPago || 'efectivo',
      montoRecibido,
      vuelto,
      moneda: moneda || 'PEN',
      tipoCambioUsd,
      esPagoAdelantado: true,
    });

    const boucher = boucherResult.boucher;

    // Snapshot de datos del cliente para el ticket PPA (DNI/nombre)
    let clienteDoc = null;
    if (clienteId) {
      try {
        clienteDoc = await mongoose.model('Cliente').findById(clienteId).select('nombre dni').lean();
      } catch (e) {
        logger.warn(`No se pudo obtener cliente ${clienteId} para snapshot PPA: ${e.message}`);
      }
    }

    // Ahora crear el TPA
    const pedidoId = primeraComanda.pedido || null;
    const ticket = await crearTicketPagoAdelantado({
      comandas: comandas.map(c => c._id),
      comandasNumbers: comandas.map(c => c.comandaNumber).filter(Boolean),
      mesa: mesaId,
      numMesa: mesaInfo?.nummesa || mesaInfo?.nummesa || 0,
      mozo: mozoId,
      nombreMozo: mozoInfo?.name || 'N/A',
      mozoNombre: mozoInfo?.name || 'N/A',
      pedido: pedidoId,
      platos: platosParaTicket,
      subtotal: boucher.subtotal || subtotalTotal,
      igv: boucher.igv || igv,
      total: boucher.total || total,
      boucher: boucher._id,
      voucherId: boucher.voucherId || null,
      metodoPago: metodoPago || 'efectivo',
      moneda: boucher.moneda || moneda || 'PEN',
      montoRecibido: boucher.montoRecibido ?? null,
      vuelto: boucher.vuelto ?? null,
      cliente: clienteId || null,
      clienteNombre: clienteDoc?.nombre || null,
      clienteDni: clienteDoc?.dni || null,
      observaciones: observaciones || '',
      sourceApp: 'mozos',
    });

    // Marcar platos en las comandas con pagoAdelantado
    for (const comanda of comandas) {
      const comandaDoc = await comandaModel.findById(comanda._id);
      if (!comandaDoc) continue;

      let modificado = false;
      for (const plato of comandaDoc.platos) {
        const platoLineaId = plato._id?.toString();
        const enTicket = platosParaTicket.some(tp => tp.platoLineaId?.toString() === platoLineaId);

        if (enTicket) {
          plato.pagoAdelantado = {
            requerido: true,
            cobrado: true,
            ticketId: ticket._id,
            estadoTicket: 'pendiente_aprobacion',
            boucherId: boucher._id,
          };

          // Si es para_llevar, mantener en 'pedido' (retenido en cocina)
          if (plato.tipoServicio === 'para_llevar' && plato.estado === 'pedido') {
            // Se queda en 'pedido', no pasa a en_espera hasta aprobación
          }
          modificado = true;
        }
      }

      if (modificado) {
        // Para comandas solo_para_llevar, el status puede quedar en 'pedido'
        const platosActivos = comandaDoc.platos.filter(p => !p.eliminado && !p.anulado);
        const composicion = (() => {
          const tieneMesa = platosActivos.some(p => (p.tipoServicio || 'mesa') === 'mesa');
          const tieneLlevar = platosActivos.some(p => p.tipoServicio === 'para_llevar');
          if (tieneMesa && tieneLlevar) return 'mixta';
          if (tieneLlevar) return 'solo_para_llevar';
          return 'solo_mesa';
        })();

        if (composicion === 'solo_para_llevar') {
          // Las comandas solo para llevar quedan en 'pedido' hasta aprobación
          // No cambiamos status
        }
        // Si es mixta, los platos mesa ya pueden estar en_enespera, no tocamos status

        comandaDoc.markModified('platos');
        await comandaDoc.save();
      }
    }

    // Actualizar estado de la mesa a "pendiente_pago"
    await mesasModel.findByIdAndUpdate(mesaId, { estado: 'pendiente_pago' });

    // Emitir eventos Socket.io para notificar a cocina y mozos
    const io = global.io;
    if (io) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
      const ticketPopulated = await obtenerTicketPorId(ticket._id);

      // Notificar a cocina
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-nuevo', {
        ticket: ticketPopulated,
        message: 'Nuevo ticket de pago adelantado pendiente de aprobación',
      });

      // Notificar al mozo específico
      io.of('/mozos').to(`mozo-${mozoId}`).emit('ticket-ppa-creado', {
        ticket: ticketPopulated,
        mesaId,
        message: 'Pago adelantado registrado. Esperando aprobación de cocina.',
      });

      // Notificar a admin
      io.of('/admin').emit('ticket-ppa-nuevo', {
        ticket: ticketPopulated,
      });

      // Notificar cambio de estado de mesa a pendiente_pago
      io.of('/mozos').emit('mesa-actualizada', {
        mesaId,
        estado: 'pendiente_pago',
        nummesa: mesaInfo?.nummesa || null,
      });
      io.of('/admin').emit('mesa-actualizada', {
        mesaId,
        estado: 'pendiente_pago',
        nummesa: mesaInfo?.nummesa || null,
      });

      // Emitir comanda-actualizada para que cocina refresque la lista
      for (const comanda of comandas) {
        const comandaActualizada = await comandaModel.findById(comanda._id)
          .populate('platos.plato', 'nombre precio id')
          .populate('mozos', 'name')
          .populate('mesas', 'nummesa estado nombreCombinado')
          .lean();

        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('comanda-actualizada', {
          comandaId: comanda._id,
          comanda: comandaActualizada,
          status: comandaActualizada.status,
        });

        io.of('/mozos').to(`mesa-${mesaId}`).emit('comanda-actualizada', {
          comandaId: comanda._id,
          comanda: comandaActualizada,
          status: comandaActualizada.status,
        });
      }
    }

    res.status(201).json({
      success: true,
      ticket,
      boucher,
      resumen: {
        mesaPagadaCompletamente: false,
        ticketId: ticket._id,
        estadoTicket: 'pendiente_aprobacion',
        message: 'Pago adelantado registrado. Esperando aprobación de cocina.',
      },
    });
  } catch (error) {
    console.error('❌ [PPA] Error completo en POST /pago-adelantado:', {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      name: error.name,
    });
    logger.error('Error en POST /pago-adelantado', {
      error: error.message,
      stack: error.stack,
    });
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /pago-adelantado/pendientes
 * Obtener TPA pendientes de aprobación
 */
router.get('/pago-adelantado/pendientes', async (req, res) => {
  try {
    const { fecha } = req.query;
    const tickets = await obtenerTicketsPendientes(fecha);
    res.json({ success: true, tickets, cantidad: tickets.length });
  } catch (error) {
    logger.error('Error en GET /pago-adelantado/pendientes', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /pago-adelantado/fecha/:fecha
 * Obtener TPA por fecha (histórico)
 */
router.get('/pago-adelantado/fecha/:fecha', async (req, res) => {
  try {
    const { fecha } = req.params;
    const tickets = await obtenerTicketsPorFecha(fecha);
    res.json({ success: true, tickets, cantidad: tickets.length });
  } catch (error) {
    logger.error('Error en GET /pago-adelantado/fecha/:fecha', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /pago-adelantado/:id
 * Obtener detalle de un TPA
 */
router.get('/pago-adelantado/:id', async (req, res) => {
  try {
    const ticket = await obtenerTicketPorId(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket no encontrado' });
    }
    res.json({ success: true, ticket });
  } catch (error) {
    logger.error('Error en GET /pago-adelantado/:id', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /pago-adelantado/:id/aprobar
 * Aprobar un TPA y liberar platos al KDS
 */
router.put('/pago-adelantado/:id/aprobar', async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'];
    const usuarioNombre = req.body?.usuarioNombre || req.body?.nombre || 'Cocina';

    const { ticket, platosLiberados } = await aprobarTicket(id, usuarioId, usuarioNombre);

    // Emitir eventos Socket.io
    const io = global.io;
    if (io) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');

      // Notificar a cocina
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-aprobado', {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        comandas: ticket.comandas,
        platosLiberados,
        message: `Ticket PPA #${ticket.ticketNumber} aprobado`,
      });

      // Notificar al mozo que creó el ticket
      io.of('/mozos').to(`mozo-${ticket.mozo}`).emit('ticket-ppa-aprobado', {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        mesa: ticket.mesa,
        message: `Pago adelantado aprobado por cocina para mesa ${ticket.numMesa}`,
      });

      // Notificar a la mesa específica
      io.of('/mozos').to(`mesa-${ticket.mesa}`).emit('ticket-ppa-aprobado', {
        ticketId: ticket._id,
        comandas: ticket.comandas,
        message: 'Pago adelantado aprobado',
      });

      // Emitir comandas actualizadas (platos liberados ahora aparecen en KDS)
      for (const comandaId of ticket.comandas) {
        const comandaActualizada = await comandaModel.findById(comandaId)
          .populate('platos.plato', 'nombre precio id')
          .populate('mozos', 'name')
          .populate('mesas', 'nummesa estado nombreCombinado')
          .lean();

        if (comandaActualizada) {
          io.of('/cocina').to(`fecha-${fechaHoy}`).emit('comanda-actualizada', {
            comandaId: comandaId,
            comanda: comandaActualizada,
            status: comandaActualizada.status,
          });

          io.of('/mozos').to(`mesa-${ticket.mesa}`).emit('comanda-actualizada', {
            comandaId: comandaId,
            comanda: comandaActualizada,
            status: comandaActualizada.status,
          });
        }
      }

      // Actualizar sidebar PPA en cocina (lista sin el ticket aprobado)
      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-actualizado', {
        ticketId: ticket._id,
        estado: 'aprobado',
        ticket,
      });

      io.of('/admin').emit('ticket-ppa-actualizado', {
        ticketId: ticket._id,
        estado: 'aprobado',
      });

      // Notificar cambio de estado de mesa: pendiente_pago -> pedido
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

    res.json({
      success: true,
      ticket,
      platosLiberados,
      message: `Ticket PPA #${ticket.ticketNumber} aprobado. ${platosLiberados.length} platos liberados a cocina.`,
    });
  } catch (error) {
    logger.error('Error en PUT /pago-adelantado/:id/aprobar', {
      error: error.message,
      stack: error.stack,
    });
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /pago-adelantado/:id/rechazar
 * Rechazar un TPA
 */
router.put('/pago-adelantado/:id/rechazar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'];
    const usuarioNombre = req.body?.usuarioNombre || req.body?.nombre || 'Cocina';

    // Motivo obligatorio para auditoría
    if (!motivo || String(motivo).trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'El motivo de rechazo es obligatorio (mínimo 3 caracteres) para registro en auditoría.',
      });
    }

    const { ticket, comandasAfectadas } = await rechazarTicket(id, motivo, usuarioId, usuarioNombre);

    // Emitir eventos Socket.io
    const io = global.io;
    if (io) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');

      // Notificar a cocina y mozos que las comandas fueron eliminadas/canceladas (refrescar tableros y ComandaDetalle)
      for (const comandaId of (comandasAfectadas || [])) {
        const comandaActualizada = await comandaModel.findById(comandaId)
          .populate('platos.plato', 'nombre precio id')
          .populate('mozos', 'name')
          .populate('mesas', 'nummesa estado nombreCombinado')
          .lean();

        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('comanda-actualizada', {
          comandaId,
          comanda: comandaActualizada,
          status: comandaActualizada?.status,
        });

        io.of('/mozos').to(`mesa-${ticket.mesa}`).emit('comanda-actualizada', {
          comandaId,
          comanda: comandaActualizada,
          mesaId: ticket.mesa,
          status: comandaActualizada?.status,
        });

        if (comandaActualizada?.status === 'cancelado') {
          io.of('/mozos').to(`mesa-${ticket.mesa}`).emit('comanda-eliminada', {
            comandaId,
            mesaId: ticket.mesa,
          });
          io.of('/cocina').to(`fecha-${fechaHoy}`).emit('comanda-eliminada', {
            comandaId,
            mesaId: ticket.mesa,
          });
        }
      }

      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-rechazado', {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        motivo: ticket.motivoRechazo,
        message: `Ticket PPA #${ticket.ticketNumber} rechazado`,
      });

      io.of('/mozos').to(`mozo-${ticket.mozo}`).emit('ticket-ppa-rechazado', {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        motivo: ticket.motivoRechazo,
        mesa: ticket.mesa,
        message: `Pago adelantado rechazado para mesa ${ticket.numMesa}. Motivo: ${ticket.motivoRechazo}`,
      });

      io.of('/mozos').to(`mesa-${ticket.mesa}`).emit('ticket-ppa-rechazado', {
        ticketId: ticket._id,
        motivo: ticket.motivoRechazo,
        message: 'Pago adelantado rechazado por cocina',
      });

      io.of('/cocina').to(`fecha-${fechaHoy}`).emit('ticket-ppa-actualizado', {
        ticketId: ticket._id,
        estado: 'rechazado',
      });

      io.of('/admin').emit('ticket-ppa-actualizado', {
        ticketId: ticket._id,
        estado: 'rechazado',
      });

      // Notificar cambio de estado de mesa con el estado real recalculado
      // (puede quedar 'libre' si todas las comandas se cancelaron, o 'pedido' si quedan platos activos)
      const mesaTrasRechazo = await mesasModel.findById(ticket.mesa).select('estado nummesa').lean();
      const estadoMesaFinal = mesaTrasRechazo?.estado || 'pedido';
      io.of('/mozos').emit('mesa-actualizada', {
        mesaId: ticket.mesa,
        estado: estadoMesaFinal,
        nummesa: ticket.numMesa,
      });
      io.of('/admin').emit('mesa-actualizada', {
        mesaId: ticket.mesa,
        estado: estadoMesaFinal,
        nummesa: ticket.numMesa,
      });
    }

    res.json({
      success: true,
      ticket,
      message: `Ticket PPA #${ticket.ticketNumber} rechazado. Motivo: ${ticket.motivoRechazo}`,
    });
  } catch (error) {
    logger.error('Error en PUT /pago-adelantado/:id/rechazar', {
      error: error.message,
      stack: error.stack,
    });
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

/**
 * GET /pago-adelantado/comandas/:mesaId
 * Obtener comandas y platos elegibles para PPA de una mesa
 * Ruta en /pago-adelantado para evitar conflicto con /comanda/:id
 */
router.get('/pago-adelantado/comandas/:mesaId', async (req, res) => {
  try {
    const { mesaId } = req.params;
    let comandaIds = null;
    const comandaIdsParam = req.query.comandaIds;
    if (comandaIdsParam) {
      // Express puede enviar un string (un ID) o un array (múltiples IDs con misma key)
      const idsRaw = Array.isArray(comandaIdsParam) ? comandaIdsParam : comandaIdsParam.split(',');
      comandaIds = idsRaw.map(id => id.trim()).filter(Boolean);
    }

    const comandas = await getComandasParaPagoAdelantado(mesaId, comandaIds);

    res.json({
      success: true,
      mesaId,
      comandas,
      cantidad: comandas.length,
    });
  } catch (error) {
    logger.error('Error en GET /pago-adelantado/comandas/:mesaId', {
      mesaId: req.params.mesaId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /pago-adelantado/confirmar-entrega
 * Confirma la entrega de una comanda "para llevar" ya pagada por adelantado (PPA).
 * Cierra la(s) comanda(s) y libera la mesa a "libre".
 * Body: { mesaId, comandaIds?, usuarioId? }
 */
router.put('/pago-adelantado/confirmar-entrega', async (req, res) => {
  try {
    const { mesaId, comandaIds, usuarioId } = req.body;
    if (!mesaId) {
      return res.status(400).json({ success: false, error: 'mesaId es requerido' });
    }

    const ahora = moment().tz('America/Lima').toDate();

    // Buscar comandas activas de la mesa
    const query = {
      mesas: mesaId,
      IsActive: true,
      status: { $nin: ['pagado', 'completado', 'cancelado'] },
    };
    if (Array.isArray(comandaIds) && comandaIds.length > 0) {
      const validIds = comandaIds.filter(idv => mongoose.Types.ObjectId.isValid(idv));
      if (validIds.length > 0) query._id = { $in: validIds };
    }

    const comandas = await comandaModel.find(query).populate('platos.plato', 'nombre precio');

    // Filtrar solo comandas 100% "para llevar" con PPA aprobado
    const comandasCerradas = [];
    for (const comanda of comandas) {
      const platosActivos = comanda.platos.filter(p => !p.eliminado && !p.anulado);
      if (platosActivos.length === 0) continue;

      const todosParaLlevar = platosActivos.every(p => p.tipoServicio === 'para_llevar');
      if (!todosParaLlevar) continue;

      // Verificar que TODOS los platos activos estén entregados
      const todosEntregados = platosActivos.every(p => (p.estado || '').toLowerCase() === 'entregado');
      if (!todosEntregados) {
        return res.status(400).json({
          success: false,
          error: 'La comanda para llevar aún tiene platos sin entregar.',
        });
      }

      // Marcar platos como entregados y pagados (el cobro ya se hizo vía PPA)
      for (const plato of comanda.platos) {
        if (plato.eliminado || plato.anulado) continue;
        if (!plato.tiempos) plato.tiempos = {};
        if (plato.estado !== 'pagado') {
          plato.tiempos.entregado = plato.tiempos.entregado || ahora;
          plato.tiempos.pagado = ahora;
          plato.estado = 'pagado';
        }
      }

      comanda.status = 'pagado';
      comanda.IsActive = false;
      comanda.tiempoPagado = ahora;
      comanda.markModified('platos');
      await comanda.save();
      comandasCerradas.push(comanda._id);
    }

    if (comandasCerradas.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay comandas para llevar pendientes de confirmar entrega en esta mesa.',
      });
    }

    // Cerrar el pedido abierto de la mesa (si ya no quedan comandas activas)
    const quedanActivas = await comandaModel.countDocuments({
      mesas: mesaId,
      IsActive: true,
      status: { $nin: ['pagado', 'completado', 'cancelado'] },
    });

    if (quedanActivas === 0) {
      try {
        const pedidoAbierto = await pedidoModel.findOne({ mesa: mesaId, estado: 'abierto', isActive: true });
        if (pedidoAbierto) {
          pedidoAbierto.estado = 'pagado';
          pedidoAbierto.fechaPago = ahora;
          await pedidoAbierto.save();
        }
      } catch (pedErr) {
        logger.warn('No se pudo cerrar pedido tras confirmar entrega', { error: pedErr.message });
      }
    }

    // Recalcular estado de la mesa (quedará 'libre' si no hay comandas activas)
    let estadoMesaFinal = 'libre';
    try {
      await recalcularEstadoMesa(mesaId);
      const mesaActual = await mesasModel.findById(mesaId).select('estado nummesa').lean();
      estadoMesaFinal = mesaActual?.estado || 'libre';
    } catch (mesaErr) {
      logger.warn('No se pudo recalcular estado de mesa tras confirmar entrega', { error: mesaErr.message });
    }

    // Emitir eventos Socket.io
    const io = global.io;
    if (io) {
      const fechaHoy = moment().tz('America/Lima').format('YYYY-MM-DD');
      for (const comandaId of comandasCerradas) {
        io.of('/cocina').to(`fecha-${fechaHoy}`).emit('comanda-actualizada', { comandaId, status: 'pagado' });
        io.of('/mozos').to(`mesa-${mesaId}`).emit('comanda-eliminada', { comandaId, mesaId });
      }
      io.of('/mozos').emit('mesa-actualizada', { mesaId, estado: estadoMesaFinal });
      io.of('/admin').emit('mesa-actualizada', { mesaId, estado: estadoMesaFinal });
    }

    res.json({
      success: true,
      comandasCerradas,
      estadoMesa: estadoMesaFinal,
      message: 'Entrega confirmada. Mesa liberada.',
    });
  } catch (error) {
    logger.error('Error en PUT /pago-adelantado/confirmar-entrega', {
      error: error.message,
      stack: error.stack,
    });
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;