const express = require('express');
const router = express.Router();
const metaMozoRepository = require('../repository/metaMozo.repository');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');

// ============================================================
// GET /api/metas-mozos - Listar todas las metas
// ============================================================
router.get("/metas-mozos", async (req, res) => {
    try {
        const filtros = {};
        
        if (req.query.activo !== undefined) {
            filtros.activo = req.query.activo === 'true';
        }
        if (req.query.tipo) {
            filtros.tipo = req.query.tipo;
        }
        if (req.query.periodo) {
            filtros.periodo = req.query.periodo;
        }
        if (req.query.esPlantilla !== undefined) {
            filtros.esPlantilla = req.query.esPlantilla === 'true';
        }

        const metas = await metaMozoRepository.obtenerMetas(filtros);
        
        res.json({
            success: true,
            data: metas,
            count: metas.length
        });
    } catch (error) {
        logger.error('Error al obtener metas', { error: error.message });
        handleError(error, res, logger);
    }
});

// ============================================================
// GET /api/metas-mozos/activas - Metas vigentes
// ============================================================
router.get("/metas-mozos/activas", async (req, res) => {
    try {
        const metas = await metaMozoRepository.obtenerMetasActivas();
        
        res.json({
            success: true,
            data: metas,
            count: metas.length
        });
    } catch (error) {
        logger.error('Error al obtener metas activas', { error: error.message });
        handleError(error, res, logger);
    }
});

// ============================================================
// GET /api/metas-mozos/futuras - Metas programadas
// ============================================================
router.get("/metas-mozos/futuras", async (req, res) => {
    try {
        const metas = await metaMozoRepository.obtenerMetasFuturas();
        
        res.json({
            success: true,
            data: metas,
            count: metas.length
        });
    } catch (error) {
        logger.error('Error al obtener metas futuras', { error: error.message });
        handleError(error, res, logger);
    }
});

// ============================================================
// GET /api/metas-mozos/historial - Historial de metas
// ============================================================
router.get("/metas-mozos/historial", async (req, res) => {
    try {
        const limite = parseInt(req.query.limite) || 50;
        const metas = await metaMozoRepository.obtenerHistorialMetas(limite);
        
        res.json({
            success: true,
            data: metas,
            count: metas.length
        });
    } catch (error) {
        logger.error('Error al obtener historial de metas', { error: error.message });
        handleError(error, res, logger);
    }
});

// ============================================================
// GET /api/metas-mozos/plantillas - Listar plantillas
// ============================================================
router.get("/metas-mozos/plantillas", async (req, res) => {
    try {
        const plantillas = await metaMozoRepository.obtenerPlantillas();
        
        res.json({
            success: true,
            data: plantillas,
            count: plantillas.length
        });
    } catch (error) {
        logger.error('Error al obtener plantillas', { error: error.message });
        handleError(error, res, logger);
    }
});

// ============================================================
// GET /api/metas-mozos/mozo/:mozoId - Metas de un mozo
// ============================================================
router.get("/metas-mozos/mozo/:mozoId", async (req, res) => {
    try {
        const { mozoId } = req.params;
        
        if (!mozoId) {
            return res.status(400).json({
                success: false,
                message: 'ID de mozo requerido'
            });
        }

        const metas = await metaMozoRepository.obtenerMetasPorMozo(mozoId);
        
        res.json({
            success: true,
            data: metas,
            count: metas.length
        });
    } catch (error) {
        logger.error('Error al obtener metas del mozo', { 
            mozoId: req.params.mozoId, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// GET /api/metas-mozos/:id - Obtener meta por ID
// ============================================================
router.get("/metas-mozos/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        const meta = await metaMozoRepository.obtenerMetaPorId(id);
        
        if (!meta) {
            return res.status(404).json({
                success: false,
                message: 'Meta no encontrada'
            });
        }

        res.json({
            success: true,
            data: meta
        });
    } catch (error) {
        logger.error('Error al obtener meta', { 
            id: req.params.id, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// GET /api/metas-mozos/:id/cumplimiento - Obtener cumplimiento detallado
// ============================================================
router.get("/metas-mozos/:id/cumplimiento", async (req, res) => {
    try {
        const { id } = req.params;
        
        const cumplimiento = await metaMozoRepository.obtenerCumplimientoMeta(id);
        
        res.json({
            success: true,
            data: cumplimiento
        });
    } catch (error) {
        logger.error('Error al obtener cumplimiento', { 
            id: req.params.id, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// POST /api/metas-mozos - Crear nueva meta
// ============================================================
router.post("/metas-mozos", async (req, res) => {
    try {
        const data = req.body;
        
        // Validaciones básicas
        if (!data.tipo) {
            return res.status(400).json({
                success: false,
                message: 'El tipo de meta es requerido'
            });
        }
        if (!data.valorObjetivo || data.valorObjetivo <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El valor objetivo debe ser mayor a 0'
            });
        }
        if (!data.periodo) {
            return res.status(400).json({
                success: false,
                message: 'El período es requerido'
            });
        }

        // Obtener datos del usuario que crea (si está autenticado)
        if (req.usuario) {
            data.creadoPor = req.usuario._id || req.usuario.id;
            data.creadoPorNombre = req.usuario.name || req.usuario.nombre || 'Sistema';
        }

        const nuevaMeta = await metaMozoRepository.crearMeta(data);

        // Emitir evento Socket.io si está disponible
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('metas-actualizadas', {
                    tipo: 'creada',
                    meta: nuevaMeta,
                    timestamp: new Date().toISOString(),
                    usuario: data.creadoPorNombre || 'Sistema'
                });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Meta creada correctamente',
            data: nuevaMeta
        });
    } catch (error) {
        logger.error('Error al crear meta', { error: error.message, body: req.body });
        handleError(error, res, logger);
    }
});

// ============================================================
// POST /api/metas-mozos/plantilla - Crear nueva plantilla
// ============================================================
router.post("/metas-mozos/plantilla", async (req, res) => {
    try {
        const data = { ...req.body, esPlantilla: true };
        
        // Generar nombre automático si no se proporciona
        if (!data.nombre) {
            const tipoNombres = {
                'ventas': 'Meta de Ventas',
                'mesas_atendidas': 'Meta de Mesas',
                'tickets_generados': 'Meta de Tickets',
                'ticket_promedio': 'Meta Ticket Promedio',
                'propinas_promedio': 'Meta Propinas Promedio'
            };
            data.nombre = tipoNombres[data.tipo] || 'Nueva Plantilla';
        }

        if (req.usuario) {
            data.creadoPor = req.usuario._id || req.usuario.id;
            data.creadoPorNombre = req.usuario.name || req.usuario.nombre || 'Sistema';
        }

        const nuevaPlantilla = await metaMozoRepository.crearMeta(data);

        res.status(201).json({
            success: true,
            message: 'Plantilla creada correctamente',
            data: nuevaPlantilla
        });
    } catch (error) {
        logger.error('Error al crear plantilla', { error: error.message });
        handleError(error, res, logger);
    }
});

// ============================================================
// POST /api/metas-mozos/desde-plantilla/:plantillaId - Crear desde plantilla
// ============================================================
router.post("/metas-mozos/desde-plantilla/:plantillaId", async (req, res) => {
    try {
        const { plantillaId } = req.params;
        const datosPersonalizados = req.body;

        if (req.usuario) {
            datosPersonalizados.creadoPor = req.usuario._id || req.usuario.id;
            datosPersonalizados.creadoPorNombre = req.usuario.name || req.usuario.nombre || 'Sistema';
        }

        const nuevaMeta = await metaMozoRepository.crearMetaDesdePlantilla(plantillaId, datosPersonalizados);

        // Emitir evento Socket.io
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('metas-actualizadas', {
                    tipo: 'creada',
                    meta: nuevaMeta,
                    timestamp: new Date().toISOString(),
                    usuario: datosPersonalizados.creadoPorNombre || 'Sistema'
                });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Meta creada desde plantilla',
            data: nuevaMeta
        });
    } catch (error) {
        logger.error('Error al crear meta desde plantilla', { 
            plantillaId: req.params.plantillaId, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// PUT /api/metas-mozos/:id - Actualizar meta
// ============================================================
router.put("/metas-mozos/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const datos = req.body;

        // Obtener datos del usuario que actualiza
        if (req.usuario) {
            datos.actualizadoPor = req.usuario._id || req.usuario.id;
            datos.actualizadoPorNombre = req.usuario.name || req.usuario.nombre || 'Sistema';
        }

        const metaActualizada = await metaMozoRepository.actualizarMeta(id, datos);

        // Emitir evento Socket.io
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('metas-actualizadas', {
                    tipo: 'actualizada',
                    meta: metaActualizada,
                    timestamp: new Date().toISOString(),
                    usuario: datos.actualizadoPorNombre || 'Sistema'
                });
            }
        }

        res.json({
            success: true,
            message: 'Meta actualizada correctamente',
            data: metaActualizada
        });
    } catch (error) {
        logger.error('Error al actualizar meta', { 
            id: req.params.id, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// PUT /api/metas-mozos/:id/duplicar - Duplicar meta
// ============================================================
router.put("/metas-mozos/:id/duplicar", async (req, res) => {
    try {
        const { id } = req.params;
        const nuevasFechas = req.body;

        const nuevaMeta = await metaMozoRepository.duplicarMeta(id, nuevasFechas);

        // Emitir evento Socket.io
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('metas-actualizadas', {
                    tipo: 'creada',
                    meta: nuevaMeta,
                    timestamp: new Date().toISOString(),
                    usuario: 'Sistema'
                });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Meta duplicada correctamente',
            data: nuevaMeta
        });
    } catch (error) {
        logger.error('Error al duplicar meta', { 
            id: req.params.id, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// PUT /api/metas-mozos/:id/activar - Activar meta futura
// ============================================================
router.put("/metas-mozos/:id/activar", async (req, res) => {
    try {
        const { id } = req.params;

        const metaActivada = await metaMozoRepository.activarMetaAhora(id);

        // Emitir evento Socket.io
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('metas-actualizadas', {
                    tipo: 'actualizada',
                    meta: metaActivada,
                    timestamp: new Date().toISOString(),
                    usuario: 'Sistema'
                });
            }
        }

        res.json({
            success: true,
            message: 'Meta activada correctamente',
            data: metaActivada
        });
    } catch (error) {
        logger.error('Error al activar meta', { 
            id: req.params.id, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// PUT /api/metas-mozos/:id/desactivar - Desactivar meta
// ============================================================
router.put("/metas-mozos/:id/desactivar", async (req, res) => {
    try {
        const { id } = req.params;
        
        let desactivadoPor = null;
        let desactivadoPorNombre = 'Sistema';
        
        if (req.usuario) {
            desactivadoPor = req.usuario._id || req.usuario.id;
            desactivadoPorNombre = req.usuario.name || req.usuario.nombre || 'Sistema';
        }

        const metaDesactivada = await metaMozoRepository.desactivarMeta(
            id, 
            desactivadoPor, 
            desactivadoPorNombre
        );

        // Emitir evento Socket.io
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('metas-actualizadas', {
                    tipo: 'desactivada',
                    meta: { _id: metaDesactivada._id },
                    timestamp: new Date().toISOString(),
                    usuario: desactivadoPorNombre
                });
            }
        }

        res.json({
            success: true,
            message: 'Meta desactivada correctamente',
            data: metaDesactivada
        });
    } catch (error) {
        logger.error('Error al desactivar meta', { 
            id: req.params.id, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

// ============================================================
// DELETE /api/metas-mozos/:id - Eliminar meta permanentemente
// ============================================================
router.delete("/metas-mozos/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const resultado = await metaMozoRepository.eliminarMeta(id);

        // Emitir evento Socket.io
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('metas-actualizadas', {
                    tipo: 'eliminada',
                    meta: { _id: id },
                    timestamp: new Date().toISOString(),
                    usuario: 'Sistema'
                });
            }
        }

        res.json({
            success: true,
            message: 'Meta eliminada correctamente',
            data: resultado
        });
    } catch (error) {
        logger.error('Error al eliminar meta', { 
            id: req.params.id, 
            error: error.message 
        });
        handleError(error, res, logger);
    }
});

module.exports = router;
