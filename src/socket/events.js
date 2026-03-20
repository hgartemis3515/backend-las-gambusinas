const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { 
  authenticateCocina, 
  authenticateMozos, 
  authenticateAdmin,
  emitToZona 
} = require('../middleware/socketAuth');

/**
 * Configuración de eventos Socket.io para namespaces /cocina, /mozos y /admin
 * Con reconexión robusta, backoff exponencial y autenticación JWT
 * 
 * @version 7.1
 * @param {Server} io - Instancia principal de Socket.io
 * @param {Namespace} cocinaNamespace - Namespace /cocina para app cocina
 * @param {Namespace} mozosNamespace - Namespace /mozos para app mozos
 * @param {Namespace} adminNamespace - Namespace /admin para dashboard admin
 */
module.exports = (io, cocinaNamespace, mozosNamespace, adminNamespace) => {

  // ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
  
  /**
   * Aplicar middleware de autenticación a cada namespace
   * Los sockets no autenticados serán rechazados
   */
  cocinaNamespace.use(authenticateCocina);
  mozosNamespace.use(authenticateMozos);
  adminNamespace.use(authenticateAdmin);
  
  logger.info('Middlewares de autenticación Socket.io configurados', {
    namespaces: ['/cocina', '/mozos', '/admin']
  });

  // ========== NAMESPACE /COCINA ==========
  cocinaNamespace.on('connection', (socket) => {
    logger.info('Socket cocina conectado', { 
      socketId: socket.id,
      userId: socket.user?.id,
      userName: socket.user?.name,
      rol: socket.user?.rol
    });

    // Validar namespace (seguridad adicional)
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

    // 🔥 TEMA 1: Unirse a room personal del cocinero para recibir actualizaciones de configuración
    // Esto permite emitir eventos específicos a cada cocinero sin broadcast a todos
    socket.on('join-cocinero', async (cocineroId) => {
      if (!cocineroId) {
        logger.warn('Intento de join-cocinero sin cocineroId', { socketId: socket.id });
        return;
      }
      
      const roomName = `cocinero-${cocineroId}`;
      socket.join(roomName);
      logger.debug('Socket cocina se unió a room personal', { socketId: socket.id, cocineroId, roomName });
      
      // Confirmar join
      socket.emit('joined-cocinero', { cocineroId, roomName });
    });

    // Salir de room personal del cocinero
    socket.on('leave-cocinero', (cocineroId) => {
      if (!cocineroId) {
        logger.warn('Intento de leave-cocinero sin cocineroId', { socketId: socket.id });
        return;
      }
      
      const roomName = `cocinero-${cocineroId}`;
      socket.leave(roomName);
      logger.debug('Socket cocina salió de room personal', { socketId: socket.id, cocineroId, roomName });
    });

    // ==================== ROOMS POR ZONA (v7.1) ====================
    
    /**
     * Unirse a room de zona específica
     * Permite recibir eventos solo de comandas/platos de esa zona
     * El cocinero se une automáticamente a sus zonas asignadas
     */
    socket.on('join-zona', async (zonaId) => {
      if (!zonaId) {
        logger.warn('Intento de join-zona sin zonaId', { socketId: socket.id });
        return;
      }
      
      // Validar que el usuario tiene acceso a esta zona
      // (El cocinero debe tener la zona asignada o ser admin/supervisor)
      const user = socket.user;
      const isAdmin = ['admin', 'supervisor'].includes(user?.rol);
      
      // Si no es admin, verificar que la zona esté asignada
      if (!isAdmin) {
        try {
          const Mozos = require('../database/models/mozos.model');
          const cocinero = await Mozos.findById(user.id).select('zonaIds').lean();
          
          if (!cocinero || !cocinero.zonaIds?.some(z => z.toString() === zonaId)) {
            logger.warn('Intento de join-zona sin permisos', { 
              socketId: socket.id, 
              zonaId, 
              userId: user.id 
            });
            socket.emit('zona-error', { 
              zonaId, 
              error: 'No tiene acceso a esta zona' 
            });
            return;
          }
        } catch (error) {
          logger.error('Error al validar zona del cocinero', { error: error.message });
          return;
        }
      }
      
      const roomName = `zona-${zonaId}`;
      socket.join(roomName);
      
      logger.info('Socket cocina se unió a room de zona', { 
        socketId: socket.id, 
        zonaId, 
        roomName,
        userId: user?.id 
      });
      
      // Confirmar join
      socket.emit('joined-zona', { zonaId, roomName });
    });

    /**
     * Salir de room de zona
     */
    socket.on('leave-zona', (zonaId) => {
      if (!zonaId) {
        logger.warn('Intento de leave-zona sin zonaId', { socketId: socket.id });
        return;
      }
      
      const roomName = `zona-${zonaId}`;
      socket.leave(roomName);
      
      logger.debug('Socket cocina salió de room de zona', { 
        socketId: socket.id, 
        zonaId, 
        roomName 
      });
    });

    /**
     * Unirse a todas las zonas asignadas al cocinero
     * Endpoint de conveniencia para no tener que hacer múltiples join-zona
     */
    socket.on('join-mis-zonas', async () => {
      try {
        const user = socket.user;
        
        if (!user?.id) {
          logger.warn('join-mis-zonas sin usuario autenticado');
          return;
        }
        
        // Admins y supervisores se unen a todas las zonas
        if (['admin', 'supervisor'].includes(user.rol)) {
          const Zona = require('../database/models/zona.model');
          const zonas = await Zona.find({ activo: { $ne: false } }).select('_id').lean();
          
          zonas.forEach(z => {
            const roomName = `zona-${z._id}`;
            socket.join(roomName);
          });
          
          logger.info('Admin/supervisor se unió a todas las zonas', { 
            socketId: socket.id, 
            userId: user.id,
            zonasCount: zonas.length 
          });
          
          socket.emit('joined-mis-zonas', { 
            zonas: zonas.map(z => z._id),
            todas: true 
          });
          return;
        }
        
        // Cocineros: unirse solo a sus zonas asignadas
        const Mozos = require('../database/models/mozos.model');
        const cocinero = await Mozos.findById(user.id).select('zonaIds').lean();
        
        if (!cocinero || !cocinero.zonaIds?.length) {
          logger.info('Cocinero sin zonas asignadas', { userId: user.id });
          socket.emit('joined-mis-zonas', { zonas: [] });
          return;
        }
        
        // Unirse a cada zona
        const zonaIds = cocinero.zonaIds.map(z => z.toString());
        zonaIds.forEach(zonaId => {
          const roomName = `zona-${zonaId}`;
          socket.join(roomName);
        });
        
        logger.info('Cocinero se unió a sus zonas', { 
          socketId: socket.id, 
          userId: user.id,
          zonas: zonaIds 
        });
        
        socket.emit('joined-mis-zonas', { zonas: zonaIds });
        
      } catch (error) {
        logger.error('Error en join-mis-zonas', { error: error.message });
      }
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

  // ========== NAMESPACE /ADMIN ==========
  adminNamespace.on('connection', (socket) => {
    logger.info('Socket admin conectado', { socketId: socket.id });

    // Validar namespace (seguridad)
    if (socket.nsp.name !== '/admin') {
      logger.warn('Intento de conexión a namespace incorrecto', {
        socketId: socket.id,
        namespace: socket.nsp.name
      });
      socket.disconnect();
      return;
    }

    // Heartbeat para detectar desconexión
    socket.on('heartbeat', () => {
      socket.emit('heartbeat-ack');
    });

    // Manejo de errores de conexión
    socket.on('error', (error) => {
      logger.error('Error en socket admin', { socketId: socket.id, error: error.message });
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket admin desconectado', { socketId: socket.id, reason });
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
   * Emitir evento cuando se actualiza un plato del menú (tipo/categoría) para que mozos y cocina refresquen listas
   * @param {Object} plato - Documento plato (puede ser lean o mongoose doc)
   */
  global.emitPlatoMenuActualizado = async (plato) => {
    try {
      const payload = plato && plato.toObject ? plato.toObject() : plato;
      if (!payload || !payload._id) {
        logger.warn('emitPlatoMenuActualizado: plato inválido');
        return;
      }
      const timestamp = moment().tz('America/Lima').toISOString();
      const eventData = {
        plato: payload,
        socketId: 'server',
        timestamp
      };
      if (cocinaNamespace && cocinaNamespace.sockets) {
        cocinaNamespace.emit('plato-menu-actualizado', eventData);
      }
      if (mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.emit('plato-menu-actualizado', eventData);
      }
      if (adminNamespace && adminNamespace.sockets) {
        adminNamespace.emit('plato-menu-actualizado', eventData);
      }
      logger.info('Evento plato-menu-actualizado emitido', {
        platoId: payload.id || payload._id,
        tipo: payload.tipo,
        cocinaConnected: cocinaNamespace?.sockets?.size || 0,
        mozosConnected: mozosNamespace?.sockets?.size || 0
      });
    } catch (error) {
      logger.error('Error al emitir plato-menu-actualizado', {
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

    adminNamespace.emit('socket-status', {
      connected: true,
      socketId: 'server',
      timestamp: timestamp
    });
  }, 30000); // Cada 30 segundos

  // Limpiar intervalo al cerrar (opcional, pero buena práctica)
  process.on('SIGINT', () => {
    clearInterval(statusInterval);
  });

  // ========== FUNCIONES PARA EMITIR EVENTOS DE REPORTES ==========

  /**
   * Emitir evento cuando se crea un boucher (afecta reportes de ventas)
   * @param {Object} boucher - Boucher creado
   */
  global.emitReporteBoucherNuevo = async (boucher) => {
    try {
      if (!adminNamespace || !adminNamespace.sockets) {
        return; // No hay clientes admin conectados
      }

      const timestamp = moment().tz('America/Lima').toISOString();
      const fechaPago = moment(boucher.fechaPago || new Date()).tz('America/Lima').format('YYYY-MM-DD');

      // Payload mínimo para reportes (optimizado)
      const eventData = {
        boucherId: boucher._id?.toString() || boucher._id,
        boucherNumber: boucher.boucherNumber,
        monto: boucher.total || 0,
        subtotal: boucher.subtotal || 0,
        igv: boucher.igv || 0,
        fecha: fechaPago,
        fechaPago: boucher.fechaPago,
        numMesa: boucher.numMesa || boucher.mesa?.nummesa,
        mozoId: boucher.mozo?._id?.toString() || boucher.mozo?.toString() || boucher.mozo,
        nombreMozo: boucher.nombreMozo || boucher.mozo?.name || 'Desconocido',
        cantidadPlatos: boucher.platos?.length || 0,
        platos: (boucher.platos || []).map(p => ({
          nombre: p.nombre || 'Plato desconocido',
          cantidad: p.cantidad || 0,
          precio: p.precio || 0,
          subtotal: p.subtotal || 0
        })),
        timestamp: timestamp
      };

      adminNamespace.emit('reportes:boucher-nuevo', eventData);

      logger.info('Evento reportes:boucher-nuevo emitido', {
        boucherNumber: boucher.boucherNumber,
        monto: eventData.monto,
        adminConnected: adminNamespace.sockets.size
      });
    } catch (error) {
      logger.error('Error al emitir reportes:boucher-nuevo', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento cuando se crea una comanda (afecta reportes de comandas)
   * @param {Object} comanda - Comanda creada
   */
  global.emitReporteComandaNueva = async (comanda) => {
    try {
      if (!adminNamespace || !adminNamespace.sockets) {
        return; // No hay clientes admin conectados
      }

      const timestamp = moment().tz('America/Lima').toISOString();
      const fechaCreacion = moment(comanda.createdAt || new Date()).tz('America/Lima').format('YYYY-MM-DD');

      // Payload mínimo para reportes
      const eventData = {
        comandaId: comanda._id?.toString() || comanda._id,
        comandaNumber: comanda.comandaNumber,
        fecha: fechaCreacion,
        fechaCreacion: comanda.createdAt,
        numMesa: comanda.mesas?.nummesa || comanda.mesas?.numMesa,
        mozoId: comanda.mozos?._id?.toString() || comanda.mozos?.toString() || comanda.mozos,
        nombreMozo: comanda.mozos?.name || 'Desconocido',
        cantidadPlatos: comanda.platos?.length || 0,
        platos: (comanda.platos || []).map(p => ({
          nombre: p.plato?.nombre || 'Plato desconocido',
          cantidad: p.cantidad || 1,
          estado: p.estado || 'pedido'
        })),
        timestamp: timestamp
      };

      adminNamespace.emit('reportes:comanda-nueva', eventData);

      logger.info('Evento reportes:comanda-nueva emitido', {
        comandaNumber: comanda.comandaNumber,
        cantidadPlatos: eventData.cantidadPlatos,
        adminConnected: adminNamespace.sockets.size
      });
    } catch (error) {
      logger.error('Error al emitir reportes:comanda-nueva', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento cuando un plato cambia a estado "listo" (entregado)
   * @param {String} comandaId - ID de la comanda
   * @param {String|Number} platoId - ID del plato
   * @param {String} nombrePlato - Nombre del plato
   * @param {Number} precio - Precio del plato
   */
  global.emitReportePlatoListo = async (comandaId, platoId, nombrePlato, precio) => {
    try {
      if (!adminNamespace || !adminNamespace.sockets) {
        return; // No hay clientes admin conectados
      }

      const timestamp = moment().tz('America/Lima').toISOString();

      const eventData = {
        comandaId: comandaId?.toString() || comandaId,
        platoId: platoId?.toString() || platoId,
        nombre: nombrePlato || 'Plato desconocido',
        precio: precio || 0,
        estado: 'entregado',
        timestamp: timestamp
      };

      adminNamespace.emit('reportes:plato-listo', eventData);

      logger.debug('Evento reportes:plato-listo emitido', {
        comandaId: eventData.comandaId,
        platoId: eventData.platoId,
        nombre: eventData.nombre,
        adminConnected: adminNamespace.sockets.size
      });
    } catch (error) {
      logger.error('Error al emitir reportes:plato-listo', {
        error: error.message,
        stack: error.stack
      });
    }
  };

  /**
   * Emitir evento de plato anulado por cocina
   * @param {String} comandaId - ID de la comanda
   * @param {Object} platoData - Datos del plato anulado
   */
  global.emitPlatoAnulado = async (comandaId, platoData) => {
    try {
      const comanda = await comandaModel
        .findById(comandaId)
        .populate('mozos')
        .populate({ path: 'mesas', populate: { path: 'area' } })
        .populate('cliente')
        .populate('platos.plato');

      if (!comanda) {
        logger.warn('Comanda no encontrada para emitir evento plato-anulado');
        return;
      }

      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomNameCocina = `fecha-${fecha}`;
      const mesaId = comanda.mesas?._id || comanda.mesas;
      const roomNameMesa = mesaId ? `mesa-${mesaId}` : null;
      const timestamp = moment().tz('America/Lima').toISOString();

      const platosActivos = comanda.platos.filter(p => !p.anulado && !p.eliminado);
      const platosAnulados = comanda.platos.filter(p => p.anulado);
      const platosEliminados = comanda.platos.filter(p => p.eliminado);

      const eventData = {
        comandaId: comandaId.toString(),
        comanda: comanda,
        platoAnulado: platoData,
        auditoria: {
          activos: platosActivos.length,
          anulados: platosAnulados.length,
          eliminados: platosEliminados.length
        },
        socketId: 'server',
        timestamp: timestamp
      };

      // Emitir a cocina (room por fecha)
      cocinaNamespace.to(roomNameCocina).emit('plato-anulado', eventData);
      logger.debug('Evento plato-anulado emitido a cocina', {
        comandaId: comandaId.toString(),
        roomNameCocina,
        platoNombre: platoData?.nombre
      });

      // Emitir a mozos de la mesa específica
      if (roomNameMesa && mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.to(roomNameMesa).emit('plato-anulado', eventData);
        logger.debug('Evento plato-anulado emitido a mozos', {
          comandaId: comandaId.toString(),
          roomNameMesa,
          platoNombre: platoData?.nombre
        });
      }

      logger.info('Evento plato-anulado emitido', {
        comandaNumber: comanda.comandaNumber,
        platoNombre: platoData?.nombre,
        motivo: platoData?.motivo,
        roomNameCocina,
        roomNameMesa: roomNameMesa || 'todos'
      });
    } catch (error) {
      logger.error('Error al emitir plato-anulado', {
        error: error.message,
        stack: error.stack,
        comandaId
      });
    }
  };

  /**
   * Emitir evento de comanda completamente anulada por cocina
   * @param {String} comandaId - ID de la comanda
   * @param {String} motivoGeneral - Motivo de la anulación
   */
  global.emitComandaAnulada = async (comandaId, motivoGeneral) => {
    try {
      const comanda = await comandaModel
        .findById(comandaId)
        .populate('mozos')
        .populate({ path: 'mesas', populate: { path: 'area' } })
        .populate('cliente')
        .populate('platos.plato');

      if (!comanda) {
        logger.warn('Comanda no encontrada para emitir evento comanda-anulada');
        return;
      }

      const fecha = moment(comanda.createdAt).tz("America/Lima").format('YYYY-MM-DD');
      const roomNameCocina = `fecha-${fecha}`;
      const mesaId = comanda.mesas?._id || comanda.mesas;
      const roomNameMesa = mesaId ? `mesa-${mesaId}` : null;
      const timestamp = moment().tz('America/Lima').toISOString();

      // Preparar lista de platos anulados para el evento
      const platosAnulados = comanda.platos
        .filter(p => p.anulado)
        .map((p, idx) => ({
          nombre: p.plato?.nombre || 'Plato desconocido',
          cantidad: comanda.cantidades?.[idx] || 1,
          motivo: p.anuladoRazon,
          estadoAlAnular: p.estadoAlAnular
        }));

      // Calcular total anulado
      const totalAnulado = comanda.platos
        .filter(p => p.anulado)
        .reduce((sum, p, idx) => {
          const precio = p.plato?.precio || 0;
          const cantidad = comanda.cantidades?.[idx] || 1;
          return sum + (precio * cantidad);
        }, 0);

      const eventData = {
        comandaId: comandaId.toString(),
        comanda: comanda,
        platosAnulados: platosAnulados,
        motivoGeneral: motivoGeneral,
        totalAnulado: totalAnulado,
        mesaId: mesaId,
        numMesa: comanda.mesas?.nummesa,
        comandaNumber: comanda.comandaNumber,
        socketId: 'server',
        timestamp: timestamp
      };

      // Emitir a cocina (room por fecha)
      cocinaNamespace.to(roomNameCocina).emit('comanda-anulada', eventData);
      logger.debug('Evento comanda-anulada emitido a cocina', {
        comandaId: comandaId.toString(),
        roomNameCocina,
        comandaNumber: comanda.comandaNumber
      });

      // Emitir a mozos de la mesa específica
      if (roomNameMesa && mozosNamespace && mozosNamespace.sockets) {
        mozosNamespace.to(roomNameMesa).emit('comanda-anulada', eventData);
        logger.debug('Evento comanda-anulada emitido a mozos', {
          comandaId: comandaId.toString(),
          roomNameMesa,
          comandaNumber: comanda.comandaNumber
        });
      }

      logger.info('Evento comanda-anulada emitido', {
        comandaNumber: comanda.comandaNumber,
        totalAnulado,
        cantidadPlatos: platosAnulados.length,
        motivoGeneral,
        roomNameCocina,
        roomNameMesa: roomNameMesa || 'todos'
      });
    } catch (error) {
      logger.error('Error al emitir comanda-anulada', {
        error: error.message,
        stack: error.stack,
        comandaId
      });
    }
  };

  logger.info('Eventos Socket.io configurados correctamente', {
    namespaces: ['/cocina', '/mozos', '/admin']
  });

  /**
   * Emitir evento de roles actualizados al namespace admin
   * @param {String} mozoId - ID del mozo actualizado
   * @param {String} tipo - Tipo de cambio: 'asignacion', 'actualizacion', 'reset'
   */
  global.emitRolesActualizados = async (mozoId, tipo = 'actualizacion') => {
    try {
      if (!adminNamespace || !adminNamespace.sockets) {
        return;
      }

      const timestamp = moment().tz('America/Lima').toISOString();

      const eventData = {
        mozoId: mozoId?.toString(),
        tipo: tipo,
        timestamp: timestamp
      };

      adminNamespace.emit('roles-actualizados', eventData);

      logger.info('Evento roles-actualizados emitido', {
        mozoId,
        tipo,
        adminConnected: adminNamespace.sockets.size
      });
    } catch (error) {
      logger.error('Error al emitir roles-actualizados', {
        error: error.message,
        stack: error.stack,
        mozoId
      });
    }
  };

  /**
   * Emitir evento de configuración de cocinero actualizada
   * Se emite cuando un admin cambia la configuración KDS de un cocinero
   * Si el cocinero está conectado, recibirá la actualización en tiempo real
   * 
   * TEMA 1: Ahora emite a la room específica del cocinero (cocinero-<id>)
   * para garantizar que solo el cocinero afectado reciba su configuración
   * 
   * @param {String} cocineroId - ID del usuario/cocinero
   * @param {Object} cambios - Campos actualizados
   */
  global.emitConfigCocineroActualizada = async (cocineroId, cambios = {}) => {
    try {
      const timestamp = moment().tz('America/Lima').toISOString();

      const eventData = {
        cocineroId: cocineroId?.toString(),
        cambios: cambios,
        timestamp: timestamp
      };

      // Emitir al namespace admin para que el dashboard se actualice
      if (adminNamespace && adminNamespace.sockets) {
        adminNamespace.emit('config-cocinero-actualizada', eventData);
        logger.debug('Evento config-cocinero-actualizada emitido a admin', {
          cocineroId,
          adminConnected: adminNamespace.sockets.size
        });
      }

      // TEMA 1: Emitir a la room específica del cocinero en el namespace cocina
      // Esto garantiza que solo el cocinero afectado reciba su configuración
      if (cocinaNamespace && cocinaNamespace.sockets && cocineroId) {
        const roomName = `cocinero-${cocineroId}`;
        const clientsInRoom = cocinaNamespace.adapter.rooms.get(roomName)?.size || 0;
        
        cocinaNamespace.to(roomName).emit('config-cocinero-actualizada', eventData);
        
        logger.info('Evento config-cocinero-actualizada emitido a room específica', {
          cocineroId,
          roomName,
          clientsInRoom,
          camposActualizados: Object.keys(cambios),
          timestamp
        });
      }
    } catch (error) {
      logger.error('Error al emitir config-cocinero-actualizada', {
        error: error.message,
        stack: error.stack,
        cocineroId
      });
    }
  };

  // ========== TEMA 4: EVENTOS DE PROCESAMIENTO CON IDENTIFICACIÓN DE COCINERO ==========

  /**
   * Emitir evento cuando un cocinero toma un plato
   * @param {String} comandaId - ID de la comanda
   * @param {String} platoId - ID del plato
   * @param {Object} cocinero - Info del cocinero { cocineroId, nombre, alias }
   */
  global.emitPlatoProcesando = async (comandaId, platoId, cocinero) => {
    try {
      const timestamp = moment().tz('America/Lima').toISOString();
      const fecha = moment().tz('America/Lima').format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      const eventData = {
        comandaId: comandaId?.toString(),
        platoId: platoId?.toString(),
        cocinero,
        timestamp
      };

      cocinaNamespace.to(roomName).emit('plato-procesando', eventData);

      logger.info('Evento plato-procesando emitido', {
        comandaId,
        platoId,
        cocineroId: cocinero?.cocineroId,
        roomName
      });
    } catch (error) {
      logger.error('Error al emitir plato-procesando', {
        error: error.message,
        comandaId,
        platoId
      });
    }
  };

  /**
   * Emitir evento cuando un cocinero libera un plato
   */
  global.emitPlatoLiberado = async (comandaId, platoId, cocineroId) => {
    try {
      const timestamp = moment().tz('America/Lima').toISOString();
      const fecha = moment().tz('America/Lima').format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      const eventData = {
        comandaId: comandaId?.toString(),
        platoId: platoId?.toString(),
        cocineroId: cocineroId?.toString(),
        timestamp
      };

      cocinaNamespace.to(roomName).emit('plato-liberado', eventData);

      logger.info('Evento plato-liberado emitido', { comandaId, platoId, cocineroId });
    } catch (error) {
      logger.error('Error al emitir plato-liberado', { error: error.message });
    }
  };

  /**
   * Emitir evento cuando un cocinero toma una comanda completa
   */
  global.emitComandaProcesando = async (comandaId, cocinero) => {
    try {
      const comanda = await comandaModel.findById(comandaId);
      if (!comanda) return;

      const timestamp = moment().tz('America/Lima').toISOString();
      const fecha = moment(comanda.createdAt).tz('America/Lima').format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      const eventData = {
        comandaId: comandaId?.toString(),
        comandaNumber: comanda.comandaNumber,
        cocinero,
        timestamp
      };

      cocinaNamespace.to(roomName).emit('comanda-procesando', eventData);

      logger.info('Evento comanda-procesando emitido', {
        comandaId,
        comandaNumber: comanda.comandaNumber,
        cocineroId: cocinero?.cocineroId
      });
    } catch (error) {
      logger.error('Error al emitir comanda-procesando', { error: error.message });
    }
  };

  /**
   * Emitir evento cuando un cocinero libera una comanda
   */
  global.emitComandaLiberada = async (comandaId, cocineroId) => {
    try {
      const comanda = await comandaModel.findById(comandaId);
      if (!comanda) return;

      const timestamp = moment().tz('America/Lima').toISOString();
      const fecha = moment(comanda.createdAt).tz('America/Lima').format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      const eventData = {
        comandaId: comandaId?.toString(),
        comandaNumber: comanda.comandaNumber,
        cocineroId: cocineroId?.toString(),
        timestamp
      };

      cocinaNamespace.to(roomName).emit('comanda-liberada', eventData);

      logger.info('Evento comanda-liberada emitido', { comandaId, cocineroId });
    } catch (error) {
      logger.error('Error al emitir comanda-liberada', { error: error.message });
    }
  };

  // ========== FUNCIONES HELPER PARA EMITIR A ZONAS (v7.1) ==========

  /**
   * Emitir evento de nueva comanda a una zona específica
   * @param {String} zonaId - ID de la zona
   * @param {Object} comanda - Comanda completa
   */
  global.emitNuevaComandaToZona = async (zonaId, comanda) => {
    try {
      if (!zonaId || !comanda) {
        logger.warn('emitNuevaComandaToZona: parámetros inválidos');
        return;
      }

      const timestamp = moment().tz('America/Lima').toISOString();
      const roomName = `zona-${zonaId}`;

      const eventData = {
        comanda,
        zonaId,
        socketId: 'server',
        timestamp
      };

      cocinaNamespace.to(roomName).emit('nueva-comanda-zona', eventData);

      const clientsInRoom = cocinaNamespace.adapter.rooms.get(roomName)?.size || 0;
      logger.info('Evento nueva-comanda-zona emitido', {
        zonaId,
        comandaNumber: comanda.comandaNumber,
        roomName,
        clientsInRoom
      });
    } catch (error) {
      logger.error('Error al emitir nueva-comanda-zona', { error: error.message });
    }
  };

  /**
   * Emitir evento de conflicto de procesamiento
   * Cuando un cocinero intenta tomar un plato que otro ya está procesando
   */
  global.emitConflictoProcesamiento = async (comandaId, platoId, cocineroActual, cocineroIntentando) => {
    try {
      const timestamp = moment().tz('America/Lima').toISOString();

      // Emitir al cocinero que intentó tomar el plato
      const roomName = `cocinero-${cocineroIntentando.cocineroId || cocineroIntentando}`;
      
      const eventData = {
        comandaId: comandaId?.toString(),
        platoId: platoId?.toString(),
        procesadoPor: cocineroActual,
        timestamp,
        mensaje: `Este plato ya está siendo procesado por ${cocineroActual.nombre || 'otro cocinero'}`
      };

      cocinaNamespace.to(roomName).emit('conflicto-procesamiento', eventData);

      logger.info('Evento conflicto-procesamiento emitido', {
        comandaId,
        platoId,
        cocineroActual: cocineroActual.cocineroId,
        cocineroIntentando: cocineroIntentando.cocineroId || cocineroIntentando
      });
    } catch (error) {
      logger.error('Error al emitir conflicto-procesamiento', { error: error.message });
    }
  };

  /**
   * Emitir evento de liberación automática por desconexión
   * Cuando un cocinero se desconecta, se liberan sus platos automáticamente
   */
  global.emitLiberacionAutomatica = async (cocineroId, platosLiberados) => {
    try {
      const timestamp = moment().tz('America/Lima').toISOString();
      const fecha = moment().tz('America/Lima').format('YYYY-MM-DD');
      const roomName = `fecha-${fecha}`;

      const eventData = {
        cocineroId: cocineroId?.toString(),
        platosLiberados: platosLiberados || [],
        timestamp,
        motivo: 'desconexión'
      };

      cocinaNamespace.to(roomName).emit('liberacion-automatica', eventData);

      logger.info('Evento liberacion-automatica emitido', {
        cocineroId,
        platosCount: platosLiberados?.length || 0
      });
    } catch (error) {
      logger.error('Error al emitir liberacion-automatica', { error: error.message });
    }
  };

  /**
   * Obtener zonas activas de un cocinero
   * Helper para el frontend
   */
  global.getZonasCocinero = async (cocineroId) => {
    try {
      const Mozos = require('../database/models/mozos.model');
      const Zona = require('../database/models/zona.model');

      const cocinero = await Mozos.findById(cocineroId).select('zonaIds').lean();
      
      if (!cocinero || !cocinero.zonaIds?.length) {
        return [];
      }

      const zonas = await Zona.find({
        _id: { $in: cocinero.zonaIds },
        activo: { $ne: false }
      }).select('nombre descripcion color icono').lean();

      return zonas;
    } catch (error) {
      logger.error('Error al obtener zonas del cocinero', { error: error.message });
      return [];
    }
  };
};

