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
   */
  global.emitComandaActualizada = async (comandaId) => {
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

      // Emitir a mozos (todos los mozos conectados) - Datos completos populados
      // Validar que el namespace existe antes de emitir
      if (mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.emit('comanda-actualizada', {
          comandaId: comandaId,
          comanda: comanda,
          platosEliminados: platosEliminados,
          socketId: 'server',
          timestamp: timestamp
        });
      }

      logger.info('Evento comanda-actualizada emitido', {
        comandaNumber: comanda.comandaNumber || comandaId,
        roomName,
        timestamp,
        mozosConnected: mozosNamespace?.sockets?.size || 0
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

