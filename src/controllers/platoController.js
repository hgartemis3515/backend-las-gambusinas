const express = require("express");
const router = express.Router();
const {
    listarPlatos,
    listarPlatosPorTipo,
    obtenerPlatoPorId,
    crearPlato,
    actualizarPlato,
    borrarPlato,
    findByCategoria,
    importarPlatosDesdeJSON,
    getMenuPorTipo,
    getCategorias,
    getMenuPorTipoYCategoria,
    actualizarTipoPlato
} = require("../repository/plato.repository");
const logger = require("../utils/logger");
const { handleError } = require("../utils/errorHandler");

router.get("/platos", async (req, res) => {
    try {
        const tipo = req.query.tipo != null ? String(req.query.tipo).trim() : null;
        const isActive = req.query.isActive !== 'false';
        const data = tipo
            ? await listarPlatosPorTipo(tipo, { isActive })
            : await listarPlatos();
        res.json(data);
    } catch (error) {
        logger.error('Error al listar platos', { tipo: req.query.tipo, error: error.message });
        handleError(error, res, logger);
    }
});

// Rutas específicas antes de /platos/:id para evitar que "menu" o "categorias" se interpreten como id
router.get("/platos/categorias", async (req, res) => {
    try {
        const data = await getCategorias();
        res.json(data);
    } catch (error) {
        logger.error('Error al listar categorías', { error: error.message });
        handleError(error, res, logger);
    }
});

router.get("/platos/menu/:tipo/categoria/:categoria", async (req, res) => {
    try {
        const { tipo, categoria } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await getMenuPorTipoYCategoria(tipo, categoria, page, limit);
        res.json(data);
    } catch (error) {
        logger.error('Error al listar menú por tipo y categoría', { tipo: req.params.tipo, categoria: req.params.categoria, error: error.message });
        handleError(error, res, logger);
    }
});

router.get("/platos/menu/:tipo", async (req, res) => {
    try {
        const { tipo } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 500;
        const data = await getMenuPorTipo(tipo, page, limit);
        res.json(data);
    } catch (error) {
        logger.error('Error al listar menú por tipo', { tipo: req.params.tipo, error: error.message });
        handleError(error, res, logger);
    }
});

router.get("/platos/categoria/:categoria", async (req, res) => {
    try {
        const categoria = req.params.categoria;
        const platos = await findByCategoria(categoria);
        res.json({ platos, total: platos.length, categorias: [categoria], filtrosAplicados: { categoria } });
    } catch (error) {
        logger.error('Error al buscar platos por categoría', { categoria: req.params.categoria, error: error.message });
        handleError(error, res, logger);
    }
});

router.get("/platos/:id", async (req, res) => {
    try {
        const idPlato = req.params.id;
        const plato = await obtenerPlatoPorId(idPlato);
        if (!plato) {
            return res.status(404).json({ error: "Plato no encontrado" });
        }
        res.json(plato);
    } catch (error) {
        logger.error("Error al obtener plato", { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

router.post('/platos', async (req, res) => {
    try {
        const nuevoPlato = req.body;
        const platoCreado = await crearPlato(nuevoPlato);
        res.json(platoCreado);
    } catch (error) {
        logger.error("Error al crear plato", { error: error.message });
        handleError(error, res, logger);
    }
});

router.put('/platos/:id', async (req, res) => {
    try {
        const idPlato = req.params.id;
        const newData = req.body;
        const platoActualizado = await actualizarPlato(idPlato, newData);
        res.json(platoActualizado);
    } catch (error) {
        logger.error("Error al actualizar plato", { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

router.patch('/platos/:id/tipo', async (req, res) => {
    try {
        const idPlato = req.params.id;
        const { tipo } = req.body;
        if (!tipo) {
            return res.status(400).json({ error: 'Campo "tipo" es requerido' });
        }
        const result = await actualizarTipoPlato(idPlato, tipo);
        res.json(result);
    } catch (error) {
        logger.error("Error al actualizar tipo de plato", { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

router.delete('/platos/:id', async (req, res) => {
    try {
        const idPlato = req.params.id;
        const platoEliminado = await borrarPlato(idPlato);
        res.json(platoEliminado);
    } catch (error) {
        logger.error("Error al eliminar plato", { id: req.params.id, error: error.message });
        handleError(error, res, logger);
    }
});

router.post('/platos/importar', async (req, res) => {
    try {
        const resultado = await importarPlatosDesdeJSON();
        res.json({
            success: true,
            message: `Importación completada: ${resultado.imported} nuevos, ${resultado.updated} actualizados`,
            ...resultado
        });
    } catch (error) {
        logger.error("Error al importar platos", { error: error.message });
        handleError(error, res, logger);
    }
});

module.exports = router;
