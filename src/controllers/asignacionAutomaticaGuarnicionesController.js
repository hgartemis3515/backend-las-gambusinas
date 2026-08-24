/**
 * ASIGNACION AUTOMATICA DE GUARNICIONES - CONTROLLER (v1.1)
 * Endpoints espejo de asignacionAutomaticaController.js con reglasPorGuarnicion.
 * Montado en /api/asignacion-automatica-guarniciones.
 */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

const asignacionRepo = require('../repository/asignacionAutomaticaGuarniciones.repository');
const asignacionService = require('../services/asignacionAutomaticaGuarnicionesService');
const { construirCatalogoGuarniciones } = require('../utils/catalogoGuarniciones');

const ESTRATEGIAS_VALIDAS = ['fijo_por_guarnicion', 'fijo_por_grupo', 'cadena_overflow', 'menor_carga', 'round_robin', 'hibrido', 'respetar_estacion', 'batch_mismo_cocinero'];
const MODOS_SIN_CANDIDATO_VALIDOS = ['dejar_sin_asignar', 'pool_supervisor', 'round_robin_estacion'];
const CATEGORIAS_TIEMPO_VALIDAS = ['rapido', 'medio', 'lento', null];

function sanitizarReglasGuarnicion(arr) {
    if (!Array.isArray(arr)) return undefined;
    return arr
        .filter(r => r && r.guarnicionKey && (r.cocineroPrimarioId || (Array.isArray(r.backups) && r.backups.some(b => b && b.cocineroId))))
        .map(r => ({
            guarnicionKey: String(r.guarnicionKey).trim().toLowerCase(),
            etiqueta: typeof r.etiqueta === 'string' ? r.etiqueta.slice(0, 120) : '',
            activo: r.activo !== false,
            cocineroPrimarioId: r.cocineroPrimarioId || null,
            backups: Array.isArray(r.backups)
                ? r.backups.filter(b => b && b.cocineroId).map((b, i) => ({
                    cocineroId: b.cocineroId,
                    orden: Number.isFinite(b.orden) ? b.orden : i
                })).sort((a, b) => a.orden - b.orden)
                : [],
            maxMismoGuarnicion: Number.isFinite(r.maxMismoGuarnicion) ? Number(r.maxMismoGuarnicion) : null,
            estrategia: ESTRATEGIAS_VALIDAS.includes(r.estrategia) ? r.estrategia : null,
            estacionRecomendada: r.estacionRecomendada ? String(r.estacionRecomendada).trim().slice(0, 40) : null,
            criticaEmplatado: !!r.criticaEmplatado,
            tiempoMedioPreparacion: Number.isFinite(r.tiempoMedioPreparacion) ? Number(r.tiempoMedioPreparacion) : null,
            categoriaTiempo: CATEGORIAS_TIEMPO_VALIDAS.includes(r.categoriaTiempo) ? r.categoriaTiempo : null,
            notas: typeof r.notas === 'string' ? r.notas.slice(0, 500) : ''
        }));
}

function sanitizarReglasGrupo(arr) {
    if (!Array.isArray(arr)) return undefined;
    return arr
        .filter(r => r && r.grupo && (r.cocineroPrimarioId || (Array.isArray(r.backups) && r.backups.some(b => b && b.cocineroId))))
        .map(r => ({
            grupo: String(r.grupo).trim(),
            activo: r.activo !== false,
            cocineroPrimarioId: r.cocineroPrimarioId || null,
            backups: Array.isArray(r.backups)
                ? r.backups.filter(b => b && b.cocineroId).map((b, i) => ({
                    cocineroId: b.cocineroId,
                    orden: Number.isFinite(b.orden) ? b.orden : i
                })).sort((a, b) => a.orden - b.orden)
                : [],
            maxMismoGuarnicion: Number.isFinite(r.maxMismoGuarnicion) ? Number(r.maxMismoGuarnicion) : null,
            estrategia: ESTRATEGIAS_VALIDAS.includes(r.estrategia) ? r.estrategia : null,
            estacionRecomendada: r.estacionRecomendada ? String(r.estacionRecomendada).trim().slice(0, 40) : null,
            notas: typeof r.notas === 'string' ? r.notas.slice(0, 500) : ''
        }));
}

function sanitizarDefaults(d) {
    if (!d || typeof d !== 'object') return undefined;
    const out = {};
    if (Number.isFinite(d.maxMismoGuarnicionPorCocinero)) out.maxMismoGuarnicionPorCocinero = Number(d.maxMismoGuarnicionPorCocinero);
    if (Number.isFinite(d.maxUnidadesTotalesEnCurso)) out.maxUnidadesTotalesEnCurso = Number(d.maxUnidadesTotalesEnCurso);
    if (MODOS_SIN_CANDIDATO_VALIDOS.includes(d.modoSinCandidato)) out.modoSinCandidato = d.modoSinCandidato;
    if (typeof d.soloCocinerosConectados === 'boolean') out.soloCocinerosConectados = d.soloCocinerosConectados;
    if (typeof d.respetarZonas === 'boolean') out.respetarZonas = d.respetarZonas;
    if (typeof d.priorizarEstacion === 'boolean') out.priorizarEstacion = d.priorizarEstacion;
    if (typeof d.agruparBatchs === 'boolean') out.agruparBatchs = d.agruparBatchs;
    if (ESTRATEGIAS_VALIDAS.includes(d.estrategiaDefault)) out.estrategiaDefault = d.estrategiaDefault;
    return out;
}

// ---------------------------- Endpoints ----------------------------

function calcularPerfilActivoAhora(config) {
    const r = asignacionService.resolverPerfilActivo(config, asignacionService.nowLima());
    if (!r.perfil) return { perfilId: null, nombre: null, bloqueId: null, horaInicio: null, horaFin: null, motivo: r.motivo };
    return {
        perfilId: r.perfil.id,
        nombre: r.perfil.nombre,
        bloqueId: r.bloque?.id || null,
        horaInicio: r.bloque?.horaInicio || null,
        horaFin: r.bloque?.horaFin || null,
        motivo: r.motivo
    };
}

router.get('/asignacion-automatica-guarniciones', adminAuth, async (req, res) => {
    try {
        const config = await asignacionRepo.obtenerConfiguracion();
        const perfilActivoAhora = calcularPerfilActivoAhora(config);
        res.json({ success: true, data: config, perfilActivoAhora });
    } catch (error) {
        logger.error('Error al obtener asignación de guarniciones', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/asignacion-automatica-guarniciones/catalogo', adminAuth, async (req, res) => {
    try {
        const ComplementoPlantilla = require('../database/models/complementoPlantilla.model');
        const { listarPlatos } = require('../repository/plato.repository');
        const [plantillas, docs] = await Promise.all([
            ComplementoPlantilla.find({ activo: { $ne: false } }).lean(),
            listarPlatos()
        ]);
        const platos = (docs || [])
            .map((d) => (d && typeof d.toObject === 'function' ? d.toObject() : d))
            .filter((p) => p && p.isActive !== false);
        const { items, grupos } = construirCatalogoGuarniciones(plantillas, platos);
        res.json({ success: true, data: { items, grupos } });
    } catch (error) {
        logger.error('Error al obtener catálogo de guarniciones', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/asignacion-automatica-guarniciones', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { habilitada, defaults, perfiles, calendario } = req.body;
        const update = {};
        if (typeof habilitada === 'boolean') update.habilitada = habilitada;
        const def = sanitizarDefaults(defaults);
        if (def) update.defaults = def;
        // perfiles y calendario se gestionan por endpoints propios; no sobreescribir aquí salvo defaults/habilitada.
        const actualizado = await asignacionRepo.actualizarConfiguracion(update, req.admin?.id);
        logger.info('Configuración global de asignación de guarniciones actualizada', { modificadoPor: req.admin?.id });
        res.json({ success: true, data: actualizado });
    } catch (error) {
        logger.error('Error al guardar asignación de guarniciones', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/asignacion-automatica-guarniciones/toggle', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { habilitada } = req.body;
        const actualizado = await asignacionRepo.toggleHabilitada(!!habilitada, req.admin?.id);
        logger.info('Toggle asignación de guarniciones', { habilitada: !!habilitada, modificadoPor: req.admin?.id });
        res.json({ success: true, data: actualizado });
    } catch (error) {
        logger.error('Error al toggle asignación de guarniciones', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

// Perfiles
router.post('/asignacion-automatica-guarniciones/perfiles', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { config, perfilId } = await asignacionRepo.crearPerfil(req.body, req.admin?.id);
        res.json({ success: true, data: config, perfilId });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.put('/asignacion-automatica-guarniciones/perfiles/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const cambios = { ...req.body };
        if (Array.isArray(req.body.reglasPorGuarnicion)) cambios.reglasPorGuarnicion = sanitizarReglasGuarnicion(req.body.reglasPorGuarnicion);
        if (Array.isArray(req.body.reglasPorGrupo)) cambios.reglasPorGrupo = sanitizarReglasGrupo(req.body.reglasPorGrupo);
        const actualizado = await asignacionRepo.actualizarPerfil(req.params.id, cambios, req.admin?.id);
        res.json({ success: true, data: actualizado });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.delete('/asignacion-automatica-guarniciones/perfiles/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const actualizado = await asignacionRepo.eliminarPerfil(req.params.id, req.admin?.id);
        res.json({ success: true, data: actualizado });
    } catch (error) {
        const status = error.code === 'PERFIL_EN_USO' ? 409 : 400;
        res.status(status).json({ success: false, error: error.message, referencias: error.referencias });
    }
});

router.post('/asignacion-automatica-guarniciones/perfiles/:id/duplicar', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const { config, perfilId } = await asignacionRepo.duplicarPerfil(req.params.id, req.admin?.id);
        res.json({ success: true, data: config, perfilId });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Calendario
router.post('/asignacion-automatica-guarniciones/calendario/bloques', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const actualizado = await asignacionRepo.crearBloque(req.body, req.admin?.id);
        res.json({ success: true, data: actualizado });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.put('/asignacion-automatica-guarniciones/calendario/bloques/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const actualizado = await asignacionRepo.actualizarBloque(req.params.id, req.body, req.admin?.id);
        res.json({ success: true, data: actualizado });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.delete('/asignacion-automatica-guarniciones/calendario/bloques/:id', adminAuth, checkPermission('editar-mozos'), async (req, res) => {
    try {
        const actualizado = await asignacionRepo.eliminarBloque(req.params.id, req.admin?.id);
        res.json({ success: true, data: actualizado });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Simular
router.post('/asignacion-automatica-guarniciones/simular', adminAuth, async (req, res) => {
    try {
        const { grupo, opcion, cocineroPadreId, perfilId, enMomento } = req.body;
        const resultado = await asignacionService.simularAsignacionGuarnicion(grupo, opcion, cocineroPadreId, { perfilId, enMomento });
        res.json({ success: true, data: resultado });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
