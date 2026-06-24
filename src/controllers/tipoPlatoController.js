const express = require('express');
const router = express.Router();
const {
    listarTiposPlato,
    getMenuLigero,
    obtenerTipoPlatoPorSlug,
    obtenerTipoPlatoPorId,
    crearTipoPlato,
    actualizarTipoPlato,
    desactivarTipoPlato,
    reactivarTipoPlato,
    eliminarTipoPlato,
    obtenerPlatosQueUsanTipo,
    reasignarTipoPlato,
    contarUsoPorSlug
} = require('../repository/tipoPlato.repository');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');

// GET /api/tipos-plato — listar (query: ?activos=true&conUso=true)
router.get('/tipos-plato', async (req, res) => {
    try {
        const soloActivos = req.query.activos === 'true';
        const conUso = req.query.conUso !== 'false';
        const data = await listarTiposPlato({ soloActivos, conUso });
        res.json(data);
    } catch (error) {
        logger.error('Error al listar tipos de plato', { error: error.message });
        handleError(error, res, logger);
    }
});

// GET /api/tipos-plato/menu — lista ligera para clientes (apps móviles)
router.get('/tipos-plato/menu', async (req, res) => {
    try {
        const soloActivos = req.query.activos !== 'false';
        const data = await getMenuLigero(soloActivos);
        res.json(data);
    } catch (error) {
        logger.error('Error al obtener menú ligero de tipos', { error: error.message });
        handleError(error, res, logger);
    }
});

// GET /api/tipos-plato/uso — mapa { slug: count } agregado
router.get('/tipos-plato/uso', async (req, res) => {
    try {
        const map = await contarUsoPorSlug();
        res.json(map);
    } catch (error) {
        logger.error('Error al contar uso por tipo', { error: error.message });
        handleError(error, res, logger);
    }
});

// GET /api/tipos-plato/:slug — detalle por slug
router.get('/tipos-plato/slug/:slug', async (req, res) => {
    try {
        const data = await obtenerTipoPlatoPorSlug(req.params.slug);
        if (!data) return res.status(404).json({ error: 'Tipo no encontrado' });
        res.json(data);
    } catch (error) {
        logger.error('Error al obtener tipo por slug', { slug: req.params.slug, error: error.message });
        handleError(error, res, logger);
    }
});

// GET /api/tipos-plato/:id — detalle por id
router.get('/tipos-plato/:id', async (req, res) => {
    try {
        const data = await obtenerTipoPlatoPorId(req.params.id);
        if (!data) return res.status(404).json({ error: 'Tipo no encontrado' });
        res.json(data);
    } catch (error) {
        logger.error('Error al obtener tipo por id', { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

// GET /api/tipos-plato/:slug/platos — platos que usan ese tipo
router.get('/tipos-plato/:slug/platos', async (req, res) => {
    try {
        const data = await obtenerPlatosQueUsanTipo(req.params.slug);
        res.json(data);
    } catch (error) {
        logger.error('Error al obtener platos por tipo', { slug: req.params.slug, error: error.message });
        handleError(error, res, logger);
    }
});

// POST /api/tipos-plato — crear
router.post('/tipos-plato', async (req, res) => {
    try {
        const data = await crearTipoPlato(req.body);
        res.json(data);
    } catch (error) {
        logger.error('Error al crear tipo de plato', { error: error.message });
        handleError(error, res, logger);
    }
});

// PUT /api/tipos-plato/:id — actualizar
router.put('/tipos-plato/:id', async (req, res) => {
    try {
        const data = await actualizarTipoPlato(req.params.id, req.body);
        res.json(data);
    } catch (error) {
        logger.error('Error al actualizar tipo de plato', { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

// PATCH /api/tipos-plato/:id/desactivar
router.patch('/tipos-plato/:id/desactivar', async (req, res) => {
    try {
        const data = await desactivarTipoPlato(req.params.id);
        res.json(data);
    } catch (error) {
        logger.error('Error al desactivar tipo', { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

// PATCH /api/tipos-plato/:id/reactivar
router.patch('/tipos-plato/:id/reactivar', async (req, res) => {
    try {
        const data = await reactivarTipoPlato(req.params.id);
        res.json(data);
    } catch (error) {
        logger.error('Error al reactivar tipo', { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

// DELETE /api/tipos-plato/:id — eliminar (si no tiene platos y no es sistema)
router.delete('/tipos-plato/:id', async (req, res) => {
    try {
        const data = await eliminarTipoPlato(req.params.id);
        res.json(data);
    } catch (error) {
        logger.error('Error al eliminar tipo', { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

// POST /api/tipos-plato/:slug/reasignar — reasignar platos a otro tipo
router.post('/tipos-plato/:slug/reasignar', async (req, res) => {
    try {
        const { slugDestino, platoIds } = req.body;
        if (!slugDestino) {
            return res.status(400).json({ error: 'slugDestino es requerido' });
        }
        const data = await reasignarTipoPlato(req.params.slug, slugDestino, platoIds);
        res.json(data);
    } catch (error) {
        logger.error('Error al reasignar tipo', { slug: req.params.slug, error: error.message });
        handleError(error, res, logger);
    }
});

module.exports = router;