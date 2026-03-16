/**
 * COCINEROS CONTROLLER
 * Endpoints para gestión de cocineros y configuración KDS
 */

const express = require('express');
const router = express.Router();
const cocinerosRepository = require('../repository/cocineros.repository');
const { adminAuth, checkPermission, checkRole } = require('../middleware/adminAuth');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

/**
 * GET /api/cocineros
 * Listar todos los cocineros con su configuración
 * Requiere permiso: ver-mozos
 */
router.get('/cocineros', adminAuth, checkPermission('ver-mozos'), async (req, res) => {
    try {
        const { activo } = req.query;
        
        const filtros = {};
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }
        
        const cocineros = await cocinerosRepository.obtenerCocineros(filtros);
        
        res.json({
            success: true,
            data: cocineros,
            total: cocineros.length
        });
    } catch (error) {
        logger.error('Error al listar cocineros', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener lista de cocineros' 
        });
    }
});

/**
 * GET /api/cocineros/:id
 * Obtener un cocinero específico con su configuración
 */
router.get('/cocineros/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validar que el usuario tenga permiso de ver otros o sea el mismo usuario
        const esPropio = req.admin.id === id;
        if (!esPropio && !req.admin.permisos?.includes('ver-mozos')) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para ver este cocinero' 
            });
        }
        
        const cocinero = await cocinerosRepository.obtenerCocineroPorId(id);
        
        if (!cocinero) {
            return res.status(404).json({ 
                success: false, 
                error: 'Cocinero no encontrado' 
            });
        }
        
        res.json({
            success: true,
            data: cocinero
        });
    } catch (error) {
        logger.error('Error al obtener cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener cocinero' 
        });
    }
});

/**
 * GET /api/cocineros/:id/config
 * Obtener configuración KDS de un cocinero
 * El cocinero puede ver su propia configuración, admin/supervisor puede ver cualquiera
 */
router.get('/cocineros/:id/config', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validar permisos
        const esPropio = req.admin.id === id;
        const tienePermisoGestion = req.admin.permisos?.includes('ver-mozos');
        
        if (!esPropio && !tienePermisoGestion) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para ver esta configuración' 
            });
        }
        
        const config = await cocinerosRepository.obtenerConfigKDS(id);
        
        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        logger.error('Error al obtener configuración KDS', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener configuración KDS' 
        });
    }
});

/**
 * PUT /api/cocineros/:id/config
 * Actualizar configuración KDS de un cocinero
 * El cocinero puede editar su propia configuración, admin/supervisor puede editar cualquiera
 */
router.put('/cocineros/:id/config', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const datosConfig = req.body;
        
        // Validar permisos
        const esPropio = req.admin.id === id;
        const tienePermisoGestion = req.admin.permisos?.includes('editar-mozos');
        
        if (!esPropio && !tienePermisoGestion) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para modificar esta configuración' 
            });
        }
        
        // Sanitizar datos de entrada
        const datosSanitizados = {};
        
        if (datosConfig.aliasCocinero !== undefined) {
            datosSanitizados.aliasCocinero = datosConfig.aliasCocinero?.trim() || null;
        }
        
        if (datosConfig.filtrosPlatos) {
            datosSanitizados.filtrosPlatos = {
                modoInclusion: datosConfig.filtrosPlatos.modoInclusion ?? true,
                platosPermitidos: datosConfig.filtrosPlatos.platosPermitidos || [],
                categoriasPermitidas: datosConfig.filtrosPlatos.categoriasPermitidas || [],
                tiposPermitidos: datosConfig.filtrosPlatos.tiposPermitidos || []
            };
        }
        
        if (datosConfig.filtrosComandas) {
            datosSanitizados.filtrosComandas = {
                areasPermitidas: datosConfig.filtrosComandas.areasPermitidas || [],
                mesasEspecificas: datosConfig.filtrosComandas.mesasEspecificas || [],
                rangoHorario: datosConfig.filtrosComandas.rangoHorario || { inicio: null, fin: null },
                soloPrioritarias: datosConfig.filtrosComandas.soloPrioritarias || false
            };
        }
        
        if (datosConfig.configTableroKDS) {
            datosSanitizados.configTableroKDS = {
                tiempoAmarillo: datosConfig.configTableroKDS.tiempoAmarillo || 15,
                tiempoRojo: datosConfig.configTableroKDS.tiempoRojo || 20,
                maxTarjetasVisibles: datosConfig.configTableroKDS.maxTarjetasVisibles || 20,
                modoAltoVolumen: datosConfig.configTableroKDS.modoAltoVolumen || false,
                sonidoNotificacion: datosConfig.configTableroKDS.sonidoNotificacion ?? true,
                modoNocturno: datosConfig.configTableroKDS.modoNocturno ?? true,
                columnasGrid: datosConfig.configTableroKDS.columnasGrid || 5,
                filasGrid: datosConfig.configTableroKDS.filasGrid || 1,
                tamanioFuente: datosConfig.configTableroKDS.tamanioFuente || 15
            };
        }
        
        const configActualizada = await cocinerosRepository.actualizarConfigKDS(
            id, 
            datosSanitizados, 
            req.admin.id
        );
        
        // Emitir evento Socket.io para actualizar el KDS del cocinero en tiempo real
        if (global.emitConfigCocineroActualizada) {
            global.emitConfigCocineroActualizada(id, datosSanitizados);
        }
        
        logger.info('Configuración KDS actualizada', {
            cocineroId: id,
            actualizadoPor: req.admin.id,
            campos: Object.keys(datosSanitizados)
        });
        
        res.json({
            success: true,
            message: 'Configuración actualizada correctamente',
            data: configActualizada
        });
    } catch (error) {
        logger.error('Error al actualizar configuración KDS', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error al actualizar configuración KDS' 
        });
    }
});

/**
 * POST /api/cocineros/:id/asignar-rol
 * Asignar rol de cocinero a un usuario existente
 * Requiere permiso: gestionar-roles
 */
router.post('/cocineros/:id/asignar-rol', adminAuth, checkPermission('gestionar-roles'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const resultado = await cocinerosRepository.asignarRolCocinero(id, req.admin.id);
        
        logger.info('Rol de cocinero asignado', {
            usuarioId: id,
            asignadoPor: req.admin.id,
            yaEraCocinero: resultado.yaEraCocinero
        });
        
        res.json({
            success: true,
            message: resultado.yaEraCocinero 
                ? 'El usuario ya tiene rol de cocinero' 
                : 'Rol de cocinero asignado correctamente',
            data: resultado.usuario
        });
    } catch (error) {
        logger.error('Error al asignar rol de cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error al asignar rol de cocinero' 
        });
    }
});

/**
 * POST /api/cocineros/:id/quitar-rol
 * Quitar rol de cocinero a un usuario
 * Requiere permiso: gestionar-roles
 */
router.post('/cocineros/:id/quitar-rol', adminAuth, checkPermission('gestionar-roles'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nuevoRol = 'mozos' } = req.body;
        
        const resultado = await cocinerosRepository.quitarRolCocinero(id, nuevoRol, req.admin.id);
        
        logger.info('Rol de cocinero quitado', {
            usuarioId: id,
            quitadoPor: req.admin.id,
            nuevoRol
        });
        
        res.json({
            success: true,
            message: 'Rol de cocinero removido correctamente',
            data: resultado.usuario
        });
    } catch (error) {
        logger.error('Error al quitar rol de cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Error al quitar rol de cocinero' 
        });
    }
});

// ========== MÉTRICAS DE RENDIMIENTO ==========

/**
 * GET /api/cocineros/:id/metricas
 * Obtener métricas de rendimiento de un cocinero
 */
router.get('/cocineros/:id/metricas', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { desde, hasta } = req.query;
        
        // Validar permisos
        const esPropio = req.admin.id === id;
        const tienePermisoReportes = req.admin.permisos?.includes('ver-reportes');
        
        if (!esPropio && !tienePermisoReportes) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para ver estas métricas' 
            });
        }
        
        // Fechas por defecto: hoy
        const fechaInicio = desde 
            ? moment(desde).startOf('day').toDate()
            : moment().startOf('day').toDate();
        const fechaFin = hasta 
            ? moment(hasta).endOf('day').toDate()
            : moment().endOf('day').toDate();
        
        const [metricas, platosTop] = await Promise.all([
            cocinerosRepository.calcularMetricasRendimiento(id, fechaInicio, fechaFin),
            cocinerosRepository.obtenerPlatosTopPorCocinero(id, fechaInicio, fechaFin, 10)
        ]);
        
        res.json({
            success: true,
            data: {
                periodo: {
                    desde: fechaInicio,
                    hasta: fechaFin
                },
                metricas,
                platosTop
            }
        });
    } catch (error) {
        logger.error('Error al obtener métricas de cocinero', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener métricas de rendimiento' 
        });
    }
});

/**
 * GET /api/cocineros/metricas/todos
 * Obtener métricas de todos los cocineros (ranking)
 * Requiere permiso: ver-reportes
 */
router.get('/cocineros/metricas/todos', adminAuth, checkPermission('ver-reportes'), async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        
        // Fechas por defecto: hoy
        const fechaInicio = desde 
            ? moment(desde).startOf('day').toDate()
            : moment().startOf('day').toDate();
        const fechaFin = hasta 
            ? moment(hasta).endOf('day').toDate()
            : moment().endOf('day').toDate();
        
        const metricas = await cocinerosRepository.obtenerMetricasTodosCocineros(
            fechaInicio, 
            fechaFin
        );
        
        res.json({
            success: true,
            data: {
                periodo: {
                    desde: fechaInicio,
                    hasta: fechaFin
                },
                ranking: metricas
            }
        });
    } catch (error) {
        logger.error('Error al obtener métricas de todos los cocineros', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener métricas de cocineros' 
        });
    }
});

/**
 * POST /api/cocineros/:id/conexion
 * Registrar conexión de un cocinero (uso interno)
 */
router.post('/cocineros/:id/conexion', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Solo el propio usuario puede registrar su conexión
        if (req.admin.id !== id) {
            return res.status(403).json({ 
                success: false, 
                error: 'No autorizado' 
            });
        }
        
        await cocinerosRepository.registrarConexion(id);
        
        res.json({
            success: true,
            message: 'Conexión registrada'
        });
    } catch (error) {
        logger.error('Error al registrar conexión', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al registrar conexión' 
        });
    }
});

module.exports = router;
