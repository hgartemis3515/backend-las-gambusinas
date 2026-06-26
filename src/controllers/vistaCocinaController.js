/**
 * VISTA COCINA CONTROLLER
 * Endpoints para gestion de Vistas de Cocina (presets de platos + apariencia TV)
 * y Pantallas de Cocina (mapeo TV fisica -> vista).
 */

const express = require('express');
const router = express.Router();
const repo = require('../repository/vistaCocina.repository');
const { adminAuth, checkPermission, requireAnyPermission } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/* ====================== VISTAS DE COCINA ====================== */

/**
 * GET /api/vistas-cocina
 * Listar vistas (opcionalmente solo activas)
 */
router.get('/vistas-cocina', adminAuth, async (req, res) => {
    try {
        const { activo } = req.query;
        const filtros = {};
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }
        const vistas = await repo.obtenerVistasCocina(filtros);
        res.json({ success: true, data: vistas, total: vistas.length });
    } catch (error) {
        logger.error('Error al listar vistas de cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener vistas de cocina' });
    }
});

/**
 * GET /api/vistas-cocina/activas
 * Listar vistas activas (selector en app cocina)
 */
router.get('/vistas-cocina/activas', adminAuth, async (req, res) => {
    try {
        const vistas = await repo.obtenerVistasCocinaActivas();
        res.json({ success: true, data: vistas });
    } catch (error) {
        logger.error('Error al listar vistas activas', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener vistas activas' });
    }
});

/**
 * GET /api/vistas-cocina/:id
 */
router.get('/vistas-cocina/:id', adminAuth, async (req, res) => {
    try {
        const vista = await repo.obtenerVistaCocinaPorId(req.params.id);
        if (!vista) {
            return res.status(404).json({ success: false, error: 'Vista de cocina no encontrada' });
        }
        res.json({ success: true, data: vista });
    } catch (error) {
        logger.error('Error al obtener vista de cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener vista' });
    }
});

/**
 * POST /api/vistas-cocina
 */
router.post('/vistas-cocina', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const datos = req.body;
        if (!datos.nombre || !datos.nombre.trim()) {
            return res.status(400).json({ success: false, error: 'El nombre es requerido' });
        }

        const sanitizados = {
            nombre: datos.nombre.trim(),
            descripcion: datos.descripcion?.trim() || '',
            color: datos.color || '#d4af37',
            icono: datos.icono || 'tools-kitchen',
            activo: datos.activo !== false,
            filtrosPlatos: {
                modoInclusion: datos.filtrosPlatos?.modoInclusion ?? true,
                platosPermitidos: datos.filtrosPlatos?.platosPermitidos || [],
                categoriasPermitidas: datos.filtrosPlatos?.categoriasPermitidas || [],
                tiposPermitidos: datos.filtrosPlatos?.tiposPermitidos || []
            },
            configVisual: datos.configVisual || undefined,
            ordenamiento: datos.ordenamiento || undefined,
            configCronometro: datos.configCronometro || undefined
        };

        const vista = await repo.crearVistaCocina(sanitizados, req.admin.id);
        res.status(201).json({ success: true, message: 'Vista de cocina creada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al crear vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al crear vista' });
    }
});

/**
 * PUT /api/vistas-cocina/:id
 */
router.put('/vistas-cocina/:id', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const datos = {};
        const body = req.body;

        if (body.nombre !== undefined) datos.nombre = body.nombre.trim();
        if (body.descripcion !== undefined) datos.descripcion = body.descripcion?.trim() || '';
        if (body.color !== undefined) datos.color = body.color;
        if (body.icono !== undefined) datos.icono = body.icono;
        if (body.activo !== undefined) datos.activo = body.activo;
        if (body.filtrosPlatos !== undefined) {
            datos.filtrosPlatos = {
                modoInclusion: body.filtrosPlatos?.modoInclusion ?? true,
                platosPermitidos: body.filtrosPlatos?.platosPermitidos || [],
                categoriasPermitidas: body.filtrosPlatos?.categoriasPermitidas || [],
                tiposPermitidos: body.filtrosPlatos?.tiposPermitidos || []
            };
        }
        if (body.configVisual !== undefined) datos.configVisual = body.configVisual;
        if (body.ordenamiento !== undefined) datos.ordenamiento = body.ordenamiento;
        if (body.configCronometro !== undefined) datos.configCronometro = body.configCronometro;

        const vista = await repo.actualizarVistaCocina(req.params.id, datos, req.admin.id);
        res.json({ success: true, message: 'Vista de cocina actualizada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al actualizar vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al actualizar vista' });
    }
});

/**
 * DELETE /api/vistas-cocina/:id  (soft delete)
 */
router.delete('/vistas-cocina/:id', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const vista = await repo.eliminarVistaCocina(req.params.id, req.admin.id);
        res.json({ success: true, message: 'Vista de cocina eliminada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al eliminar vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al eliminar vista' });
    }
});

/**
 * PATCH /api/vistas-cocina/:id/reactivar
 */
router.patch('/vistas-cocina/:id/reactivar', adminAuth, requireAnyPermission(['administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const vista = await repo.reactivarVistaCocina(req.params.id, req.admin.id);
        res.json({ success: true, message: 'Vista de cocina reactivada correctamente', data: vista });
    } catch (error) {
        logger.error('Error al reactivar vista de cocina', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al reactivar vista' });
    }
});

/* ====================== PANTALLAS DE COCINA ====================== */

/**
 * GET /api/pantallas-cocina
 */
router.get('/pantallas-cocina', adminAuth, async (req, res) => {
    try {
        const pantallas = await repo.obtenerPantallasCocina();
        res.json({ success: true, data: pantallas, total: pantallas.length });
    } catch (error) {
        logger.error('Error al listar pantallas de cocina', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener pantallas' });
    }
});

/**
 * GET /api/pantallas-cocina/activas
 */
router.get('/pantallas-cocina/activas', adminAuth, async (req, res) => {
    try {
        const pantallas = await repo.obtenerPantallasActivas();
        res.json({ success: true, data: pantallas });
    } catch (error) {
        logger.error('Error al listar pantallas activas', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener pantallas activas' });
    }
});

/**
 * POST /api/pantallas-cocina
 */
router.post('/pantallas-cocina', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const datos = req.body;
        if (!datos.numeroPantalla || !datos.nombre) {
            return res.status(400).json({ success: false, error: 'numeroPantalla y nombre son requeridos' });
        }
        const pantalla = await repo.crearPantallaCocina(datos, req.admin.id);
        res.status(201).json({ success: true, message: 'Pantalla creada correctamente', data: pantalla });
    } catch (error) {
        logger.error('Error al crear pantalla', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al crear pantalla' });
    }
});

/**
 * PUT /api/pantallas-cocina/:id
 */
router.put('/pantallas-cocina/:id', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const pantalla = await repo.actualizarPantallaCocina(req.params.id, req.body, req.admin.id);
        res.json({ success: true, message: 'Pantalla actualizada correctamente', data: pantalla });
    } catch (error) {
        logger.error('Error al actualizar pantalla', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al actualizar pantalla' });
    }
});

/**
 * DELETE /api/pantallas-cocina/:id
 */
router.delete('/pantallas-cocina/:id', adminAuth, requireAnyPermission(['desplegar-monitores-cocina', 'administrar-vistas-cocina', 'editar-mozos']), async (req, res) => {
    try {
        const pantalla = await repo.eliminarPantallaCocina(req.params.id);
        res.json({ success: true, message: 'Pantalla eliminada correctamente', data: pantalla });
    } catch (error) {
        logger.error('Error al eliminar pantalla', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al eliminar pantalla' });
    }
});

module.exports = router;