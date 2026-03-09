/**
 * Middleware de Configuración del Sistema - Las Gambusinas
 * 
 * Adjunta la configuración del sistema a req.configuracion
 * Utiliza caché para optimizar rendimiento
 */

const configuracionRepository = require('../repository/configuracion.repository');
const logger = require('../utils/logger');

/**
 * Middleware que adjunta la configuración a la request
 * Útil para rutas que necesitan acceso rápido a la configuración
 */
const configuracionMiddleware = async (req, res, next) => {
    try {
        // Obtener configuración (usa caché internamente)
        req.configuracion = await configuracionRepository.obtenerConfiguracion();
        next();
    } catch (error) {
        logger.error('Error en middleware de configuración:', { error: error.message });
        // No bloquear la request, pero loggear el error
        req.configuracion = null;
        next();
    }
};

/**
 * Middleware específico para rutas que calculan precios
 * Optimizado para obtener solo la configuración de moneda
 */
const configuracionPreciosMiddleware = async (req, res, next) => {
    try {
        req.configMoneda = await configuracionRepository.obtenerConfiguracionMoneda();
        next();
    } catch (error) {
        logger.error('Error en middleware de configuración de precios:', { error: error.message });
        // Usar valores por defecto si falla
        req.configMoneda = {
            moneda: 'PEN',
            simboloMoneda: 'S/.',
            decimales: 2,
            posicionSimbolo: 'antes',
            igvPorcentaje: 18,
            preciosIncluyenIGV: false,
            nombreImpuestoPrincipal: 'IGV',
            politicaRedondeo: 'total',
            redondearA: 0.01,
            formatoSeparadores: { separadorMiles: ',', separadorDecimales: '.' }
        };
        next();
    }
};

/**
 * Middleware específico para rutas que generan comprobantes
 * Optimizado para obtener datos fiscales
 */
const datosFiscalesMiddleware = async (req, res, next) => {
    try {
        req.datosFiscales = await configuracionRepository.obtenerDatosFiscales();
        next();
    } catch (error) {
        logger.error('Error en middleware de datos fiscales:', { error: error.message });
        req.datosFiscales = null;
        next();
    }
};

/**
 * Middleware para validar que la configuración esté disponible
 * Útil para rutas críticas que NO pueden funcionar sin configuración
 */
const requiereConfiguracionMiddleware = async (req, res, next) => {
    try {
        const config = await configuracionRepository.obtenerConfiguracion();
        
        if (!config) {
            return res.status(503).json({
                success: false,
                message: 'La configuración del sistema no está disponible'
            });
        }
        
        req.configuracion = config;
        next();
    } catch (error) {
        logger.error('Error al obtener configuración requerida:', { error: error.message });
        return res.status(503).json({
            success: false,
            message: 'Error al acceder a la configuración del sistema'
        });
    }
};

/**
 * Helper para adjuntar configuración a responses
 * Usar en combinación con res.locals para pasar configuración a vistas
 */
const attachConfigToLocals = async (req, res, next) => {
    try {
        res.locals.config = await configuracionRepository.obtenerConfiguracion();
        next();
    } catch (error) {
        logger.error('Error al adjuntar configuración a locals:', { error: error.message });
        res.locals.config = null;
        next();
    }
};

/**
 * Función helper para calcular IGV y totales
 * Disponible globalmente para usar en cualquier lugar del código
 */
const calcularTotalesConConfig = async (subtotalPlatos, opciones = {}) => {
    return await configuracionRepository.calcularTotalesBoucher(subtotalPlatos, opciones);
};

/**
 * Función helper para formatear montos
 * Disponible globalmente para usar en cualquier lugar del código
 */
const formatearMontoConConfig = async (monto) => {
    return await configuracionRepository.formatearMonto(monto);
};

// Exportar como funciones individuales y como objeto
module.exports = {
    configuracionMiddleware,
    configuracionPreciosMiddleware,
    datosFiscalesMiddleware,
    requiereConfiguracionMiddleware,
    attachConfigToLocals,
    calcularTotalesConConfig,
    formatearMontoConConfig
};

// También exportar el middleware por defecto
module.exports.default = configuracionMiddleware;
