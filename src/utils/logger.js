/**
 * FASE 7: Winston Logger Enterprise Grade
 * Inspiración: Splunk/Datadog Structured Logging
 * Features: Daily rotation, Sentry integration, Correlation IDs, Sensitive data masking
 */

const winston = require('winston');
const path = require('path');
require('winston-daily-rotate-file');

// ============================================
// Correlation ID Generator (Request Tracing)
// ============================================
const generateCorrelationId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================
// Sensitive Data Masking
// ============================================
const maskSensitiveData = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['password', 'token', 'jwt', 'secret', 'dni', 'creditCard', 'cvv'];
  const masked = { ...obj };
  
  for (const key in masked) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  
  return masked;
};

// ============================================
// Structured Log Format (JSON)
// ============================================
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS Z' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format((info) => {
    // Agregar correlation ID si existe en contexto
    if (info.correlationId) {
      info.traceId = info.correlationId;
    }
    
    // Mask sensitive data
    if (info.metadata) {
      info.metadata = maskSensitiveData(info.metadata);
    }
    
    return info;
  })(),
  winston.format.json()
);

// ============================================
// Console Format (Human-readable)
// ============================================
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, traceId, ...meta }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]`;
    if (traceId) msg += ` [${traceId}]`;
    msg += `: ${message}`;
    
    if (meta.stack) {
      msg += `\n${meta.stack}`;
    } else if (Object.keys(meta).length > 0) {
      const cleanMeta = maskSensitiveData(meta);
      msg += ` ${JSON.stringify(cleanMeta)}`;
    }
    
    return msg;
  })
);

// ============================================
// Logger Configuration
// ============================================
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: { 
    service: 'las-gambusinas-backend',
    version: process.env.APP_VERSION || '1.0.0-fase7',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Daily rotate file: combined.log (todos los logs)
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d', // Retener 30 días
      zippedArchive: true, // Comprimir archivos antiguos
      format: logFormat
    }),
    
    // Daily rotate file: error.log (solo errores)
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '90d', // Retener 90 días errores
      zippedArchive: true,
      format: logFormat
    }),
  ],
  // Manejo de excepciones no capturadas
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      zippedArchive: true
    })
  ],
  // Manejo de promise rejections
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',
      zippedArchive: true
    })
  ]
});

// ============================================
// Console Transport (Development)
// ============================================
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
} else {
  // En producción, solo errores en consola
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'error'
  }));
}

// ============================================
// Sentry Integration (Opcional - requiere @sentry/node)
// ============================================
if (process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
  try {
    const Sentry = require('@sentry/node');
    
    // Custom Sentry Transport para Winston
    class SentryTransport extends winston.transports.Stream {
      constructor(options) {
        super(options);
        this.sentry = options.sentry;
      }
      
      log(info, callback) {
        if (info.level === 'error') {
          const error = info.error || new Error(info.message);
          this.sentry.captureException(error, {
            level: 'error',
            tags: {
              service: info.service,
              environment: info.environment
            },
            extra: info.metadata || {}
          });
        }
        callback();
      }
    }
    
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1 // 10% de traces para performance
    });
    
    logger.add(new SentryTransport({
      sentry: Sentry,
      level: 'error',
      handleExceptions: true,
      handleRejections: true
    }));
    
    logger.info('Sentry error tracking enabled');
  } catch (error) {
    logger.warn('Sentry not available, skipping integration', { error: error.message });
  }
}

// ============================================
// Helper Methods con Correlation ID
// ============================================
const originalInfo = logger.info.bind(logger);
const originalError = logger.error.bind(logger);
const originalWarn = logger.warn.bind(logger);
const originalDebug = logger.debug.bind(logger);

logger.info = (message, metadata) => {
  const correlationId = global.currentRequestId || generateCorrelationId();
  return originalInfo(message, { ...metadata, correlationId });
};

logger.error = (message, metadata) => {
  const correlationId = global.currentRequestId || generateCorrelationId();
  return originalError(message, { ...metadata, correlationId });
};

logger.warn = (message, metadata) => {
  const correlationId = global.currentRequestId || generateCorrelationId();
  return originalWarn(message, { ...metadata, correlationId });
};

logger.debug = (message, metadata) => {
  const correlationId = global.currentRequestId || generateCorrelationId();
  return originalDebug(message, { ...metadata, correlationId });
};

// ============================================
// Middleware para Correlation ID (Express)
// ============================================
logger.correlationMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
  global.currentRequestId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
};

module.exports = logger;

