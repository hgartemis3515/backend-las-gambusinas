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
 * GET /api/configuracion/seo
 * Obtiene solo la configuración SEO del sistema
 */
router.get('/configuracion/seo', async (req, res) => {
    try {
        const config = await configuracionRepository.obtenerConfiguracion();
        
        const seoConfig = config.seo || {
            metaTitle: 'Las Gambusinas - Sistema POS',
            metaDescription: 'Sistema de punto de venta para gestión de restaurante.',
            canonicalUrl: '',
            ogTitle: '',
            ogDescription: '',
            ogImage: '',
            ogUrl: '',
            ogType: 'website',
            twitterCard: 'summary_large_image',
            twitterSite: '',
            twitterTitle: '',
            twitterDescription: '',
            twitterImage: ''
        };
        
        res.json({
            success: true,
            seo: seoConfig
        });
    } catch (error) {
        logger.error('Error al obtener configuración SEO:', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener la configuración SEO'
        });
    }
});

/**
 * PATCH /api/configuracion/seo
 * Actualiza solo la configuración SEO
 */
router.patch('/configuracion/seo', async (req, res) => {
    try {
        const seoData = req.body;
        const modificadoPor = req.user?._id || req.headers['x-user-id'] || null;
        
        // Construir objeto de actualización con notación de punto para campos anidados
        const updateData = {};
        const seoFields = [
            'metaTitle', 'metaDescription', 'canonicalUrl',
            'ogTitle', 'ogDescription', 'ogImage', 'ogUrl', 'ogType',
            'twitterCard', 'twitterSite', 'twitterTitle', 'twitterDescription', 'twitterImage'
        ];
        
        seoFields.forEach(field => {
            if (seoData[field] !== undefined) {
                updateData[`seo.${field}`] = seoData[field];
            }
        });
        
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron campos SEO para actualizar'
            });
        }
        
        const configuracionActualizada = await configuracionRepository.actualizarConfiguracion(
            updateData,
            modificadoPor
        );
        
        logger.info('Configuración SEO actualizada', {
            modificadoPor,
            camposActualizados: Object.keys(updateData)
        });
        
        res.json({
            success: true,
            message: 'Configuración SEO actualizada exitosamente',
            seo: configuracionActualizada.seo
        });
    } catch (error) {
        logger.error('Error al actualizar configuración SEO:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message || 'Error al actualizar la configuración SEO'
        });
    }
});

/**
 * GET /api/configuracion/voucher-plantilla
 * Obtiene la plantilla del voucher configurada
 */
router.get('/configuracion/voucher-plantilla', async (req, res) => {
    try {
        const config = await configuracionRepository.obtenerConfiguracion();
        
        // Plantilla por defecto
        const PLANTILLA_DEFAULT = {
            logo: '',
            restaurante: { 
                nombre: 'LAS GAMBUSINAS', 
                eslogan: '* Comidas Típicas y Parrilla *', 
                ruc: config.datosFiscales?.ruc || '20123456789', 
                direccion: config.datosFiscales?.direccionFiscal || 'Calle Principal 123, Lima', 
                telefono: config.datosFiscales?.telefono || '01-1234567' 
            },
            encabezado: { 
                tipoComprobante: 'BOLETA DE VENTA ELECTRONICA', 
                serie: config.numeracion?.serieBoleta || 'B001', 
                correlativo: ''
            },
            bloques: { 
                mostrarEncabezado: true, 
                mostrarDatosPedido: true, 
                mostrarDetalleProductos: true, 
                mostrarTotales: true, 
                mostrarDatosCliente: true, 
                mostrarAgradecimiento: true 
            },
            campos: { 
                mostrarIGV: config.tickets?.mostrarIGVDesglosado ?? true, 
                mostrarRC: false, 
                mostrarICBPER: false, 
                mostrarPropina: false, 
                mostrarBloquePromo: false, 
                mostrarQR: false 
            },
            promo: { 
                titulo: 'CALIFICA Y GANA', 
                mensaje: 'Escanéa el código QR y participa por grandes premios', 
                qrTamano: 70 
            },
            visibilidad: { 
                nombre: true, eslogan: true, ruc: true, direccion: true, telefono: true, 
                voucherId: true, numeroVoucher: true, fechaPedido: true, fechaPago: true, 
                tipo: true, local: true, caja: true, mesero: true, mesa: true, 
                observacion: true, cliente: true, dniCliente: true, totales: true 
            },
            espaciado: { lineHeight: 16, tamanoFuente: 11, espacioDivider: 8 },
            mensajes: { 
                agradecimiento: config.tickets?.mensajePie || 'Gracias por ser parte de Nuestra Familia', 
                urlConsulta: 'https://www.lasgambusinas.com/consulta' 
            },
            etiquetas: { 
                voucherId: 'Voucher ID', 
                numeroVoucher: 'Nro. Voucher', 
                fechaPedido: 'Fecha Pedido', 
                fechaPago: 'Fecha Pago', 
                mesero: 'Mesero', 
                mesa: 'Mesa', 
                total: 'TOTAL', 
                cliente: 'Cliente', 
                observaciones: 'Observaciones' 
            }
        };
        
        // Usar plantilla guardada o la por defecto
        const plantilla = config.voucherPlantilla || PLANTILLA_DEFAULT;
        
        // Si hay logoUrl en datos fiscales, usarlo
        if (config.datosFiscales?.logoUrl) {
            plantilla.logo = config.datosFiscales.logoUrl;
        }
        
        res.json({
            success: true,
            plantilla
        });
    } catch (error) {
        logger.error('Error al obtener plantilla de voucher:', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Error al obtener la plantilla del voucher'
        });
    }
});

/**
 * PUT /api/configuracion/voucher-plantilla
 * Guarda la plantilla del voucher
 */
router.put('/configuracion/voucher-plantilla', async (req, res) => {
    try {
        const nuevaPlantilla = req.body;
        const modificadoPor = req.user?._id || req.headers['x-user-id'] || null;
        
        if (!nuevaPlantilla || Object.keys(nuevaPlantilla).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionaron datos de plantilla'
            });
        }
        
        // Guardar la plantilla en la configuración
        const configuracionActualizada = await configuracionRepository.actualizarConfiguracion(
            { voucherPlantilla: nuevaPlantilla },
            modificadoPor
        );
        
        logger.info('Plantilla de voucher actualizada', { modificadoPor });
        
        res.json({
            success: true,
            message: 'Plantilla de voucher guardada exitosamente',
            plantilla: configuracionActualizada.voucherPlantilla
        });
    } catch (error) {
        logger.error('Error al guardar plantilla de voucher:', { error: error.message });
        res.status(500).json({
            success: false,
            message: error.message || 'Error al guardar la plantilla del voucher'
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
