const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const moment = require('moment-timezone');

/**
 * Configuración de eventos Socket.io para namespaces /cocina y /mozos
 * @param {Server} io - Instancia principal de Socket.io
 * @param {Namespace} cocinaNamespace - Namespace /cocina para app cocina
 * @param {Namespace} mozosNamespace - Namespace /mozos para app mozos
 */
module.exports = (io, cocinaNamespace, mozosNamespace) => {
  // ========== NAMESPACE /COCINA ==========
  cocinaNamespace.on('connection', (socket) => {
    console.log(`✅ Socket cocina conectado: ${socket.id}`);

    // Unirse a room por fecha para recibir solo comandas del día activo
    socket.on('join-fecha', async (fecha) => {
      const roomName = `fecha-${fecha}`;
      socket.join(roomName);
      console.log(`📅 Socket ${socket.id} se unió a room: ${roomName}`);
    });

    // Heartbeat para detectar desconexión
    socket.on('heartbeat', () => {
      socket.emit('heartbeat-ack');
    });

    socket.on('disconnect', () => {
      console.log(`❌ Socket cocina desconectado: ${socket.id}`);
    });
  });

  // ========== NAMESPACE /MOZOS ==========
  mozosNamespace.on('connection', (socket) => {
    console.log(`✅ Socket mozos conectado: ${socket.id}`);

    // 🔥 ROOMS POR MESA - Estándar industria (Odoo POS, restaurant Vue.js)
    socket.on('join-mesa', (mesaId) => {
      const roomName = `mesa-${mesaId}`;
      socket.join(roomName);
      console.log(`📌 Mozo ${socket.id} se unió a room: ${roomName}`);
      
      // Confirmar join
      socket.emit('joined-mesa', { mesaId, roomName });
    });

    socket.on('leave-mesa', (mesaId) => {
      const roomName = `mesa-${mesaId}`;
      socket.leave(roomName);
      console.log(`📌 Mozo ${socket.id} salió de room: ${roomName}`);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Socket mozos desconectado: ${socket.id}`);
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
        console.warn('⚠️ Comanda no encontrada para emitir evento');
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

      // Emitir a mozos (todos los mozos conectados)
      mozosNamespace.emit('nueva-comanda', {
        comanda: comandaCompleta,
        socketId: 'server',
        timestamp: timestamp
      });

      console.log(`📤 Evento 'nueva-comanda' emitido a COCINA (${roomName}) y MOZOS - Comanda #${comandaCompleta.comandaNumber}`);
    } catch (error) {
      console.error('❌ Error al emitir nueva-comanda:', error);
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
        console.warn('⚠️ Comanda no encontrada para emitir evento');
        return;
      }

      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;
      const timestamp = moment().tz('America/Lima').toISOString();

      // Emitir a cocina (room por fecha)
      cocinaNamespace.to(roomName).emit('comanda-actualizada', {
        comandaId: comandaId,
        comanda: comanda,
        socketId: 'server',
        timestamp: timestamp
      });

      // Emitir a mozos (todos los mozos conectados)
      mozosNamespace.emit('comanda-actualizada', {
        comandaId: comandaId,
        comanda: comanda,
        socketId: 'server',
        timestamp: timestamp
      });

      console.log(`📤 Evento 'comanda-actualizada' emitido a COCINA (${roomName}) y MOZOS - Comanda #${comanda.comandaNumber || comandaId}`);
    } catch (error) {
      console.error('❌ Error al emitir comanda-actualizada:', error);
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
        console.warn('⚠️ Comanda no encontrada para emitir evento');
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

      // Emitir a mozos (todos los mozos conectados)
      mozosNamespace.emit('plato-actualizado', {
        comandaId: comandaId,
        platoId: platoId,
        nuevoEstado: nuevoEstado,
        comanda: comanda,
        socketId: 'server',
        timestamp: timestamp
      });

      console.log(`📤 Evento 'plato-actualizado' emitido a COCINA (${roomName}) y MOZOS - Comanda #${comanda.comandaNumber}, Plato ${platoId}, Estado: ${nuevoEstado}`);
    } catch (error) {
      console.error('❌ Error al emitir plato-actualizado:', error);
    }
  };

  /**
   * Emitir evento de mesa actualizada a mozos
   */
  global.emitMesaActualizada = async (mesaId) => {
    try {
      const mesa = await mesasModel.findById(mesaId).populate('area');
      if (!mesa) {
        console.warn('⚠️ Mesa no encontrada para emitir evento');
        return;
      }

      const timestamp = moment().tz('America/Lima').toISOString();

      // Emitir a mozos (todos los mozos conectados)
      mozosNamespace.emit('mesa-actualizada', {
        mesaId: mesaId,
        mesa: mesa,
        socketId: 'server',
        timestamp: timestamp
      });

      // También emitir a cocina para que sepan el estado de las mesas
      cocinaNamespace.emit('mesa-actualizada', {
        mesaId: mesaId,
        mesa: mesa,
        socketId: 'server',
        timestamp: timestamp
      });

      console.log(`📤 Evento 'mesa-actualizada' emitido a MOZOS y COCINA - Mesa #${mesa.nummesa}`);
    } catch (error) {
      console.error('❌ Error al emitir mesa-actualizada:', error);
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
        console.warn('⚠️ Comanda no encontrada para emitir evento de reversión');
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
      if (roomNameMesa) {
        mozosNamespace.to(roomNameMesa).emit('comanda-revertida', eventData);
        console.log(`📤 Evento 'comanda-revertida' emitido a COCINA (${roomNameCocina}) y MOZOS ROOM (${roomNameMesa}) - Comanda #${comandaCompleta.comandaNumber || comandaCompleta._id} - Status: ${comandaCompleta.status} - Mesa: ${mesaActualizada?.nummesa || 'N/A'} → ${mesaActualizada?.estado || 'N/A'}`);
      } else {
        // Fallback: emitir a todos los mozos si no hay mesaId
        mozosNamespace.emit('comanda-revertida', eventData);
        console.log(`📤 Evento 'comanda-revertida' emitido a COCINA (${roomNameCocina}) y TODOS LOS MOZOS (fallback) - Comanda #${comandaCompleta.comandaNumber || comandaCompleta._id}`);
      }
    } catch (error) {
      console.error('❌ Error al emitir comanda-revertida:', error);
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

  console.log('✅ Eventos Socket.io configurados correctamente');
};

