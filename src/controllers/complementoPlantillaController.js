const express = require('express');
const router = express.Router();
const {
    listarComplementosPlantilla,
    buscarComplementosPlantilla,
    obtenerComplementoPlantillaPorId,
    getCategoriasComplementos,
    crearComplementoPlantilla,
    actualizarComplementoPlantilla,
    desactivarComplementoPlantilla,
    reactivarComplementoPlantilla,
    eliminarComplementoPlantilla,
    contarUsoEnPlatos,
    obtenerPlatosQueUsanComplemento,
    obtenerEstadisticasUso
} = require('../repository/complementoPlantilla.repository');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');

// ============ ENDPOINTS CRUD ============

/**
 * GET /api/complementos-plantilla
 * Lista todos los complementos plantilla con filtros opcionales
 * Query params: activos=true|false, categoria=string
 */
router.get('/complementos-plantilla', async (req, res) => {
    try {
        const soloActivos = req.query.activos !== 'false';
        const categoria = req.query.categoria || null;
        
        const data = await listarComplementosPlantilla({ 
            soloActivos, 
            categoria 
        });
        
        res.json(data);
    } catch (error) {
        logger.error('Error al listar complementos plantilla', { error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/complementos-plantilla/buscar
 * Busca complementos por término
 * Query params: q=termino, categoria=string, limit=number
 */
router.get('/complementos-plantilla/buscar', async (req, res) => {
    try {
        const termino = req.query.q || '';
        const categoria = req.query.categoria || null;
        const limit = parseInt(req.query.limit) || 100;
        
        const data = await buscarComplementosPlantilla(termino, { 
            categoria,
            limit,
            soloActivos: true 
        });
        
        res.json(data);
    } catch (error) {
        logger.error('Error al buscar complementos plantilla', { error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/complementos-plantilla/categorias
 * Obtiene lista de categorías disponibles
 */
router.get('/complementos-plantilla/categorias', async (req, res) => {
    try {
        const categorias = await getCategoriasComplementos();
        res.json(categorias);
    } catch (error) {
        logger.error('Error al obtener categorías de complementos', { error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/complementos-plantilla/estadisticas
 * Obtiene estadísticas de uso de todos los complementos
 */
router.get('/complementos-plantilla/estadisticas', async (req, res) => {
    try {
        const estadisticas = await obtenerEstadisticasUso();
        res.json(estadisticas);
    } catch (error) {
        logger.error('Error al obtener estadísticas de complementos', { error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/complementos-plantilla/:id
 * Obtiene un complemento por ID
 */
router.get('/complementos-plantilla/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const complemento = await obtenerComplementoPlantillaPorId(id);
        
        if (!complemento) {
            return res.status(404).json({ error: 'Complemento no encontrado' });
        }
        
        res.json(complemento);
    } catch (error) {
        logger.error('Error al obtener complemento plantilla', { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/complementos-plantilla/:id/uso
 * Obtiene información de uso de un complemento específico
 */
router.get('/complementos-plantilla/:id/uso', async (req, res) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;
        
        const resultado = await obtenerPlatosQueUsanComplemento(id, { limit, skip });
        
        res.json(resultado);
    } catch (error) {
        logger.error('Error al obtener uso del complemento', { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * POST /api/complementos-plantilla
 * Crea un nuevo complemento plantilla
 */
router.post('/complementos-plantilla', async (req, res) => {
    try {
        const data = req.body;
        
        // Validaciones básicas
        if (!data.nombre || !data.nombre.trim()) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        
        if (!data.opciones || !Array.isArray(data.opciones) || data.opciones.length === 0) {
            return res.status(400).json({ error: 'Debe incluir al menos una opción' });
        }
        
        // Filtrar opciones vacías
        data.opciones = data.opciones
            .map(op => typeof op === 'string' ? op.trim() : '')
            .filter(op => op.length > 0);
        
        if (data.opciones.length === 0) {
            return res.status(400).json({ error: 'Debe incluir al menos una opción válida' });
        }
        
        const nuevo = await crearComplementoPlantilla(data);
        
        res.status(201).json(nuevo);
    } catch (error) {
        logger.error('Error al crear complemento plantilla', { error: error.message });
        
        if (error.statusCode === 409) {
            return res.status(409).json({ error: error.message });
        }
        
        handleError(error, res, logger);
    }
});

/**
 * PUT /api/complementos-plantilla/:id
 * Actualiza un complemento plantilla existente
 */
router.put('/complementos-plantilla/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        // Filtrar opciones vacías si se proporcionan
        if (data.opciones && Array.isArray(data.opciones)) {
            data.opciones = data.opciones
                .map(op => typeof op === 'string' ? op.trim() : '')
                .filter(op => op.length > 0);
        }
        
        const actualizado = await actualizarComplementoPlantilla(id, data);
        
        res.json(actualizado);
    } catch (error) {
        logger.error('Error al actualizar complemento plantilla', { id: req.params.id, error: error.message });
        
        if (error.statusCode === 404) {
            return res.status(404).json({ error: error.message });
        }
        
        if (error.statusCode === 409) {
            return res.status(409).json({ error: error.message });
        }
        
        handleError(error, res, logger);
    }
});

/**
 * PATCH /api/complementos-plantilla/:id/desactivar
 * Desactiva un complemento plantilla (borrado lógico)
 */
router.patch('/complementos-plantilla/:id/desactivar', async (req, res) => {
    try {
        const { id } = req.params;
        const validarUso = req.query.validarUso !== 'false';
        
        const resultado = await desactivarComplementoPlantilla(id, validarUso);
        
        res.json({ 
            mensaje: 'Complemento desactivado correctamente',
            complemento: resultado 
        });
    } catch (error) {
        logger.error('Error al desactivar complemento plantilla', { id: req.params.id, error: error.message });
        
        if (error.statusCode === 404) {
            return res.status(404).json({ error: error.message });
        }
        
        handleError(error, res, logger);
    }
});

/**
 * PATCH /api/complementos-plantilla/:id/reactivar
 * Reactiva un complemento plantilla desactivado
 */
router.patch('/complementos-plantilla/:id/reactivar', async (req, res) => {
    try {
        const { id } = req.params;
        
        const resultado = await reactivarComplementoPlantilla(id);
        
        res.json({ 
            mensaje: 'Complemento reactivado correctamente',
            complemento: resultado 
        });
    } catch (error) {
        logger.error('Error al reactivar complemento plantilla', { id: req.params.id, error: error.message });
        
        if (error.statusCode === 404) {
            return res.status(404).json({ error: error.message });
        }
        
        handleError(error, res, logger);
    }
});

/**
 * DELETE /api/complementos-plantilla/:id
 * Elimina físicamente un complemento plantilla (solo si no está en uso)
 */
router.delete('/complementos-plantilla/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const resultado = await eliminarComplementoPlantilla(id);
        
        res.json(resultado);
    } catch (error) {
        logger.error('Error al eliminar complemento plantilla', { id: req.params.id, error: error.message });
        
        if (error.statusCode === 404) {
            return res.status(404).json({ error: error.message });
        }
        
        if (error.statusCode === 409) {
            return res.status(409).json({ 
                error: error.message,
                platosUsandolo: error.platosUsandolo 
            });
        }
        
        handleError(error, res, logger);
    }
});

module.exports = router;
