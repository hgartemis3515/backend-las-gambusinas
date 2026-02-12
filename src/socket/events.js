const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

/**
 * Configuración de eventos Socket.io para namespaces /cocina y /mozos
 * Con reconexión robusta y backoff exponencial
 * @param {Server} io - Instancia principal de Socket.io
 * @param {Namespace} cocinaNamespace - Namespace /cocina para app cocina
 * @param {Namespace} mozosNamespace - Namespace /mozos para app mozos
 */
module.exports = (io, cocinaNamespace, mozosNamespace) => {
  // ========== NAMESPACE /COCINA ==========
  cocinaNamespace.on('connection', (socket) => {
    logger.info('Socket cocina conectado', { socketId: socket.id });

    // Validar namespace (seguridad)
    if (socket.nsp.name !== '/cocina') {
      logger.warn('Intento de conexión a namespace incorrecto', {
        socketId: socket.id,
        namespace: socket.nsp.name
      });
      socket.disconnect();
      return;
    }

    // Unirse a room por fecha para recibir solo comandas del día activo
    socket.on('join-fecha', async (fecha) => {
      if (!fecha) {
        logger.warn('Intento de join-fecha sin fecha', { socketId: socket.id });
        return;
      }
      
      const roomName = `fecha-${fecha}`;
      socket.join(roomName);
      logger.debug('Socket cocina se unió a room', { socketId: socket.id, roomName });
      
      // Confirmar join
      socket.emit('joined-fecha', { fecha, roomName });
    });

    // Heartbeat para detectar desconexión
    socket.on('heartbeat', () => {
      socket.emit('heartbeat-ack');
    });

    // Manejo de errores de conexión
    socket.on('error', (error) => {
      logger.error('Error en socket cocina', { socketId: socket.id, error: error.message });
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket cocina desconectado', { socketId: socket.id, reason });
    });
  });

  // ========== NAMESPACE /MOZOS ==========
  mozosNamespace.on('connection', (socket) => {
    logger.info('Socket mozos conectado', { socketId: socket.id });

    // Validar namespace (seguridad)
    if (socket.nsp.name !== '/mozos') {
      logger.warn('Intento de conexión a namespace incorrecto', {
        socketId: socket.id,
        namespace: socket.nsp.name
      });
      socket.disconnect();
      return;
    }

    // 🔥 ROOMS POR MESA - Estándar industria (Odoo POS, restaurant Vue.js)
    socket.on('join-mesa', (mesaId) => {
      if (!mesaId) {
        logger.warn('Intento de join-mesa sin mesaId', { socketId: socket.id });
        return;
      }
      
      const roomName = `mesa-${mesaId}`;
      socket.join(roomName);
      logger.debug('Mozo se unió a room', { socketId: socket.id, mesaId, roomName });
      
      // Confirmar join
      socket.emit('joined-mesa', { mesaId, roomName });
    });

    socket.on('leave-mesa', (mesaId) => {
      if (!mesaId) {
        logger.warn('Intento de leave-mesa sin mesaId', { socketId: socket.id });
        return;
      }
      
      const roomName = `mesa-${mesaId}`;
      socket.leave(roomName);
      logger.debug('Mozo salió de room', { socketId: socket.id, mesaId, roomName });
    });

    // Heartbeat para detectar desconexión
    socket.on('heartbeat', () => {
      socket.emit('heartbeat-ack');
    });

    // Manejo de errores de conexión
    socket.on('error', (error) => {
      logger.error('Error en socket mozos', { socketId: socket.id, error: error.message });
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket mozos desconectado', { socketId: socket.id, reason });
    });
  });

  // ========== FUNCIONES HELPER PARA EMITIR EVENTOS ==========

  /**
   * Emitir evento de nueva comanda a cocina
   */
  global.emitNuevaComanda = async (comanda) => {
    try {
      // Obtener comanda con populate completo
      const comandaCompleta = await comandaModel
        .findById(comanda._id || comanda)
        .populate({
          path: "mozos",
        })
        .populate({
          path: "mesas",
          populate: {
            path: "area"
          }
        })
        .populate({
          path: "cliente"
        })
        .populate({
          path: "platos.plato",
          model: "platos"
        });

      if (!comandaCompleta) {
        logger.warn('Comanda no encontrada para emitir evento');
        return;
      }

      // Obtener fecha de la comanda
      const fecha = moment(comandaCompleta.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;
      const timestamp = moment().tz('America/Lima').toISOString();

      // Emitir a cocina (room por fecha)
      cocinaNamespace.to(roomName).emit('nueva-comanda', {
        comanda: comandaCompleta,
        socketId: 'server',
        timestamp: timestamp
      });

      // Emitir a mozos (todos los mozos conectados) - Datos completos populados
      // Validar que el namespace existe antes de emitir
      if (mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.emit('nueva-comanda', {
          comanda: comandaCompleta,
          socketId: 'server',
          timestamp: timestamp
        });
      }

      logger.info('Evento nueva-comanda emitido', {
        comandaNumber: comandaCompleta.comandaNumber,
        roomName,
        timestamp,
        mozosConnected: mozosNamespace?.sockets?.size || 0
      });
    } catch (error) {
      logger.error('Error al emitir nueva-comanda', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento de comanda actualizada a cocina
   * @param {String} comandaId - ID de la comanda
   * @param {String} estadoAnterior - Estado anterior (opcional)
   * @param {String} estadoNuevo - Estado nuevo (opcional)
   * @param {Object} cuentasPlatos - Cuentas de platos por estado (opcional)
   */
  global.emitComandaActualizada = async (comandaId, estadoAnterior = null, estadoNuevo = null, cuentasPlatos = null) => {
    try {
      const comanda = await comandaModel
        .findById(comandaId)
        .populate({
          path: "mozos",
        })
        .populate({
          path: "mesas",
          populate: {
            path: "area"
          }
        })
        .populate({
          path: "cliente"
        })
        .populate({
          path: "platos.plato",
          model: "platos"
        });

      if (!comanda) {
        logger.warn('Comanda no encontrada para emitir evento');
        return;
      }

      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;
      const timestamp = moment().tz('America/Lima').toISOString();

      // Obtener platos eliminados del historial con nombres correctos
      const platosEliminados = [];
      if (comanda.historialPlatos && comanda.historialPlatos.length > 0) {
        const platoModel = require('../database/models/plato.model');
        for (const h of comanda.historialPlatos) {
          if (h.estado === 'eliminado') {
            let nombrePlato = h.nombreOriginal;
            // Si no tiene nombre o es un placeholder, buscarlo desde la BD
            if (!nombrePlato || nombrePlato === 'Plato desconocido' || nombrePlato === 'Sin nombre' || nombrePlato.startsWith('Plato #')) {
              if (h.platoId) {
                const plato = await platoModel.findOne({ id: h.platoId });
                if (plato && plato.nombre) {
                  nombrePlato = plato.nombre;
                  console.log(`✅ Nombre encontrado para plato eliminado: platoId=${h.platoId}, nombre=${nombrePlato}`);
                } else {
                  console.warn(`⚠️ No se encontró plato con id=${h.platoId} para obtener nombre`);
                }
              }
            }
            platosEliminados.push({
              ...h,
              nombreOriginal: nombrePlato || `Plato #${h.platoId || 'N/A'}`
            });
          }
        }
      }

      // Emitir a cocina (room por fecha) - Incluir información de platos eliminados
      cocinaNamespace.to(roomName).emit('comanda-actualizada', {
        comandaId: comandaId,
        comanda: comanda,
        platosEliminados: platosEliminados,
        socketId: 'server',
        timestamp: timestamp
      });

      // Emitir a mozos - Si hay mesaId, usar room por mesa, sino a todos
      const mesaId = comanda.mesas?._id || comanda.mesas;
      const eventData = {
          comandaId: comandaId,
          comanda: comanda,
          platosEliminados: platosEliminados,
          socketId: 'server',
          timestamp: timestamp
      };
      
      // Agregar información adicional si está disponible
      if (estadoAnterior !== null && estadoNuevo !== null) {
        eventData.estadoAnterior = estadoAnterior;
        eventData.estadoNuevo = estadoNuevo;
      }
      
      if (cuentasPlatos) {
        eventData.platosEnPedido = cuentasPlatos.pedido || 0;
        eventData.platosEnRecoger = cuentasPlatos.recoger || 0;
        eventData.platosEntregados = cuentasPlatos.entregado || 0;
      }
      
      if (mesaId && mozosNamespace && mozosNamespace.sockets) {
        // Emitir a room de la mesa específica
        const roomNameMesa = `mesa-${mesaId}`;
        mozosNamespace.to(roomNameMesa).emit('comanda-actualizada', eventData);
        logger.debug('Evento comanda-actualizada emitido a room de mesa', {
          comandaId,
          mesaId,
          roomNameMesa
        });
      } else if (mozosNamespace && mozosNamespace.sockets) {
        // Fallback: emitir a todos los mozos
        mozosNamespace.emit('comanda-actualizada', eventData);
      }

      logger.info('Evento comanda-actualizada emitido', {
        comandaNumber: comanda.comandaNumber || comandaId,
        roomName,
        timestamp,
        mozosConnected: mozosNamespace?.sockets?.size || 0,
        estadoAnterior,
        estadoNuevo
      });
    } catch (error) {
      logger.error('Error al emitir comanda-actualizada', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento de plato actualizado a cocina
   */
  global.emitPlatoActualizado = async (comandaId, platoId, nuevoEstado) => {
    try {
      const comanda = await comandaModel
        .findById(comandaId)
        .populate({
          path: "mozos",
        })
        .populate({
          path: "mesas",
          populate: {
            path: "area"
          }
        })
        .populate({
          path: "cliente"
        })
        .populate({
          path: "platos.plato",
          model: "platos"
        });

      if (!comanda) {
        logger.warn('Comanda no encontrada para emitir evento');
        return;
      }

      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;
      const timestamp = moment().tz('America/Lima').toISOString();

      // Emitir a cocina (room por fecha)
      cocinaNamespace.to(roomName).emit('plato-actualizado', {
        comandaId: comandaId,
        platoId: platoId,
        nuevoEstado: nuevoEstado,
        comanda: comanda,
        socketId: 'server',
        timestamp: timestamp
      });

      // Emitir a mozos (todos los mozos conectados) - Datos completos populados
      // Validar que el namespace existe antes de emitir
      if (mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.emit('plato-actualizado', {
          comandaId: comandaId,
          platoId: platoId,
          nuevoEstado: nuevoEstado,
          comanda: comanda,
          socketId: 'server',
          timestamp: timestamp
        });
      }

      logger.info('Evento plato-actualizado emitido', {
        comandaNumber: comanda.comandaNumber,
        platoId,
        nuevoEstado,
        roomName,
        timestamp,
        mozosConnected: mozosNamespace?.sockets?.size || 0
      });
    } catch (error) {
      logger.error('Error al emitir plato-actualizado', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * FASE 5: Emitir batch de platos actualizados (optimización batching)
   * @param {Object} batch - {comandaId, platos: Array, mesaId, fecha}
   */
  global.emitPlatoBatch = async (batch) => {
    try {
      const { comandaId, platos, mesaId, fecha } = batch;
      
      if (!comandaId || !platos || platos.length === 0) {
        logger.warn('FASE5: Batch inválido', batch);
        return;
      }

      const timestamp = moment().tz('America/Lima').toISOString();
      const fechaComanda = fecha || moment().tz("America/Lima").format('YYYY-MM-DD');
      const roomNameCocina = `fecha-${fechaComanda}`;
      const roomNameMesa = mesaId ? `mesa-${mesaId}` : null;

      // Payload batch: múltiples platos en 1 evento
      const eventData = {
        comandaId: comandaId.toString(),
        platos: platos.map(p => ({
          platoId: p.platoId?.toString(),
          nuevoEstado: p.nuevoEstado,
          estadoAnterior: p.estadoAnterior || null
        })),
        timestamp: timestamp,
        socketId: 'server',
        batchSize: platos.length
      };

      // Emitir a cocina (room por fecha)
      const cocinaClients = cocinaNamespace.adapter.rooms.get(roomNameCocina)?.size || 0;
      cocinaNamespace.to(roomNameCocina).emit('plato-actualizado-batch', eventData);

      // Emitir a mozos (room por mesa si existe, sino a todos)
      let mozosClients = 0;
      if (mozosNamespace && mozosNamespace.sockets) {
        if (roomNameMesa) {
          mozosClients = mozosNamespace.adapter.rooms.get(roomNameMesa)?.size || 0;
          mozosNamespace.to(roomNameMesa).emit('plato-actualizado-batch', eventData);
        } else {
          mozosClients = mozosNamespace.sockets.size;
          mozosNamespace.emit('plato-actualizado-batch', eventData);
        }
      }

      const totalClients = cocinaClients + mozosClients;
      const payloadSize = JSON.stringify(eventData).length;
      
      logger.info('FASE5: Batch de platos emitido', {
        comandaId: comandaId.toString(),
        platosCount: platos.length,
        roomNameCocina,
        roomNameMesa: roomNameMesa || 'todos',
        cocinaClients,
        mozosClients,
        totalClients,
        payloadSize,
        reduction: `${Math.round((1 - payloadSize / (platos.length * 200)) * 100)}%`,
        timestamp
      });

      console.log(`FASE5: Batch ${platos.length} platos → ${totalClients} clientes (${payloadSize}B payload)`);
    } catch (error) {
      logger.error('FASE5: Error al emitir batch de platos', {
        error: error.message,
        stack: error.stack,
        batch
      });
    }
  };

  /**
   * FASE 2: Emitir evento GRANULAR de plato actualizado (solo datos mínimos)
   * FASE 5: Ahora usa batching para optimizar múltiples eventos
   * Optimización: En lugar de emitir toda la comanda (10KB), solo emite el plato cambiado (200B)
   * @param {Object} datos - {comandaId, platoId, nuevoEstado, estadoAnterior, mesaId, fecha}
   */
  global.emitPlatoActualizadoGranular = async (datos) => {
    // FASE 5: Agregar a queue de batching en lugar de emitir inmediatamente
    const batchQueue = require('../utils/websocketBatch');
    batchQueue.addPlatoEvent(datos);
    
    // FASE 5: El evento se emitirá en batch cada 300ms
    // Mantener compatibilidad: también emitir evento individual si es necesario
    // (comentado para forzar uso de batching - descomentar si se necesita compatibilidad)
    return; // Salir temprano para usar solo batching
    
    /* CÓDIGO ORIGINAL (comentado para usar batching):
    try {
      const { comandaId, platoId, nuevoEstado, estadoAnterior, mesaId, fecha } = datos;
      
      if (!comandaId || !platoId || !nuevoEstado) {
        logger.warn('FASE2: Datos incompletos para emitPlatoActualizadoGranular', datos);
        return;
      }

      const timestamp = moment().tz('America/Lima').toISOString();
      
      // Determinar fecha si no se proporciona
      let fechaComanda = fecha;
      if (!fechaComanda) {
        try {
          const comanda = await comandaModel.findById(comandaId);
          if (comanda && comanda.createdAt) {
            fechaComanda = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
          } else {
            fechaComanda = moment().tz("America/Lima").format('YYYY-MM-DD');
          }
        } catch (error) {
          fechaComanda = moment().tz("America/Lima").format('YYYY-MM-DD');
        }
      }

      const roomNameCocina = `fecha-${fechaComanda}`;
      const roomNameMesa = mesaId ? `mesa-${mesaId}` : null;

      // Payload mínimo (200 bytes vs 10KB de comanda completa)
      const eventData = {
        comandaId: comandaId.toString(),
        platoId: platoId.toString(),
        nuevoEstado: nuevoEstado,
        estadoAnterior: estadoAnterior || null,
        timestamp: timestamp,
        socketId: 'server'
      };

      // Emitir a cocina (room por fecha)
      const cocinaClients = cocinaNamespace.adapter.rooms.get(roomNameCocina)?.size || 0;
      cocinaNamespace.to(roomNameCocina).emit('plato-actualizado', eventData);

      // Emitir a mozos (room por mesa si existe, sino a todos)
      let mozosClients = 0;
      if (mozosNamespace && mozosNamespace.sockets) {
        if (roomNameMesa) {
          mozosClients = mozosNamespace.adapter.rooms.get(roomNameMesa)?.size || 0;
          mozosNamespace.to(roomNameMesa).emit('plato-actualizado', eventData);
        } else {
          // Fallback: emitir a todos los mozos si no hay mesaId
          mozosClients = mozosNamespace.sockets.size;
          mozosNamespace.emit('plato-actualizado', eventData);
        }
      }

      const totalClients = cocinaClients + mozosClients;
      
      logger.info('FASE2: Plato actualizado granular emitido', {
        comandaId: comandaId.toString(),
        platoId: platoId.toString(),
        estadoAnterior: estadoAnterior || 'N/A',
        nuevoEstado: nuevoEstado,
        roomNameCocina,
        roomNameMesa: roomNameMesa || 'todos',
        cocinaClients,
        mozosClients,
        totalClients,
        payloadSize: JSON.stringify(eventData).length,
        timestamp
      });

      console.log(`FASE2: Plato ${platoId} → estado ${nuevoEstado} → ${totalClients} clientes notificados`);
    } catch (error) {
      logger.error('FASE2: Error al emitir plato-actualizado granular', {
        error: error.message,
        stack: error.stack,
        datos
      });
    }
    */
  };

  /**
   * Emitir evento de comanda eliminada a cocina y mozos
   */
  global.emitComandaEliminada = async (comandaId) => {
    try {
      const comanda = await comandaModel
        .findById(comandaId)
        .populate({
          path: "mozos",
        })
        .populate({
          path: "mesas",
          populate: {
            path: "area"
          }
        })
        .populate({
          path: "cliente"
        })
        .populate({
          path: "platos.plato",
          model: "platos"
        });

      if (!comanda) {
        logger.warn('Comanda no encontrada para emitir evento de eliminación');
        return;
      }

      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;
      const timestamp = moment().tz('America/Lima').toISOString();

      // Emitir a cocina (room por fecha) - IMPORTANTE: La comanda eliminada debe desaparecer
      cocinaNamespace.to(roomName).emit('comanda-eliminada', {
        comandaId: comandaId,
        comanda: comanda,
        socketId: 'server',
        timestamp: timestamp
      });

      // Emitir a mozos (room por mesa) - IMPORTANTE: Notificar a los mozos de la mesa
      const mesaId = comanda.mesas?._id || comanda.mesas;
      if (mesaId && mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.to(`mesa-${mesaId}`).emit('comanda-eliminada', {
          comandaId: comandaId,
          comanda: comanda,
          socketId: 'server',
          timestamp: timestamp
        });
      }

      logger.info('Evento comanda-eliminada emitido', {
        comandaNumber: comanda.comandaNumber,
        comandaId: comandaId,
        roomName,
        mesaId: mesaId,
        timestamp,
        cocinaConnected: cocinaNamespace?.sockets?.size || 0,
        mozosConnected: mozosNamespace?.sockets?.size || 0
      });
    } catch (error) {
      logger.error('Error al emitir comanda-eliminada', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento de mesa actualizada a mozos
   */
  global.emitMesaActualizada = async (mesaId) => {
    try {
      const mesa = await mesasModel.findById(mesaId).populate('area');
      if (!mesa) {
        logger.warn('Mesa no encontrada para emitir evento');
        return;
      }

      const timestamp = moment().tz('America/Lima').toISOString();

      // Emitir a mozos (todos los mozos conectados) - Datos completos populados
      // Validar que el namespace existe antes de emitir
      if (mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.emit('mesa-actualizada', {
          mesaId: mesaId,
          mesa: mesa,
          socketId: 'server',
          timestamp: timestamp
        });
      }

      // También emitir a cocina para que sepan el estado de las mesas
      if (cocinaNamespace && cocinaNamespace.sockets) {
        cocinaNamespace.emit('mesa-actualizada', {
          mesaId: mesaId,
          mesa: mesa,
          socketId: 'server',
          timestamp: timestamp
        });
      }

      logger.info('Evento mesa-actualizada emitido', {
        mesaId: mesa._id,
        numMesa: mesa.nummesa,
        estado: mesa.estado,
        timestamp,
        mozosConnected: mozosNamespace?.sockets?.size || 0,
        cocinaConnected: cocinaNamespace?.sockets?.size || 0
      });
    } catch (error) {
      logger.error('Error al emitir mesa-actualizada', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento de comanda revertida a cocina y mozos
   * CRÍTICO: Este evento soluciona el problema de desincronización cuando cocina revierte una comanda
   * ESTÁNDAR INDUSTRIA: Usa Rooms por mesa para notificar solo a mozos relevantes
   */
  global.emitComandaRevertida = async (comanda, mesa) => {
    try {
      // Si comanda es un ID, obtener la comanda completa
      let comandaCompleta = comanda;
      if (typeof comanda === 'string' || (comanda && comanda._id && !comanda.mesas)) {
        const comandaId = typeof comanda === 'string' ? comanda : comanda._id;
        comandaCompleta = await comandaModel
          .findById(comandaId)
          .populate({
            path: "mozos",
          })
          .populate({
            path: "mesas",
            populate: {
              path: "area"
            }
          })
          .populate({
            path: "cliente"
          })
          .populate({
            path: "platos.plato",
            model: "platos"
          });
      }

      if (!comandaCompleta) {
        logger.warn('Comanda no encontrada para emitir evento de reversión');
        return;
      }

      // Obtener mesa si no se proporcionó
      let mesaActualizada = mesa;
      if (!mesaActualizada) {
        const mesaId = comandaCompleta.mesas?._id || comandaCompleta.mesas;
        if (mesaId) {
          mesaActualizada = await mesasModel.findById(mesaId).populate('area');
        }
      }

      const fecha = moment(comandaCompleta.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomNameCocina = `fecha-${fecha}`;
      const mesaId = mesaActualizada?._id || comandaCompleta.mesas?._id || comandaCompleta.mesas;
      const roomNameMesa = mesaId ? `mesa-${mesaId}` : null;
      const timestamp = moment().tz('America/Lima').toISOString();

      const eventData = {
        comandaId: comandaCompleta._id,
        comanda: comandaCompleta,
        mesa: mesaActualizada ? {
          _id: mesaActualizada._id,
          nummesa: mesaActualizada.nummesa,
          estado: mesaActualizada.estado,
          area: mesaActualizada.area
        } : null,
        socketId: 'server',
        timestamp: timestamp
      };

      // Emitir a cocina (room por fecha)
      cocinaNamespace.to(roomNameCocina).emit('comanda-revertida', eventData);

      // 🔥 ESTÁNDAR INDUSTRIA: Emitir a ROOM específico de la mesa (solo mozos de esa mesa)
      // Validar que el namespace existe antes de emitir
      if (mozosNamespace && mozosNamespace.sockets) {
        if (roomNameMesa) {
          mozosNamespace.to(roomNameMesa).emit('comanda-revertida', eventData);
          logger.info('Evento comanda-revertida emitido a room', {
            comandaNumber: comandaCompleta.comandaNumber || comandaCompleta._id,
            status: comandaCompleta.status,
            roomNameCocina,
            roomNameMesa,
            numMesa: mesaActualizada?.nummesa,
            estadoMesa: mesaActualizada?.estado,
            timestamp,
            mozosInRoom: mozosNamespace.adapter.rooms.get(roomNameMesa)?.size || 0
          });
        } else {
          // Fallback: emitir a todos los mozos si no hay mesaId
          mozosNamespace.emit('comanda-revertida', eventData);
          logger.info('Evento comanda-revertida emitido (fallback)', {
            comandaNumber: comandaCompleta.comandaNumber || comandaCompleta._id,
            roomNameCocina,
            timestamp,
            mozosConnected: mozosNamespace.sockets.size
          });
        }
      }
    } catch (error) {
      logger.error('Error al emitir comanda-revertida', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento cuando un plato es marcado como entregado
   * @param {String} comandaId - ID de la comanda
   * @param {String|Number} platoId - ID del plato
   * @param {String} platoNombre - Nombre del plato
   * @param {String} estadoAnterior - Estado anterior del plato
   */
  global.emitPlatoEntregado = async (comandaId, platoId, platoNombre, estadoAnterior = 'recoger') => {
    try {
      const comanda = await comandaModel.findById(comandaId)
        .populate('mozos')
        .populate('mesas')
        .populate('platos.plato');
      
      if (!comanda) {
        logger.warn('Comanda no encontrada para emitir evento plato-entregado', { comandaId });
        return;
      }
      
      const evento = {
        comandaId,
        comandaNumber: comanda.comandaNumber,
        platoId,
        platoNombre,
        estadoAnterior,
        estadoNuevo: 'entregado',
        mozoId: comanda.mozos?._id || comanda.mozos,
        mozoNombre: comanda.mozos?.name || 'Desconocido',
        mesaId: comanda.mesas?._id || comanda.mesas,
        mesaNumero: comanda.mesas?.nummesa || 'N/A',
        timestamp: moment().tz('America/Lima').toISOString()
      };
      
      // Emitir a namespace mozos (room de mesa si existe)
      const mesaId = comanda.mesas?._id || comanda.mesas;
      if (mesaId && mozosNamespace && mozosNamespace.sockets) {
        const roomNameMesa = `mesa-${mesaId}`;
        mozosNamespace.to(roomNameMesa).emit('plato-entregado', evento);
        logger.debug('Evento plato-entregado emitido a room de mesa', {
          comandaId,
          platoId,
          mesaId,
          roomNameMesa
        });
      } else if (mozosNamespace && mozosNamespace.sockets) {
        // Fallback: emitir a todos los mozos
        mozosNamespace.emit('plato-entregado', evento);
      }
      
      // Emitir a namespace cocina (para estadísticas)
      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomNameCocina = `fecha-${fecha}`;
      cocinaNamespace.to(roomNameCocina).emit('plato-entregado', evento);
      
      logger.info('Evento plato-entregado emitido', {
        comandaId,
        comandaNumber: comanda.comandaNumber,
        platoId,
        platoNombre,
        mesaId
      });
    } catch (error) {
      logger.error('Error al emitir plato-entregado', {
        error: error.message,
        stack: error.stack,
        comandaId,
        platoId
      });
    }
  };

  // Enviar estado de socket cada 30 segundos
  const statusInterval = setInterval(() => {
    const timestamp = moment().tz('America/Lima').toISOString();
    
    cocinaNamespace.emit('socket-status', {
      connected: true,
      socketId: 'server',
      timestamp: timestamp
    });
    
    mozosNamespace.emit('socket-status', {
      connected: true,
      socketId: 'server',
      timestamp: timestamp
    });
  }, 30000); // Cada 30 segundos

  // Limpiar intervalo al cerrar (opcional, pero buena práctica)
  process.on('SIGINT', () => {
    clearInterval(statusInterval);
  });

  logger.info('Eventos Socket.io configurados correctamente', {
    namespaces: ['/cocina', '/mozos']
  });
};

