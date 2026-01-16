const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');

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
      const moment = require('moment-timezone');
      const fecha = moment(comandaCompleta.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      // Emitir a todos los sockets en el room de la fecha
      cocinaNamespace.to(roomName).emit('nueva-comanda', {
        comanda: comandaCompleta,
        timestamp: new Date().toISOString()
      });

      console.log(`📤 Evento 'nueva-comanda' emitido a room ${roomName} - Comanda #${comandaCompleta.comandaNumber}`);
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

      const moment = require('moment-timezone');
      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      cocinaNamespace.to(roomName).emit('comanda-actualizada', {
        comandaId: comandaId,
        comanda: comanda,
        timestamp: new Date().toISOString()
      });

      console.log(`📤 Evento 'comanda-actualizada' emitido - Comanda #${comanda.comandaNumber || comandaId}`);
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

      const moment = require('moment-timezone');
      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      cocinaNamespace.to(roomName).emit('plato-actualizado', {
        comandaId: comandaId,
        platoId: platoId,
        nuevoEstado: nuevoEstado,
        comanda: comanda,
        timestamp: new Date().toISOString()
      });

      console.log(`📤 Evento 'plato-actualizado' emitido - Comanda #${comanda.comandaNumber}, Plato ${platoId}, Estado: ${nuevoEstado}`);
    } catch (error) {
      console.error('❌ Error al emitir plato-actualizado:', error);
    }
  };

  /**
   * Emitir evento de mesa actualizada a mozos
   */
  global.emitMesaActualizada = async (mesaId) => {
    try {
      const mesa = await mesasModel.findById(mesaId);
      if (!mesa) {
        console.warn('⚠️ Mesa no encontrada para emitir evento');
        return;
      }

      mozosNamespace.emit('mesa-actualizada', {
        mesaId: mesaId,
        mesa: mesa,
        timestamp: new Date().toISOString()
      });

      console.log(`📤 Evento 'mesa-actualizada' emitido - Mesa #${mesa.nummesa}`);
    } catch (error) {
      console.error('❌ Error al emitir mesa-actualizada:', error);
    }
  };

  console.log('✅ Eventos Socket.io configurados correctamente');
};

