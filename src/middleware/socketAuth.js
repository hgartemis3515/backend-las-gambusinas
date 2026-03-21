/**
 * Middleware de Autenticación JWT para Socket.io
 * 
 * Valida tokens JWT en la conexión de sockets para garantizar
 * que solo usuarios autenticados puedan conectarse a los namespaces.
 * 
 * @version 7.1
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Configuración
const JWT_SECRET = process.env.JWT_SECRET || 'las-gambusinas-admin-secret-key-2024';
const JWT_EXPIRY_MARGIN_MS = 5 * 60 * 1000; // 5 minutos antes de expirar

/**
 * Decodifica y valida un token JWT
 * @param {string} token - Token JWT a validar
 * @returns {Object|null} Payload decodificado o null si es inválido
 */
const decodeAndVerifyToken = (token) => {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('Token JWT expirado', { expiredAt: error.expiredAt });
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Token JWT inválido', { message: error.message });
    } else {
      logger.error('Error validando token JWT', { error: error.message });
    }
    return null;
  }
};

/**
 * Verifica si un token está próximo a expirar
 * @param {Object} payload - Payload del JWT
 * @returns {boolean} true si expira en menos de 5 minutos
 */
const isTokenExpiringSoon = (payload) => {
  if (!payload || !payload.exp) return true;
  
  const expiresAt = payload.exp * 1000; // Convertir a ms
  const now = Date.now();
  
  return (expiresAt - now) < JWT_EXPIRY_MARGIN_MS;
};

/**
 * Middleware de autenticación para namespace /cocina
 * Valida que el usuario tenga rol de cocinero o admin
 */
const authenticateCocina = (socket, next) => {
  try {
    // El token puede venir en:
    // 1. auth.token (recomendado)
    // 2. handshake.auth.token
    // 3. handshake.headers.authorization (Bearer token)
    
    let token = null;
    
    // Opción 1: auth.token
    if (socket.handshake?.auth?.token) {
      token = socket.handshake.auth.token;
    }
    // Opción 2: Authorization header
    else if (socket.handshake?.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      logger.warn('Intento de conexión a /cocina sin token', {
        socketId: socket.id,
        ip: socket.handshake?.address
      });
      
      return next(new Error('Autenticación requerida. Proporcione un token válido.'));
    }
    
    // Verificar token
    const payload = decodeAndVerifyToken(token);
    
    if (!payload) {
      return next(new Error('Token inválido o expirado.'));
    }
    
    // Verificar que el usuario tenga rol permitido
    const rol = payload.rol || payload.role;
    const rolesPermitidos = ['cocinero', 'admin', 'supervisor'];
    
    if (!rolesPermitidos.includes(rol)) {
      logger.warn('Intento de conexión a /cocina con rol no autorizado', {
        socketId: socket.id,
        userId: payload.id || payload._id,
        rol: rol
      });
      
      return next(new Error('No tiene permisos para acceder a la cocina.'));
    }
    
    // Verificar si el token expira pronto
    if (isTokenExpiringSoon(payload)) {
      logger.warn('Token próximo a expirar', {
        socketId: socket.id,
        userId: payload.id || payload._id
      });
      
      // Enviar advertencia al cliente (no bloquea la conexión)
      socket.emit('token-expiring-soon', {
        message: 'Su sesión expirará pronto. Considere renovar el token.'
      });
    }
    
    // Adjuntar información del usuario al socket
    socket.user = {
      id: payload.id || payload._id || payload.userId,
      name: payload.name || payload.nombre || 'Usuario',
      rol: rol,
      permisos: payload.permisos || [],
      aliasCocinero: payload.aliasCocinero || payload.name
    };
    
    // También guardar el token para posible renovación
    socket.authToken = token;
    
    logger.info('Socket /cocina autenticado correctamente', {
      socketId: socket.id,
      userId: socket.user.id,
      userName: socket.user.name,
      rol: socket.user.rol
    });
    
    next();
    
  } catch (error) {
    logger.error('Error en middleware de autenticación /cocina', {
      error: error.message,
      socketId: socket.id
    });
    
    next(new Error('Error de autenticación.'));
  }
};

/**
 * Middleware de autenticación para namespace /mozos
 */
const authenticateMozos = (socket, next) => {
  try {
    let token = null;
    
    if (socket.handshake?.auth?.token) {
      token = socket.handshake.auth.token;
    } else if (socket.handshake?.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      logger.warn('Intento de conexión a /mozos sin token', {
        socketId: socket.id,
        ip: socket.handshake?.address
      });
      
      return next(new Error('Autenticación requerida.'));
    }
    
    const payload = decodeAndVerifyToken(token);
    
    if (!payload) {
      return next(new Error('Token inválido o expirado.'));
    }
    
    // Roles permitidos para app de mozos
    const rol = payload.rol || payload.role;
    const rolesPermitidos = ['mozos', 'admin', 'supervisor'];
    
    if (!rolesPermitidos.includes(rol)) {
      return next(new Error('No tiene permisos para acceder.'));
    }
    
    socket.user = {
      id: payload.id || payload._id || payload.userId,
      name: payload.name || payload.nombre || 'Usuario',
      rol: rol,
      permisos: payload.permisos || []
    };
    
    socket.authToken = token;
    
    logger.info('Socket /mozos autenticado correctamente', {
      socketId: socket.id,
      userId: socket.user.id,
      rol: socket.user.rol
    });
    
    next();
    
  } catch (error) {
    logger.error('Error en middleware de autenticación /mozos', {
      error: error.message
    });
    
    next(new Error('Error de autenticación.'));
  }
};

/**
 * Middleware de autenticación para namespace /admin
 */
const authenticateAdmin = (socket, next) => {
  try {
    let token = null;
    
    if (socket.handshake?.auth?.token) {
      token = socket.handshake.auth.token;
    } else if (socket.handshake?.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      return next(new Error('Autenticación requerida.'));
    }
    
    const payload = decodeAndVerifyToken(token);
    
    if (!payload) {
      return next(new Error('Token inválido o expirado.'));
    }
    
    const rol = payload.rol || payload.role;
    const rolesPermitidos = ['admin', 'supervisor'];
    
    if (!rolesPermitidos.includes(rol)) {
      logger.warn('Intento de conexión a /admin con rol no autorizado', {
        socketId: socket.id,
        rol: rol
      });
      
      return next(new Error('No tiene permisos de administrador.'));
    }
    
    socket.user = {
      id: payload.id || payload._id || payload.userId,
      name: payload.name || payload.nombre || 'Usuario',
      rol: rol,
      permisos: payload.permisos || []
    };
    
    socket.authToken = token;
    
    logger.info('Socket /admin autenticado correctamente', {
      socketId: socket.id,
      userId: socket.user.id,
      rol: socket.user.rol
    });
    
    next();
    
  } catch (error) {
    next(new Error('Error de autenticación.'));
  }
};

/**
 * Función helper para emitir a un usuario específico por su ID
 * @param {Namespace} namespace - Namespace de Socket.io
 * @param {string} userId - ID del usuario
 * @param {string} eventName - Nombre del evento
 * @param {Object} data - Datos a emitir
 */
const emitToUser = (namespace, userId, eventName, data) => {
  const roomName = `user-${userId}`;
  namespace.to(roomName).emit(eventName, data);
  
  logger.debug('Evento emitido a usuario específico', {
    userId,
    roomName,
    eventName
  });
};

/**
 * Función helper para emitir a una zona específica
 * @param {Namespace} namespace - Namespace de Socket.io
 * @param {string} zonaId - ID de la zona
 * @param {string} eventName - Nombre del evento
 * @param {Object} data - Datos a emitir
 */
const emitToZona = (namespace, zonaId, eventName, data) => {
  const roomName = `zona-${zonaId}`;
  namespace.to(roomName).emit(eventName, data);
  
  logger.debug('Evento emitido a zona específica', {
    zonaId,
    roomName,
    eventName
  });
};

/**
 * Middleware para rate limiting de eventos Socket.io
 * Previene spam de eventos
 */
const rateLimiter = (maxEventsPerSecond = 10) => {
  const eventCounts = new Map();
  
  return (socket, next) => {
    // Inicializar contador para este socket
    eventCounts.set(socket.id, { count: 0, lastReset: Date.now() });
    
    // Limpiar al desconectar
    socket.on('disconnect', () => {
      eventCounts.delete(socket.id);
    });
    
    // Interceptar eventos
    const originalEmit = socket.emit;
    socket.emit = function(...args) {
      const stats = eventCounts.get(socket.id);
      if (!stats) return originalEmit.apply(this, args);
      
      const now = Date.now();
      
      // Reset cada segundo
      if (now - stats.lastReset > 1000) {
        stats.count = 0;
        stats.lastReset = now;
      }
      
      stats.count++;
      
      if (stats.count > maxEventsPerSecond) {
        logger.warn('Rate limit excedido para socket', {
          socketId: socket.id,
          eventCount: stats.count,
          maxAllowed: maxEventsPerSecond
        });
        return; // Ignorar el evento
      }
      
      return originalEmit.apply(this, args);
    };
    
    next();
  };
};

module.exports = {
  authenticateCocina,
  authenticateMozos,
  authenticateAdmin,
  decodeAndVerifyToken,
  emitToUser,
  emitToZona,
  rateLimiter
};
