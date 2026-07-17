/**
 * ASIGNACION AUTOMATICA DE PLATOS - CONTROLLER (v2: Perfiles + Calendario)
 * ---------------------------------------------------------------------------
 * Endpoints para gestión de la configuración global, perfiles con nombre y
 * plantilla semanal de franjas horarias. Patrón Express router.
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

// ---------------------------- Sanitización de reglas ----------------------------

/**
 * Sanitiza un array de reglas por plato (validación + normalización).
 */
function sanitizarReglasPlato(arr) {
    if (!Array.isArray(arr)) return undefined;
    return arr
        .filter(r => r && r.platoId != null && (r.cocineroPrimarioId || (Array.isArray(r.backups) && r.backups.some(b => b && b.cocineroId))))
        .map(r => ({
            platoId: Number(r.platoId),
            activo: r.activo !== false,
            cocineroPrimarioId: r.cocineroPrimarioId || null,
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

/**
 * Sanitiza un array de reglas por categoría.
 */
function sanitizarReglasCategoria(arr) {
    if (!Array.isArray(arr)) return undefined;
    return arr
        .filter(r => r && r.categoria && (r.cocineroPrimarioId || (Array.isArray(r.backups) && r.backups.some(b => b && b.cocineroId))))
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

/**
 * Sanitiza el body completo de config global + reglas (legacy).
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

    // v2: legacy reglasPorPlato/reglasPorCategoria en raíz — se aceptan para no romper
    // clientes antiguos, pero se desaconseja. La fuente de verdad son los perfiles.
    const rp = sanitizarReglasPlato(body.reglasPorPlato);
    if (rp) out.reglasPorPlato = rp;
    const rc = sanitizarReglasCategoria(body.reglasPorCategoria);
    if (rc) out.reglasPorCategoria = rc;

    return out;
}

// ---------------------------- Helpers ----------------------------

/**
 * Calcula el "perfil activo ahora" para enriquecer el GET.
 */
function calcularPerfilActivoAhora(config) {
    const r = asignacionService.resolverPerfilActivo(config, asignacionService.nowLima());
    if (!r.perfil) return { perfilId: null, nombre: null, bloqueId: null, horaInicio: null, horaFin: null, motivo: r.motivo };
    return {
        perfilId: r.perfil.id,
        nombre: r.perfil.nombre,
        bloqueId: r.bloque?.id || null,
        horaInicio: r.bloque?.horaInicio || null,
        horaFin: r.bloque?.horaFin || null
    };
}

// ============================ Endpoints ============================

/**
 * GET /api/asignacion-automatica
 * Devuelve config global + perfiles + calendario + campo derivado perfilActivoAhora.
 */
router.get('/asignacion-automatica', adminAuth, async (req, res) => {
    try {
        const config = await asignacionRepository.obtenerConfiguracion();
        const perfilActivoAhora = calcularPerfilActivoAhora(config);
        res.json({ success: true, data: config, perfilActivoAhora });
    } catch (error) {
        logger.error('Error al obtener asignación automática', { error: error.message });
        res.status(500).json({ success: false, error: error.message || 'Error al obtener configuración' });
    }
});

/**
 * PUT /api/asignacion-automatica
 * Actualización parcial: defaults, habilitada y campos globales.
 * (Las reglas por plato/categoría raíz son legacy; preferir perfiles.)
 */
router.put('/asignacion-automatica', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const sanitizado = sanitizarConfigEntrada(req.body);
        const config = await asignacionRepository.actualizarConfiguracion(sanitizado, req.admin.id);
        const perfilActivoAhora = calcularPerfilActivoAhora(config);
        logger.info('Configuración global de asignación automática actualizada', {
            actualizadoPor: req.admin.id,
            habilitada: config.habilitada
        });
        res.json({
            success: true,
            message: 'Configuración guardada correctamente',
            data: config,
            perfilActivoAhora
        });
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
 * Matriz plato × cocineros AGREGADA sobre TODOS los perfiles (vista global).
 * Útil para auditar qué cocinero aparece como primario/backup en cualquier perfil.
 */
router.get('/asignacion-automatica/matriz', adminAuth, async (req, res) => {
    try {
        const config = await asignacionRepository.obtenerConfiguracion();
        const ids = new Set();
        const recorrer = (arr) => {
            (arr || []).forEach(r => {
                if (r.cocineroPrimarioId) ids.add(r.cocineroPrimarioId.toString());
                (r.backups || []).forEach(b => ids.add(b.cocineroId.toString()));
            });
        };
        (config.perfiles || []).forEach(p => { recorrer(p.reglasPorPlato); recorrer(p.reglasPorCategoria); });
        recorrer(config.reglasPorPlato); recorrer(config.reglasPorCategoria);

        const cocinerosMap = {};
        if (ids.size > 0) {
            const cocineros = await Mozos.find({ _id: { $in: Array.from(ids) } }).select('name aliasCocinero rol zonaIds');
            cocineros.forEach(c => { cocinerosMap[c._id.toString()] = { _id: c._id, nombre: c.name, alias: c.aliasCocinero, rol: c.rol, zonaIds: c.zonaIds }; });
        }
        const enriquecerBackups = (backs) => (backs || []).map(b => ({ ...b, cocinero: cocinerosMap[b.cocineroId.toString()] || null }));

        // Matriz por perfil (v2).
        const perfiles = (config.perfiles || []).map(p => ({
            id: p.id,
            nombre: p.nombre,
            activo: p.activo,
            matrizPlatos: (p.reglasPorPlato || []).map(r => ({
                platoId: r.platoId, activo: r.activo,
                primario: r.cocineroPrimarioId ? cocinerosMap[r.cocineroPrimarioId.toString()] || null : null,
                backups: enriquecerBackups(r.backups),
                maxMismoPlato: r.maxMismoPlato, estrategia: r.estrategia, notas: r.notas
            })),
            matrizCategorias: (p.reglasPorCategoria || []).map(r => ({
                categoria: r.categoria, activo: r.activo,
                primario: r.cocineroPrimarioId ? cocinerosMap[r.cocineroPrimarioId.toString()] || null : null,
                backups: enriquecerBackups(r.backups),
                maxMismoPlato: r.maxMismoPlato, estrategia: r.estrategia, notas: r.notas
            }))
        }));

        res.json({
            success: true,
            data: {
                habilitada: config.habilitada,
                defaults: config.defaults,
                perfiles,
                calendario: config.calendario
            }
        });
    } catch (error) {
        logger.error('Error al obtener matriz', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================ CRUD Perfiles ============================

/**
 * POST /api/asignacion-automatica/perfiles
 * Crea un perfil. Body: { nombre, descripcion?, color?, activo? }
 */
router.post('/asignacion-automatica/perfiles', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { perfilId, config } = await asignacionRepository.crearPerfil(req.body || {}, req.admin.id);
        logger.info('Perfil de asignación creado', { perfilId, nombre: req.body.nombre, modificadoPor: req.admin.id });
        // data = documento completo (misma forma que PUT/DELETE) para que el FE pueda
        // hacer siempre `asignacionConfig = res.data` sin nested .config.
        res.json({ success: true, message: 'Perfil creado', data: config, perfilId });
    } catch (error) {
        logger.error('Error al crear perfil', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al crear perfil' });
    }
});

/**
 * PUT /api/asignacion-automatica/perfiles/:id
 * Actualiza un perfil (nombre/descripcion/color/activo y/o reglas).
 */
router.put('/asignacion-automatica/perfiles/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const cambios = { ...req.body };
        // Sanitizar reglas si vienen.
        const rp = sanitizarReglasPlato(cambios.reglasPorPlato);
        if (rp !== undefined) cambios.reglasPorPlato = rp;
        const rc = sanitizarReglasCategoria(cambios.reglasPorCategoria);
        if (rc !== undefined) cambios.reglasPorCategoria = rc;

        const config = await asignacionRepository.actualizarPerfil(req.params.id, cambios, req.admin.id);
        logger.info('Perfil actualizado', { perfilId: req.params.id, modificadoPor: req.admin.id });
        res.json({ success: true, message: 'Perfil actualizado', data: config });
    } catch (error) {
        logger.error('Error al actualizar perfil', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al actualizar perfil' });
    }
});

/**
 * DELETE /api/asignacion-automatica/perfiles/:id
 * Elimina perfil (valida que no haya bloques que lo referencien).
 */
router.delete('/asignacion-automatica/perfiles/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const config = await asignacionRepository.eliminarPerfil(req.params.id, req.admin.id);
        logger.info('Perfil eliminado', { perfilId: req.params.id, modificadoPor: req.admin.id });
        res.json({ success: true, message: 'Perfil eliminado', data: config });
    } catch (error) {
        logger.error('Error al eliminar perfil', { error: error.message });
        if (error.code === 'PERFIL_EN_USO') {
            return res.status(409).json({ success: false, error: error.message, referencias: error.referencias });
        }
        res.status(400).json({ success: false, error: error.message || 'Error al eliminar perfil' });
    }
});

/**
 * POST /api/asignacion-automatica/perfiles/:id/duplicar
 * Clona el perfil.
 */
router.post('/asignacion-automatica/perfiles/:id/duplicar', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { perfilId, config } = await asignacionRepository.duplicarPerfil(req.params.id, req.admin.id);
        logger.info('Perfil duplicado', { origenId: req.params.id, nuevoId: perfilId, modificadoPor: req.admin.id });
        res.json({ success: true, message: 'Perfil duplicado', data: config, perfilId });
    } catch (error) {
        logger.error('Error al duplicar perfil', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al duplicar perfil' });
    }
});

// ============================ CRUD Calendario: bloques ============================

/**
 * POST /api/asignacion-automatica/calendario/bloques
 * Crea una franja. Body: { perfilId, diasSemana, horaInicio, horaFin, etiqueta?, activo? }
 */
router.post('/asignacion-automatica/calendario/bloques', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { bloqueId, config } = await asignacionRepository.crearBloque(req.body || {}, req.admin.id);
        logger.info('Bloque de calendario creado', { bloqueId, perfilId: req.body.perfilId, modificadoPor: req.admin.id });
        // data = documento completo (igual que PUT/DELETE). bloqueId va como sibling.
        // Bug previo: data: { bloqueId, config } hacía que el FE asignara mal
        // asignacionConfig y el calendario "desaparecía" hasta recargar.
        res.json({ success: true, message: 'Franja creada', data: config, bloqueId });
    } catch (error) {
        logger.error('Error al crear bloque', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al crear franja' });
    }
});

/**
 * PUT /api/asignacion-automatica/calendario/bloques/:id
 */
router.put('/asignacion-automatica/calendario/bloques/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const config = await asignacionRepository.actualizarBloque(req.params.id, req.body || {}, req.admin.id);
        logger.info('Bloque de calendario actualizado', { bloqueId: req.params.id, modificadoPor: req.admin.id });
        res.json({ success: true, message: 'Franja actualizada', data: config });
    } catch (error) {
        logger.error('Error al actualizar bloque', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al actualizar franja' });
    }
});

/**
 * DELETE /api/asignacion-automatica/calendario/bloques/:id
 */
router.delete('/asignacion-automatica/calendario/bloques/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const config = await asignacionRepository.eliminarBloque(req.params.id, req.admin.id);
        logger.info('Bloque de calendario eliminado', { bloqueId: req.params.id, modificadoPor: req.admin.id });
        res.json({ success: true, message: 'Franja eliminada', data: config });
    } catch (error) {
        logger.error('Error al eliminar bloque', { error: error.message });
        res.status(400).json({ success: false, error: error.message || 'Error al eliminar franja' });
    }
});

// ============================ Simulador ============================

/**
 * POST /api/asignacion-automatica/simular
 * Dry-run: dado platoId (y opcional categoria/tipo), devuelve a quién iría.
 * v2: acepta perfilId? y enMomento? (ISO).
 */
router.post('/asignacion-automatica/simular', adminAuth, async (req, res) => {
    try {
        const { platoId, categoria, tipo, perfilId, enMomento } = req.body || {};
        if (platoId == null) return res.status(400).json({ success: false, error: 'platoId es requerido' });
        const resultado = await asignacionService.simularAsignacion(platoId, categoria, tipo, { perfilId, enMomento });
        res.json({ success: true, data: resultado });
    } catch (error) {
        logger.error('Error al simular asignación', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
