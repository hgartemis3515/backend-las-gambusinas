/**
 * ASIGNACION AUTOMATICA DE PLATOS - CONTROLLER
 * Endpoints para gestión de la configuración y reglas de auto-asignación.
 * Patrón idéntico a cocinerosController / zonaController (router Express).
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

const asignacionRepository = require('../repository/asignacionAutomatica.repository');
const asignacionService = require('../services/asignacionAutomaticaService');

const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');

const ESTRATEGIAS_VALIDAS = ['fijo_por_plato', 'fijo_por_categoria', 'cadena_overflow', 'menor_carga', 'round_robin', 'hibrido', 'respetar_zona'];
const MODOS_SIN_CANDIDATO_VALIDOS = ['dejar_sin_asignar', 'pool_supervisor', 'round_robin_zona'];

/**
 * Sanitiza el body completo de config global + reglas.
 */
function sanitizarConfigEntrada(body) {
    const out = {};
    if (typeof body.habilitada === 'boolean') out.habilitada = body.habilitada;

    if (body.defaults && typeof body.defaults === 'object') {
        const d = body.defaults;
        out.defaults = {};
        if (Number.isFinite(d.maxMismoPlatoPorCocinero)) out.defaults.maxMismoPlatoPorCocinero = Math.max(1, Math.min(50, Number(d.maxMismoPlatoPorCocinero)));
        if (Number.isFinite(d.maxPlatosTotalesEnCurso)) out.defaults.maxPlatosTotalesEnCurso = Math.max(1, Math.min(100, Number(d.maxPlatosTotalesEnCurso)));
        if (MODOS_SIN_CANDIDATO_VALIDOS.includes(d.modoSinCandidato)) out.defaults.modoSinCandidato = d.modoSinCandidato;
        if (typeof d.soloCocinerosConectados === 'boolean') out.defaults.soloCocinerosConectados = d.soloCocinerosConectados;
        if (typeof d.respetarZonas === 'boolean') out.defaults.respetarZonas = d.respetarZonas;
        if (ESTRATEGIAS_VALIDAS.includes(d.estrategiaDefault)) out.defaults.estrategiaDefault = d.estrategiaDefault;
    }

    if (Array.isArray(body.reglasPorPlato)) {
        out.reglasPorPlato = body.reglasPorPlato
            .filter(r => r && r.platoId != null && r.cocineroPrimarioId)
            .map(r => ({
                platoId: Number(r.platoId),
                activo: r.activo !== false,
                cocineroPrimarioId: r.cocineroPrimarioId,
                backups: Array.isArray(r.backups)
                    ? r.backups
                        .filter(b => b && b.cocineroId)
                        .map((b, i) => ({
                            cocineroId: b.cocineroId,
                            orden: Number.isFinite(b.orden) ? b.orden : i
                        }))
                        .sort((a, b) => a.orden - b.orden)
                    : [],
                maxMismoPlato: Number.isFinite(r.maxMismoPlato) ? Number(r.maxMismoPlato) : null,
                estrategia: ESTRATEGIAS_VALIDAS.includes(r.estrategia) ? r.estrategia : null,
                notas: typeof r.notas === 'string' ? r.notas.slice(0, 500) : ''
            }));
    }

    if (Array.isArray(body.reglasPorCategoria)) {
        out.reglasPorCategoria = body.reglasPorCategoria
            .filter(r => r && r.categoria && r.cocineroPrimarioId)
            .map(r => ({
                categoria: String(r.categoria).trim(),
                activo: r.activo !== false,
                cocineroPrimarioId: r.cocineroPrimarioId,
                backups: Array.isArray(r.backups)
                    ? r.backups
                        .filter(b => b && b.cocineroId)
                        .map((b, i) => ({ cocineroId: b.cocineroId, orden: Number.isFinite(b.orden) ? b.orden : i }))
                        .sort((a, b) => a.orden - b.orden)
                    : [],
                maxMismoPlato: Number.isFinite(r.maxMismoPlato) ? Number(r.maxMismoPlato) : null,
                estrategia: ESTRATEGIAS_VALIDAS.includes(r.estrategia) ? r.estrategia : null,
                notas: typeof r.notas === 'string' ? r.notas.slice(0, 500) : ''
            }));
    }
    return out;
}

/**
 * GET /api/asignacion-automatica
 * Devuelve config global + reglas.
 */
router.get('/asignacion-automatica', adminAuth, async (req, res) => {
    try {
        const config = await asignacionRepository.obtenerConfiguracion();
        res.json({ success: true, data: config });
    } catch (error) {
        logger.error('Error al obtener asignación automática', { error: error.message });
        res.status(500).json({ success: false, error: error.message || 'Error al obtener configuración' });
    }
});

/**
 * PUT /api/asignacion-automatica
 * Guarda config global + reglas por plato/categoría.
 */
router.put('/asignacion-automatica', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const sanitizado = sanitizarConfigEntrada(req.body);
        const config = await asignacionRepository.actualizarConfiguracion(sanitizado, req.admin.id);
        logger.info('Configuración de asignación automática actualizada', { actualizadoPor: req.admin.id, habilitada: config.habilitada, reglasPlato: config.reglasPorPlato?.length, reglasCategoria: config.reglasPorCategoria?.length });
        res.json({ success: true, message: 'Configuración guardada correctamente', data: config });
    } catch (error) {
        logger.error('Error al guardar asignación automática', { error: error.message });
        res.status(500).json({ success: false, error: error.message || 'Error al guardar configuración' });
    }
});

/**
 * POST /api/asignacion-automatica/toggle
 * Pausa/activa sin modificar reglas. Body: { habilitada: bool }
 */
router.post('/asignacion-automatica/toggle', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const valor = req.body && typeof req.body.habilitada === 'boolean' ? req.body.habilitada : null;
        if (valor === null) return res.status(400).json({ success: false, error: 'Se requiere { habilitada: boolean }' });
        const config = await asignacionRepository.toggleHabilitada(valor, req.admin.id);
        logger.info('Toggle asignación automática', { habilitada: valor, modificadoPor: req.admin.id });
        res.json({ success: true, message: valor ? 'Asignación automática activada' : 'Asignación automática pausada', data: config });
    } catch (error) {
        logger.error('Error al toggle asignación automática', { error: error.message });
        res.status(500).json({ success: false, error: error.message || 'Error al cambiar estado' });
    }
});

/**
 * GET /api/asignacion-automatica/matriz
 * Matriz plato × cocineros: para cada plato configurado, muestra primario + backups con datos del cocinero.
 */
router.get('/asignacion-automatica/matriz', adminAuth, async (req, res) => {
    try {
        const config = await asignacionRepository.obtenerConfiguracion();
        // Recopilar todos los cocineroIds únicos
        const ids = new Set();
        (config.reglasPorPlato || []).forEach(r => {
            if (r.cocineroPrimarioId) ids.add(r.cocineroPrimarioId.toString());
            (r.backups || []).forEach(b => ids.add(b.cocineroId.toString()));
        });
        (config.reglasPorCategoria || []).forEach(r => {
            if (r.cocineroPrimarioId) ids.add(r.cocineroPrimarioId.toString());
            (r.backups || []).forEach(b => ids.add(b.cocineroId.toString()));
        });
        const cocinerosMap = {};
        if (ids.size > 0) {
            const cocineros = await Mozos.find({ _id: { $in: Array.from(ids) } }).select('name aliasCocinero rol zonaIds');
            cocineros.forEach(c => { cocinerosMap[c._id.toString()] = { _id: c._id, nombre: c.name, alias: c.aliasCocinero, rol: c.rol, zonaIds: c.zonaIds }; });
        }
        const enriquecerBackups = (backs) => (backs || []).map(b => ({ ...b, cocinero: cocinerosMap[b.cocineroId.toString()] || null }));
        const matrizPlatos = (config.reglasPorPlato || []).map(r => ({
            platoId: r.platoId,
            activo: r.activo,
            primario: r.cocineroPrimarioId ? cocinerosMap[r.cocineroPrimarioId.toString()] || null : null,
            backups: enriquecerBackups(r.backups),
            maxMismoPlato: r.maxMismoPlato,
            estrategia: r.estrategia,
            notas: r.notas
        }));
        const matrizCategorias = (config.reglasPorCategoria || []).map(r => ({
            categoria: r.categoria,
            activo: r.activo,
            primario: r.cocineroPrimarioId ? cocinerosMap[r.cocineroPrimarioId.toString()] || null : null,
            backups: enriquecerBackups(r.backups),
            maxMismoPlato: r.maxMismoPlato,
            estrategia: r.estrategia,
            notas: r.notas
        }));
        res.json({ success: true, data: { habilitada: config.habilitada, defaults: config.defaults, matrizPlatos, matrizCategorias } });
    } catch (error) {
        logger.error('Error al obtener matriz', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/asignacion-automatica/simular
 * Dry-run: dado platoId (y opcional categoria/tipo), devuelve a quién iría.
 */
router.post('/asignacion-automatica/simular', adminAuth, async (req, res) => {
    try {
        const { platoId, categoria, tipo } = req.body || {};
        if (platoId == null) return res.status(400).json({ success: false, error: 'platoId es requerido' });
        const resultado = await asignacionService.simularAsignacion(platoId, categoria, tipo);
        res.json({ success: true, data: resultado });
    } catch (error) {
        logger.error('Error al simular asignación', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;