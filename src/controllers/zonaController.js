/**
 * ZONA CONTROLLER
 * Endpoints para gestión de zonas de cocina
 */

const express = require('express');
const router = express.Router();
const zonaRepository = require('../repository/zona.repository');
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/**
 * GET /api/zonas
 * Listar todas las zonas
 */
router.get('/zonas', adminAuth, async (req, res) => {
    try {
        const { activo } = req.query;
        
        const filtros = {};
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }
        
        const zonas = await zonaRepository.obtenerZonas(filtros);
        
        res.json({
            success: true,
            data: zonas,
            total: zonas.length
        });
    } catch (error) {
        logger.error('Error al listar zonas', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener lista de zonas' 
        });
    }
});

/**
 * GET /api/zonas/activas
 * Listar zonas activas (para asignación)
 */
router.get('/zonas/activas', adminAuth, async (req, res) => {
    try {
        const zonas = await zonaRepository.obtenerZonasActivas();
        
        res.json({
            success: true,
            data: zonas
        });
    } catch (error) {
        logger.error('Error al listar zonas activas', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener zonas activas' 
        });
    }
});

/**
 * GET /api/zonas/:id
 * Obtener una zona específica
 */
router.get('/zonas/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const zona = await zonaRepository.obtenerZonaPorId(id);
        
        if (!zona) {
            return res.status(404).json({ 
                success: false, 
                error: 'Zona no encontrada' 
            });
        }
        
        res.json({
            success: true,
            data: zona
        });
    } catch (error) {
        logger.error('Error al obtener zona', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener zona' 
        });
    }
});

/**
 * GET /api/zonas/:id/cocineros
 * Obtener cocineros asignados a una zona
 */
router.get('/zonas/:id/cocineros', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const cocineros = await zonaRepository.obtenerCocinerosPorZona(id);
        
        res.json({
            success: true,
            data: cocineros,
            total: cocineros.length
        });
    } catch (error) {
        logger.error('Error al obtener cocineros de zona', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener cocineros asignados' 
        });
    }
});

/**
 * POST /api/zonas
 * Crear una nueva zona
 * Requiere permiso: editar-mozos (o gestionar-roles)
 */
router.post('/zonas', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const datosZona = req.body;
        
        // Validar campos requeridos
        if (!datosZona.nombre || !datosZona.nombre.trim()) {
            return res.status(400).json({
                success: false,
                error: 'El nombre de la zona es requerido'
            });
        }
        
        // Sanitizar datos
        const datosSanitizados = {
            nombre: datosZona.nombre.trim(),
            descripcion: datosZona.descripcion?.trim() || '',
            color: datosZona.color || '#d4af37',
            icono: datosZona.icono || '🍳',
            activo: datosZona.activo !== false,
            filtrosPlatos: {
                modoInclusion: datosZona.filtrosPlatos?.modoInclusion ?? true,
                platosPermitidos: datosZona.filtrosPlatos?.platosPermitidos || [],
                categoriasPermitidas: datosZona.filtrosPlatos?.categoriasPermitidas || [],
                tiposPermitidos: datosZona.filtrosPlatos?.tiposPermitidos || []
            },
            filtrosComandas: {
                areasPermitidas: datosZona.filtrosComandas?.areasPermitidas || [],
                mesasEspecificas: datosZona.filtrosComandas?.mesasEspecificas || [],
                rangoHorario: datosZona.filtrosComandas?.rangoHorario || { inicio: null, fin: null },
                soloPrioritarias: datosZona.filtrosComandas?.soloPrioritarias || false
            }
        };
        
        const zona = await zonaRepository.crearZona(datosSanitizados, req.admin.id);
        
        logger.info('Zona creada', {
            zonaId: zona._id,
            nombre: zona.nombre,
            creadoPor: req.admin.id
        });
        
        res.status(201).json({
            success: true,
            message: 'Zona creada correctamente',
            data: zona
        });
    } catch (error) {
        logger.error('Error al crear zona', { error: error.message });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al crear zona' 
        });
    }
});

/**
 * PUT /api/zonas/:id
 * Actualizar una zona existente
 * Requiere permiso: editar-mozos
 */
router.put('/zonas/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { id } = req.params;
        const datosZona = req.body;
        
        // Sanitizar datos
        const datosSanitizados = {};
        
        if (datosZona.nombre !== undefined) {
            datosSanitizados.nombre = datosZona.nombre.trim();
        }
        
        if (datosZona.descripcion !== undefined) {
            datosSanitizados.descripcion = datosZona.descripcion?.trim() || '';
        }
        
        if (datosZona.color !== undefined) {
            datosSanitizados.color = datosZona.color;
        }
        
        if (datosZona.icono !== undefined) {
            datosSanitizados.icono = datosZona.icono;
        }
        
        if (datosZona.activo !== undefined) {
            datosSanitizados.activo = datosZona.activo;
        }
        
        if (datosZona.filtrosPlatos !== undefined) {
            datosSanitizados.filtrosPlatos = {
                modoInclusion: datosZona.filtrosPlatos?.modoInclusion ?? true,
                platosPermitidos: datosZona.filtrosPlatos?.platosPermitidos || [],
                categoriasPermitidas: datosZona.filtrosPlatos?.categoriasPermitidas || [],
                tiposPermitidos: datosZona.filtrosPlatos?.tiposPermitidos || []
            };
        }
        
        if (datosZona.filtrosComandas !== undefined) {
            datosSanitizados.filtrosComandas = {
                areasPermitidas: datosZona.filtrosComandas?.areasPermitidas || [],
                mesasEspecificas: datosZona.filtrosComandas?.mesasEspecificas || [],
                rangoHorario: datosZona.filtrosComandas?.rangoHorario || { inicio: null, fin: null },
                soloPrioritarias: datosZona.filtrosComandas?.soloPrioritarias || false
            };
        }
        
        const zona = await zonaRepository.actualizarZona(id, datosSanitizados, req.admin.id);
        
        logger.info('Zona actualizada', {
            zonaId: id,
            actualizadoPor: req.admin.id,
            campos: Object.keys(datosSanitizados)
        });
        
        res.json({
            success: true,
            message: 'Zona actualizada correctamente',
            data: zona
        });
    } catch (error) {
        logger.error('Error al actualizar zona', { error: error.message });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al actualizar zona' 
        });
    }
});

/**
 * DELETE /api/zonas/:id
 * Eliminar una zona (soft delete)
 * Requiere permiso: editar-mozos
 */
router.delete('/zonas/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const zona = await zonaRepository.eliminarZona(id, req.admin.id);
        
        logger.info('Zona eliminada (desactivada)', {
            zonaId: id,
            eliminadoPor: req.admin.id
        });
        
        res.json({
            success: true,
            message: 'Zona eliminada correctamente',
            data: zona
        });
    } catch (error) {
        logger.error('Error al eliminar zona', { error: error.message });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al eliminar zona' 
        });
    }
});

/**
 * PATCH /api/zonas/:id/reactivar
 * Reactivar una zona eliminada
 * Requiere permiso: editar-mozos
 */
router.patch('/zonas/:id/reactivar', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const zona = await zonaRepository.reactivarZona(id, req.admin.id);
        
        logger.info('Zona reactivada', {
            zonaId: id,
            reactivadoPor: req.admin.id
        });
        
        res.json({
            success: true,
            message: 'Zona reactivada correctamente',
            data: zona
        });
    } catch (error) {
        logger.error('Error al reactivar zona', { error: error.message });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al reactivar zona' 
        });
    }
});

module.exports = router;
