/**
 * Controller de Configuración del Sistema - Las Gambusinas
 * 
 * Endpoints para gestionar la configuración del sistema
 */

const express = require('express');
const router = express.Router();

const configuracionRepository = require('../repository/configuracion.repository');
const logger = require('../utils/logger');

/**
 * GET /api/configuracion
 * Obtiene la configuración completa del sistema
 */
router.get('/configuracion', async (req, res) => {
    try {
        const configuracion = await configuracionRepository.obtenerConfiguracion();
        
        res.json({
            success: true,
            configuracion
        });
    } catch (error) {
        logger.error('Error al obtener configuración:', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener la configuración del sistema',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/configuracion/moneda
 * Obtiene solo la configuración de moneda y precios
 */
router.get('/configuracion/moneda', async (req, res) => {
    try {
        const configMoneda = await configuracionRepository.obtenerConfiguracionMoneda();
        
        res.json({
            success: true,
            configuracion: configMoneda
        });
    } catch (error) {
        logger.error('Error al obtener configuración de moneda:', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener la configuración de moneda'
        });
    }
});

/**
 * GET /api/configuracion/fiscales
 * Obtiene los datos fiscales del restaurante
 */
router.get('/configuracion/fiscales', async (req, res) => {
    try {
        const datosFiscales = await configuracionRepository.obtenerDatosFiscales();
        
        res.json({
            success: true,
            datosFiscales
        });
    } catch (error) {
        logger.error('Error al obtener datos fiscales:', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener los datos fiscales'
        });
    }
});

/**
 * GET /api/configuracion/metodos-pago
 * Obtiene los métodos de pago activos
 */
router.get('/configuracion/metodos-pago', async (req, res) => {
    try {
        const metodosPago = await configuracionRepository.obtenerMetodosPago();
        
        res.json({
            success: true,
            metodosPago
        });
    } catch (error) {
        logger.error('Error al obtener métodos de pago:', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener los métodos de pago'
        });
    }
});

/**
 * PUT /api/configuracion
 * Actualiza la configuración del sistema
 */
router.put('/configuracion', async (req, res) => {
    try {
        const nuevosDatos = req.body;
        
        // Obtener ID del usuario que modifica (si está autenticado)
        const modificadoPor = req.user?._id || req.headers['x-user-id'] || null;
        
        // Validar que hay datos para actualizar
        if (!nuevosDatos || Object.keys(nuevosDatos).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron datos para actualizar'
            });
        }
        
        // Actualizar configuración
        const configuracionActualizada = await configuracionRepository.actualizarConfiguracion(
            nuevosDatos,
            modificadoPor
        );
        
        logger.info('Configuración actualizada', {
            modificadoPor,
            camposActualizados: Object.keys(nuevosDatos)
        });
        
        res.json({
            success: true,
            message: 'Configuración actualizada exitosamente',
            configuracion: configuracionActualizada
        });
    } catch (error) {
        logger.error('Error al actualizar configuración:', { error: error.message });
        
        // Determinar código de estado según el tipo de error
        const statusCode = error.message.includes('debe') || 
                          error.message.includes('inválido') || 
                          error.message.includes('requerido') ? 400 : 500;
        
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error al actualizar la configuración'
        });
    }
});

/**
 * PATCH /api/configuracion/moneda
 * Actualiza solo la configuración de moneda y precios
 */
router.patch('/configuracion/moneda', async (req, res) => {
    try {
        const { moneda, simboloMoneda, decimales, igvPorcentaje, preciosIncluyenIGV, posicionSimbolo, politicaRedondeo, redondearA } = req.body;
        
        const datosMoneda = {};
        
        if (moneda !== undefined) datosMoneda.moneda = moneda;
        if (simboloMoneda !== undefined) datosMoneda.simboloMoneda = simboloMoneda;
        if (decimales !== undefined) datosMoneda.decimales = decimales;
        if (igvPorcentaje !== undefined) datosMoneda.igvPorcentaje = igvPorcentaje;
        if (preciosIncluyenIGV !== undefined) datosMoneda.preciosIncluyenIGV = preciosIncluyenIGV;
        if (posicionSimbolo !== undefined) datosMoneda.posicionSimbolo = posicionSimbolo;
        if (politicaRedondeo !== undefined) datosMoneda.politicaRedondeo = politicaRedondeo;
        if (redondearA !== undefined) datosMoneda.redondearA = redondearA;
        
        const modificadoPor = req.user?._id || req.headers['x-user-id'] || null;
        
        const configuracionActualizada = await configuracionRepository.actualizarConfiguracion(
            datosMoneda,
            modificadoPor
        );
        
        res.json({
            success: true,
            message: 'Configuración de moneda actualizada',
            configuracion: {
                moneda: configuracionActualizada.moneda,
                simboloMoneda: configuracionActualizada.simboloMoneda,
                decimales: configuracionActualizada.decimales,
                igvPorcentaje: configuracionActualizada.igvPorcentaje,
                preciosIncluyenIGV: configuracionActualizada.preciosIncluyenIGV,
                posicionSimbolo: configuracionActualizada.posicionSimbolo,
                politicaRedondeo: configuracionActualizada.politicaRedondeo,
                redondearA: configuracionActualizada.redondearA
            }
        });
    } catch (error) {
        logger.error('Error al actualizar configuración de moneda:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * PATCH /api/configuracion/fiscales
 * Actualiza los datos fiscales del restaurante
 */
router.patch('/configuracion/fiscales', async (req, res) => {
    try {
        const { nombreComercial, razonSocial, ruc, direccionFiscal, telefono, email, logoUrl } = req.body;
        
        const datosFiscales = {};
        if (nombreComercial !== undefined) datosFiscales['datosFiscales.nombreComercial'] = nombreComercial;
        if (razonSocial !== undefined) datosFiscales['datosFiscales.razonSocial'] = razonSocial;
        if (ruc !== undefined) datosFiscales['datosFiscales.ruc'] = ruc;
        if (direccionFiscal !== undefined) datosFiscales['datosFiscales.direccionFiscal'] = direccionFiscal;
        if (telefono !== undefined) datosFiscales['datosFiscales.telefono'] = telefono;
        if (email !== undefined) datosFiscales['datosFiscales.email'] = email;
        if (logoUrl !== undefined) datosFiscales['datosFiscales.logoUrl'] = logoUrl;
        
        const modificadoPor = req.user?._id || req.headers['x-user-id'] || null;
        
        const configuracionActualizada = await configuracionRepository.actualizarConfiguracion(
            datosFiscales,
            modificadoPor
        );
        
        res.json({
            success: true,
            message: 'Datos fiscales actualizados',
            datosFiscales: configuracionActualizada.datosFiscales
        });
    } catch (error) {
        logger.error('Error al actualizar datos fiscales:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * PATCH /api/configuracion/metodos-pago
 * Actualiza la configuración de métodos de pago
 */
router.patch('/configuracion/metodos-pago', async (req, res) => {
    try {
        const { efectivo, tarjeta, yape, plin, transferencia } = req.body;
        
        const metodosPagoData = {};
        
        if (efectivo !== undefined) {
            metodosPagoData['metodosPago.efectivo'] = efectivo;
        }
        if (tarjeta !== undefined) {
            metodosPagoData['metodosPago.tarjeta'] = tarjeta;
        }
        if (yape !== undefined) {
            metodosPagoData['metodosPago.yape'] = yape;
        }
        if (plin !== undefined) {
            metodosPagoData['metodosPago.plin'] = plin;
        }
        if (transferencia !== undefined) {
            metodosPagoData['metodosPago.transferencia'] = transferencia;
        }
        
        const modificadoPor = req.user?._id || req.headers['x-user-id'] || null;
        
        const configuracionActualizada = await configuracionRepository.actualizarConfiguracion(
            metodosPagoData,
            modificadoPor
        );
        
        res.json({
            success: true,
            message: 'Métodos de pago actualizados',
            metodosPago: configuracionActualizada.metodosPago
        });
    } catch (error) {
        logger.error('Error al actualizar métodos de pago:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/configuracion/calcular-totales
 * Endpoint para probar cálculos de totales
 * Útil para validar configuración antes de aplicar
 */
router.post('/configuracion/calcular-totales', async (req, res) => {
    try {
        const { subtotalPlatos, descuentoPorcentaje, propinaPorcentaje, sinCargoServicio } = req.body;
        
        if (typeof subtotalPlatos !== 'number' || subtotalPlatos < 0) {
            return res.status(400).json({
                success: false,
                message: 'subtotalPlatos debe ser un número positivo'
            });
        }
        
        const totales = await configuracionRepository.calcularTotalesBoucher(subtotalPlatos, {
            descuentoPorcentaje,
            propinaPorcentaje,
            sinCargoServicio
        });
        
        res.json({
            success: true,
            totales
        });
    } catch (error) {
        logger.error('Error al calcular totales:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/configuracion/formatear-monto
 * Formatea un monto según la configuración actual
 */
router.post('/configuracion/formatear-monto', async (req, res) => {
    try {
        const { monto } = req.body;
        
        if (typeof monto !== 'number') {
            return res.status(400).json({
                success: false,
                message: 'monto debe ser un número'
            });
        }
        
        const montoFormateado = await configuracionRepository.formatearMonto(monto);
        
        res.json({
            success: true,
            montoOriginal: monto,
            montoFormateado
        });
    } catch (error) {
        logger.error('Error al formatear monto:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/configuracion/invalidar-cache
 * Fuerza la recarga de configuración desde la base de datos
 */
router.post('/configuracion/invalidar-cache', async (req, res) => {
    try {
        await configuracionRepository.invalidarCache();
        
        res.json({
            success: true,
            message: 'Caché invalidado exitosamente'
        });
    } catch (error) {
        logger.error('Error al invalidar caché:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/configuracion/reset
 * Restaura la configuración a valores por defecto
 * Solo disponible en desarrollo
 */
router.post('/configuracion/reset', async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'Esta operación no está permitida en producción'
            });
        }
        
        const ConfiguracionSistema = require('../database/models/configuracionSistema.model');
        const { CONFIGURACION_DEFAULT } = ConfiguracionSistema;
        
        const configuracionRestaurada = await configuracionRepository.actualizarConfiguracion({
            ...CONFIGURACION_DEFAULT,
            horarios: {
                ...CONFIGURACION_DEFAULT.horarios,
                diasOperacion: CONFIGURACION_DEFAULT.horarios.diasOperacion
            }
        });
        
        res.json({
            success: true,
            message: 'Configuración restaurada a valores por defecto',
            configuracion: configuracionRestaurada
        });
    } catch (error) {
        logger.error('Error al restaurar configuración:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
