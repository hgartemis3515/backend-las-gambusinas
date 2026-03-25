/**
 * REPORTES CONTROLLER
 * Endpoints para métricas y analítica del dashboard
 * Incluye: Ventas, Platos Top, Métricas de cocineros, series temporales, heatmaps
 */

const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { adminAuth } = require('../middleware/adminAuth');

const reportesRepository = require('../repository/reportes.repository');

// ============================================================
// VENTAS
// ============================================================

/**
 * GET /api/reportes/ventas
 * Obtiene ventas agrupadas por hora, día o semana
 * 
 * Query params:
 * - fechaInicio: YYYY-MM-DD (requerido)
 * - fechaFin: YYYY-MM-DD (requerido)
 * - agruparPor: 'hora' | 'dia' | 'semana' (default: 'dia')
 */
router.get('/reportes/ventas', adminAuth, async (req, res) => {
    try {
        const { fechaInicio, fechaFin, agruparPor = 'dia' } = req.query;

        // Validaciones
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                error: 'fechaInicio y fechaFin son requeridos'
            });
        }

        // Validar formato de fechas
        const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!fechaRegex.test(fechaInicio) || !fechaRegex.test(fechaFin)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }

        logger.info('[ReportesController] Obteniendo ventas', {
            fechaInicio,
            fechaFin,
            agruparPor,
            adminId: req.admin?.id
        });

        const resultado = await reportesRepository.getVentas(fechaInicio, fechaFin, agruparPor);

        res.json({
            success: true,
            datos: resultado.datos,
            resumen: resultado.resumen,
            meta: {
                fechaInicio,
                fechaFin,
                agruparPor,
                generadoEn: moment().tz('America/Lima').toISOString()
            }
        });

    } catch (error) {
        logger.error('[ReportesController] Error en GET /ventas', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener ventas'
        });
    }
});

// ============================================================
// PLATOS TOP
// ============================================================

/**
 * GET /api/reportes/platos-top
 * Obtiene los platos más vendidos en un rango de fechas
 * 
 * Query params:
 * - fechaInicio: YYYY-MM-DD (requerido)
 * - fechaFin: YYYY-MM-DD (requerido)
 */
router.get('/reportes/platos-top', adminAuth, async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;

        // Validaciones
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                error: 'fechaInicio y fechaFin son requeridos'
            });
        }

        // Validar formato de fechas
        const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!fechaRegex.test(fechaInicio) || !fechaRegex.test(fechaFin)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }

        logger.info('[ReportesController] Obteniendo platos top', {
            fechaInicio,
            fechaFin,
            adminId: req.admin?.id
        });

        const resultado = await reportesRepository.getPlatosTop(fechaInicio, fechaFin);

        res.json({
            success: true,
            datos: resultado.datos,
            resumen: resultado.resumen,
            meta: {
                fechaInicio,
                fechaFin,
                generadoEn: moment().tz('America/Lima').toISOString()
            }
        });

    } catch (error) {
        logger.error('[ReportesController] Error en GET /platos-top', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener platos top'
        });
    }
});

// ============================================================
// MÉTRICAS DE COCINEROS
// ============================================================

/**
 * GET /api/reportes/cocineros
 * Obtiene métricas agregadas de todos los cocineros en un rango de fechas
 * 
 * Query params:
 * - fechaInicio: YYYY-MM-DD (requerido)
 * - fechaFin: YYYY-MM-DD (requerido)
 * - agruparPor: 'dia' | 'semana' | 'hora' (default: 'dia')
 */
router.get('/reportes/cocineros', adminAuth, async (req, res) => {
    try {
        const { fechaInicio, fechaFin, agruparPor = 'dia' } = req.query;

        // Validaciones
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                error: 'fechaInicio y fechaFin son requeridos'
            });
        }

        // Validar formato de fechas
        const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!fechaRegex.test(fechaInicio) || !fechaRegex.test(fechaFin)) {
            return res.status(400).json({
                success: false,
                error: 'Formato de fecha inválido. Use YYYY-MM-DD'
            });
        }

        // Validar que fechaFin >= fechaInicio
        if (new Date(fechaFin) < new Date(fechaInicio)) {
            return res.status(400).json({
                success: false,
                error: 'fechaFin debe ser mayor o igual a fechaInicio'
            });
        }

        logger.info('[ReportesController] Obteniendo métricas de cocineros', {
            fechaInicio,
            fechaFin,
            agruparPor,
            adminId: req.admin?.id
        });

        // Obtener métricas en paralelo
        const [metricas, seriesTemporales, heatmap, distribucion] = await Promise.all([
            reportesRepository.getMetricasCocineros(fechaInicio, fechaFin),
            reportesRepository.getSerieTemporalCocineros(fechaInicio, fechaFin, agruparPor),
            reportesRepository.getHeatmapHorario(fechaInicio, fechaFin),
            reportesRepository.getDistribucionCategorias(fechaInicio, fechaFin)
        ]);

        res.json({
            success: true,
            data: {
                resumen: metricas.resumen,
                cocineros: metricas.cocineros,
                seriesTemporales,
                heatmap,
                distribucionCategorias: distribucion.general
            },
            meta: {
                fechaInicio,
                fechaFin,
                agruparPor,
                generadoEn: moment().tz('America/Lima').toISOString()
            }
        });

    } catch (error) {
        logger.error('[ReportesController] Error en GET /cocineros', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener métricas de cocineros'
        });
    }
});

/**
 * GET /api/reportes/cocineros/:cocineroId
 * Obtiene detalle de un cocinero específico
 */
router.get('/reportes/cocineros/:cocineroId', adminAuth, async (req, res) => {
    try {
        const { cocineroId } = req.params;
        const { fechaInicio, fechaFin } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                error: 'fechaInicio y fechaFin son requeridos'
            });
        }

        logger.info('[ReportesController] Obteniendo detalle de cocinero', {
            cocineroId,
            fechaInicio,
            fechaFin,
            adminId: req.admin?.id
        });

        const detalle = await reportesRepository.getDetalleCocinero(
            cocineroId,
            fechaInicio,
            fechaFin
        );

        res.json({
            success: true,
            data: detalle
        });

    } catch (error) {
        logger.error('[ReportesController] Error en GET /cocineros/:id', {
            error: error.message
        });

        if (error.message === 'Cocinero no encontrado') {
            return res.status(404).json({
                success: false,
                error: 'Cocinero no encontrado'
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener detalle del cocinero'
        });
    }
});

/**
 * GET /api/reportes/cocineros/series
 * Obtiene solo la serie temporal (para actualizaciones parciales)
 */
router.get('/reportes/cocineros/series', adminAuth, async (req, res) => {
    try {
        const { fechaInicio, fechaFin, agruparPor = 'dia' } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                error: 'fechaInicio y fechaFin son requeridos'
            });
        }

        const seriesTemporales = await reportesRepository.getSerieTemporalCocineros(
            fechaInicio,
            fechaFin,
            agruparPor
        );

        res.json({
            success: true,
            data: seriesTemporales
        });

    } catch (error) {
        logger.error('[ReportesController] Error en GET /cocineros/series', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener series temporales'
        });
    }
});

/**
 * GET /api/reportes/cocineros/heatmap
 * Obtiene solo el heatmap horario
 */
router.get('/reportes/cocineros/heatmap', adminAuth, async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                error: 'fechaInicio y fechaFin son requeridos'
            });
        }

        const heatmap = await reportesRepository.getHeatmapHorario(fechaInicio, fechaFin);

        res.json({
            success: true,
            data: heatmap
        });

    } catch (error) {
        logger.error('[ReportesController] Error en GET /cocineros/heatmap', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener heatmap'
        });
    }
});

/**
 * GET /api/reportes/cocineros/resumen
 * Obtiene solo el resumen de KPIs (endpoint ligero)
 */
router.get('/reportes/cocineros/resumen', adminAuth, async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                error: 'fechaInicio y fechaFin son requeridos'
            });
        }

        const metricas = await reportesRepository.getMetricasCocineros(fechaInicio, fechaFin);

        res.json({
            success: true,
            data: metricas.resumen
        });

    } catch (error) {
        logger.error('[ReportesController] Error en GET /cocineros/resumen', {
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: error.message || 'Error al obtener resumen'
        });
    }
});

module.exports = router;
