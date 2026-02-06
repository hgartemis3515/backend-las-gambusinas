/**
 * Utilidad para manejo estructurado de errores
 * Formato estándar: { error: "mensaje", code: 500, data: [] }
 */

class AppError extends Error {
  constructor(message, statusCode = 500, data = null) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Crea una respuesta de error estructurada
 * @param {string} message - Mensaje de error
 * @param {number} code - Código HTTP
 * @param {any} data - Datos adicionales (opcional)
 * @returns {Object} Objeto de error estructurado
 */
const createErrorResponse = (message, code = 500, data = null) => {
  return {
    error: message,
    code: code,
    data: data !== null ? data : []
  };
};

/**
 * Maneja errores y retorna respuesta estructurada
 * @param {Error} error - Error capturado
 * @param {Object} res - Objeto response de Express
 * @param {Object} logger - Logger de Winston (opcional)
 */
const handleError = (error, res, logger = null) => {
  const statusCode = error.statusCode || error.code || 500;
  const message = error.message || 'Error interno del servidor';
  const data = error.data || null;

  // Log del error si hay logger disponible
  if (logger) {
    if (statusCode >= 500) {
      logger.error('Error del servidor', {
        message: error.message,
        stack: error.stack,
        statusCode,
        data
      });
    } else {
      logger.warn('Error del cliente', {
        message: error.message,
        statusCode,
        data
      });
    }
  }

  // Si el error ya tiene formato estructurado, usarlo
  if (error.isOperational && error.data !== undefined) {
    return res.status(statusCode).json(createErrorResponse(message, statusCode, error.data));
  }

  // Crear respuesta estructurada
  return res.status(statusCode).json(createErrorResponse(message, statusCode, data));
};

/**
 * Wrapper para async functions que maneja errores automáticamente
 * @param {Function} fn - Función async
 * @returns {Function} Función envuelta con manejo de errores
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      handleError(error, res, req.logger || null);
    });
  };
};

module.exports = {
  AppError,
  createErrorResponse,
  handleError,
  asyncHandler
};

