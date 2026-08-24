/**
 * ASIGNACION AUTOMATICA DE GUARNICIONES - SERVICE (v1.1)
 * Clon filtrado de asignacionAutomaticaService con reglas adicionales:
 *  §1 excluye cocinero del plato principal.
 *  §2 prefiere estación recomendada (fritura, plancha...).
 *  §3 batchs: misma guarnicionKey → mismo cocinero.
 *  §4 VIP/refire/tiempoLimitado suben prioridad.
 *  §5 carga global por cocinero.
 * No bloquea creación de comanda. Respeta config.cocina.permitirGuarnicionesSeparadas.
 */
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

const AsignacionAutomaticaGuarniciones = require('../database/models/asignacionAutomaticaGuarniciones.model');
const ConfigCocinero = require('../database/models/configCocinero.model');
const ConfigSistema = require('../database/models/configuracionSistema.model');
const { agrupacionGuarnicionesOn } = require('../utils/autocerrarGuarniciones');
const { construirCatalogoGuarniciones, nombreOpcionComplemento } = require('../utils/catalogoGuarniciones');
const Zona = require('../database/models/zona.model');

const Comanda = mongoose.model('Comanda') || require('../database/models/comanda.model');
const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');
const { getCocineroInfo } = require('../utils/cocineroInfo');

const ESTADOS_EN_CURSO = ['pedido', 'en_espera'];
const TZ = 'America/Lima';

function nowLima() { return moment().tz(TZ); }
function compararHHmm(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function horaEnRango(hhmm, ini, fin) { return compararHHmm(hhmm, ini) >= 0 && compararHHmm(hhmm, fin) < 0; }

function normalizarGuarnicionKey(grupo, opcion) {
    const g = (grupo || '').toString().trim().toLowerCase();
    const o = (opcion || '').toString().trim().toLowerCase();
    return `${g}::${o}`;
}
function etiquetaGuarnicion(grupo, opcion) {
    return `${(grupo || '').toString().trim()} :: ${(opcion || '').toString().trim()}`;
}

function resolverPerfilActivo(config, momento) {
    if (!config || !config.habilitada) return { perfil: null, bloque: null, motivo: 'deshabilitada' };
    const bloques = (config.calendario && Array.isArray(config.calendario.bloques)) ? config.calendario.bloques : [];
    if (bloques.length === 0) return { perfil: null, bloque: null, motivo: 'sin_franja_activa' };
    const m = momento || nowLima();
    const dia = m.day();
    const hhmm = m.format('HH:mm');
    const cands = bloques.filter(b => b.activo !== false && Array.isArray(b.diasSemana) && b.diasSemana.includes(dia) && horaEnRango(hhmm, b.horaInicio, b.horaFin));
    if (cands.length === 0) return { perfil: null, bloque: null, motivo: 'sin_franja_activa', dia, hhmm };
    cands.sort((a, b) => {
        const d = a.diasSemana.length - b.diasSemana.length;
        if (d !== 0) return d;
        const i = compararHHmm(b.horaInicio, a.horaInicio);
        if (i !== 0) return i;
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
    });
    const bloque = cands[0];
    const perfil = (config.perfiles || []).find(p => p.id === bloque.perfilId && p.activo !== false);
    if (!perfil) return { perfil: null, bloque, motivo: 'perfil_inactivo_o_inexistente', dia, hhmm };
    return { perfil, bloque, motivo: 'ok', dia, hhmm };
}

async function contarGuarnicionesEnCurso(cocineroId, guarnicionKey = null) {
    const oid = new mongoose.Types.ObjectId(cocineroId);
    const pipeline = [
        { $match: { IsActive: true, 'platos.complementosSeleccionados.procesandoPor.cocineroId': oid, 'platos.complementosSeleccionados.estadoCocina': { $in: ESTADOS_EN_CURSO } } },
        { $unwind: '$platos' },
        { $unwind: '$platos.complementosSeleccionados' },
        { $match: { 'platos.complementosSeleccionados.procesandoPor.cocineroId': oid, 'platos.complementosSeleccionados.estadoCocina': { $in: ESTADOS_EN_CURSO } } }
    ];
    if (guarnicionKey) pipeline.push({ $match: { 'platos.complementosSeleccionados.guarnicionKey': guarnicionKey } });
    pipeline.push({
        $group: {
            _id: {
                $ifNull: [
                    '$platos.complementosSeleccionados.asignacionMeta.grupoId',
                    '$platos.complementosSeleccionados._id'
                ]
            }
        }
    });
    pipeline.push({ $group: { _id: null, total: { $sum: 1 } } });
    const res = await Comanda.aggregate(pipeline);
    return res.length > 0 ? res[0].total : 0;
}

async function mapaGuarnicionesEnCursoPorCocinero(cocineroIds) {
    if (!cocineroIds.length) return {};
    const oids = cocineroIds.map(id => new mongoose.Types.ObjectId(id));
    const res = await Comanda.aggregate([
        { $match: { IsActive: true, 'platos.complementosSeleccionados.procesandoPor.cocineroId': { $in: oids }, 'platos.complementosSeleccionados.estadoCocina': { $in: ESTADOS_EN_CURSO } } },
        { $unwind: '$platos' },
        { $unwind: '$platos.complementosSeleccionados' },
        { $match: { 'platos.complementosSeleccionados.procesandoPor.cocineroId': { $in: oids }, 'platos.complementosSeleccionados.estadoCocina': { $in: ESTADOS_EN_CURSO } } },
        { $group: {
            _id: {
                cocinero: '$platos.complementosSeleccionados.procesandoPor.cocineroId',
                unidad: { $ifNull: [
                    '$platos.complementosSeleccionados.asignacionMeta.grupoId',
                    '$platos.complementosSeleccionados._id'
                ] }
            }
        } },
        { $group: { _id: '$_id.cocinero', total: { $sum: 1 } } }
    ]);
    const map = {};
    res.forEach(r => { map[r._id.toString()] = r.total; });
    return map;
}

async function cocineroAceptaAutoAsignacion(cocineroId, ahora = null) {
    const ahoraMoment = ahora || moment().tz(TZ).toDate();
    const cfg = await ConfigCocinero.findOne({ usuarioId: cocineroId }).select('autoAsignacion');
    if (!cfg) return { acepta: true, maxPlatosTotales: null };
    const auto = cfg.autoAsignacion || {};
    if (auto.acepta === false) return { acepta: false, maxPlatosTotales: auto.maxPlatosTotales };
    if (auto.pausadoHasta && new Date(auto.pausadoHasta) > new Date(ahoraMoment)) {
        return { acepta: false, maxPlatosTotales: auto.maxPlatosTotales };
    }
    return { acepta: true, maxPlatosTotales: auto.maxPlatosTotales };
}

async function cocineroConectado(cocineroId) {
    const mo = await Mozos.findById(cocineroId).select('activo enTurno');
    if (!mo || mo.activo === false) return false;
    return true;
}

async function cocineroVePlatoEnZonas(cocineroId, plato) {
    const cocinero = await Mozos.findById(cocineroId).select('zonaIds');
    if (!cocinero || !cocinero.zonaIds || cocinero.zonaIds.length === 0) return true;
    const zonas = await Zona.find({ _id: { $in: cocinero.zonaIds }, activo: { $ne: false } }).lean();
    if (zonas.length === 0) return true;
    return zonas.some(z => new Zona(z).debeMostrarPlato(plato));
}

function cocineroTieneEstacion(cocinero, estacion) {
    if (!estacion) return true;
    const estaciones = cocinero.estaciones || [];
    if (!Array.isArray(estaciones) || estaciones.length === 0) return true; // general
    return estaciones.includes(estacion) || estaciones.includes('general');
}

function encontrarReglaGuarnicion(perfil, grupo, opcion, guarnicionKey) {
    const key = guarnicionKey || normalizarGuarnicionKey(grupo, opcion);
    const reglaG = (perfil.reglasPorGuarnicion || []).find(r => r.guarnicionKey === key && r.activo !== false);
    if (reglaG && reglaG.cocineroPrimarioId) return { tipo: 'guarnicion', regla: reglaG };
    if (grupo) {
        const reglaGr = (perfil.reglasPorGrupo || []).find(r => r.grupo === grupo && r.activo !== false);
        if (reglaGr && reglaGr.cocineroPrimarioId) return { tipo: 'grupo', regla: reglaGr };
    }
    return null;
}

function construirCandidatos(regla) {
    const cands = [];
    if (regla.cocineroPrimarioId) cands.push({ cocineroId: regla.cocineroPrimarioId.toString(), esPrimario: true, orden: 0 });
    const backs = (regla.backups || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)).map(b => ({ cocineroId: b.cocineroId.toString(), esPrimario: false, orden: b.orden || 1 }));
    return cands.concat(backs);
}

function detectarBatchsEnComanda(comanda) {
    const map = {};
    (comanda.platos || []).forEach((plato, pi) => {
        (plato.complementosSeleccionados || []).forEach((c, ci) => {
            if (c.procesandoPor && c.procesandoPor.cocineroId) return;
            const key = normalizarGuarnicionKey(c.grupo, c.opcion);
            if (!map[key]) map[key] = [];
            map[key].push({ platoIndex: pi, compIndex: ci });
        });
    });
    const batchs = {};
    for (const [key, items] of Object.entries(map)) if (items.length >= 2) batchs[key] = items;
    return batchs;
}

function prioridadUnidadTrabajo(comanda) {
    const et = comanda.etiquetasPrioridad || {};
    if (et.refire) return 3;       // re-fire siempre al frente
    if (et.vip) return 2;
    if (et.tiempoLimitado) return 1;
    return 0;
}

// ---------------------------- Snapshot de metadata de regla ----------------------------

/**
 * Snapshot ligero de la regla para guardar en el subdoc del complemento.
 * Permite pintar la tarjeta igual aunque luego se edite la regla.
 */
function snapshotReglaGuarnicion(regla) {
    return {
        criticaEmplatado: !!(regla && regla.criticaEmplatado),
        estacionRecomendada: regla && regla.estacionRecomendada ? String(regla.estacionRecomendada).trim() : null,
        tiempoMedioPreparacion: regla && Number.isFinite(regla.tiempoMedioPreparacion) ? Number(regla.tiempoMedioPreparacion) : null
    };
}

// ---------------------------- Filtro + score de candidato ----------------------------

/**
 * Filtra un candidato. Devuelve null si no aplica, o { cocineroId, score, esPrimario }.
 * Score más alto = mejor. Factores:
 *   - primario +100, backups -orden
 *   - estación recomendada coincide: +30 (si priorizarEstacion)
 *   - batch: si este cocinero ya está haciendo la misma guarnicionKey, +40 (§3)
 *   - carga: -totalEnCurso (menos carga = mejor)
 */
async function filtrarCandidatoGuarnicion(
    cand, config, plato, guarnicionKey, cocineroPadreId, estacionRecomendada,
    cacheConectado, cacheCargaTot, cacheCocinero, batchCocineroPreferido
) {
    const { soloCocinerosConectados, respetarZonas, maxMismoGuarnicionPorCocinero, maxUnidadesTotalesEnCurso, priorizarEstacion } = config.defaults;

    // §1: excluir SIEMPRE al cocinero del plato principal.
    if (cocineroPadreId && cand.cocineroId === cocineroPadreId.toString()) return null;

    const opt = await cocineroAceptaAutoAsignacion(cand.cocineroId);
    if (!opt.acepta) return null;

    if (soloCocinerosConectados) {
        let conectado = cacheConectado[cand.cocineroId];
        if (conectado === undefined) {
            conectado = await cocineroConectado(cand.cocineroId);
            cacheConectado[cand.cocineroId] = conectado;
        }
        if (!conectado) return null;
    }

    if (respetarZonas) {
        const ve = await cocineroVePlatoEnZonas(cand.cocineroId, plato);
        if (!ve) return null;
    }

    let total = cacheCargaTot[cand.cocineroId];
    if (total === undefined) {
        total = await contarGuarnicionesEnCurso(cand.cocineroId);
        cacheCargaTot[cand.cocineroId] = total;
    }
    const maxTotal = opt.maxPlatosTotales || maxUnidadesTotalesEnCurso;
    if (total >= maxTotal) return null;

    const mismoGuarnicion = await contarGuarnicionesEnCurso(cand.cocineroId, guarnicionKey);
    if (mismoGuarnicion >= maxMismoGuarnicionPorCocinero) return null;

    let score = cand.esPrimario ? 100 : (50 - cand.orden);

    // §2: estación recomendada
    let cocinero = cacheCocinero[cand.cocineroId];
    if (!cocinero) {
        cocinero = await Mozos.findById(cand.cocineroId).select('estaciones').lean();
        cacheCocinero[cand.cocineroId] = cocinero;
    }
    if (priorizarEstacion && estacionRecomendada) {
        if (cocineroTieneEstacion(cocinero, estacionRecomendada)) {
            score += 30;
        } else {
            score -= 20; // override posible pero penalizado (operación manda)
        }
    }

    // §3: batch — si ya está haciendo la misma guarnicionKey, preferirlo
    if (batchCocineroPreferido && batchCocineroPreferido === cand.cocineroId) {
        score += 40;
    }

    // §5: carga global — penaliza carga alta
    score -= total;

    return { cocineroId: cand.cocineroId, score, esPrimario: cand.esPrimario };
}

// ---------------------------- Escritura condicional ----------------------------

/**
 * Escribe procesandoPor + asignacionMeta en el subdoc del complemento.
 * Condicional: solo si NO tiene ya procesandoPor (evita pisar toma manual).
 */
async function asignarGuarnicionInterna(comandaId, platoIndex, compIndex, cocineroId, metaOrigen, metaRegla, batchId, ids = {}, grupoId = null) {
    const info = await getCocineroInfo(cocineroId);
    if (!info.cocineroId) return false;
    const cocineroInfo = {
        ...info,
        timestamp: moment().tz(TZ).toDate()
    };
    const set = {
        [`platos.${platoIndex}.complementosSeleccionados.${compIndex}.procesandoPor`]: cocineroInfo,
        [`platos.${platoIndex}.complementosSeleccionados.${compIndex}.asignacionMeta`]: {
            origen: metaOrigen,
            regla: metaRegla,
            batchId: batchId || null,
            grupoId: grupoId || null,
            timestamp: moment().tz(TZ).toDate()
        },
        [`platos.${platoIndex}.complementosSeleccionados.${compIndex}.estadoCocina`]: 'en_espera',
        updatedAt: moment().tz(TZ).toDate()
    };
    const res = await Comanda.updateOne(
        {
            _id: comandaId,
            [`platos.${platoIndex}.complementosSeleccionados.${compIndex}.procesandoPor.cocineroId`]: { $eq: null }
        },
        { $set: set }
    );
    const ok = (res.modifiedCount || res.nModified || 0) > 0;
    if (ok && global.emitPlatoProcesando && ids.platoId && ids.complementoId) {
        try {
            await global.emitPlatoProcesando(
                String(comandaId),
                String(ids.platoId),
                cocineroInfo,
                { complementoId: String(ids.complementoId), tipo: 'guarnicion', estadoCocina: 'en_espera' }
            );
        } catch (e) {
            logger.warn('Socket emit falló en auto-asignación guarnición', {
                comandaId: String(comandaId), error: e.message
            });
        }
    }
    return ok;
}

// ---------------------------- API pública ----------------------------

/**
 * Asigna guarniciones nuevas de una comanda. Se llama DESPUÉS de
 * asignarPlatosNuevos (para conocer el cocinero del principal).
 *
 * @param {Object} comandaPop - comanda populada (platos.plato con id/categoria/tipo/nombre)
 * @returns {Promise<{asignados, noAsignados, motivo}>}
 */
async function asignarGuarnicionesNuevas(comandaPop) {
    try {
        if (!comandaPop || !comandaPop.platos || comandaPop.platos.length === 0) {
            return { asignados: 0, noAsignados: 0, motivo: 'sin_platos' };
        }

        // Flag global: si está OFF, no hacemos nada (no hay split, no hay motor).
        const cfgSistema = await ConfigSistema.obtenerConfiguracion();
        const flagGuarniciones = cfgSistema?.cocina?.permitirGuarnicionesSeparadas !== false;
        if (!flagGuarniciones) {
            return { asignados: 0, noAsignados: 0, motivo: 'flag_global_off' };
        }
        const agrupacionOn = agrupacionGuarnicionesOn(cfgSistema?.cocina);

        const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
        if (!config.habilitada) {
            return { asignados: 0, noAsignados: 0, motivo: 'deshabilitada' };
        }

        const { perfil, motivo } = resolverPerfilActivo(config);
        if (!perfil) {
            return { asignados: 0, noAsignados: 0, motivo };
        }

        const batchs = config.defaults.agruparBatchs ? detectarBatchsEnComanda(comandaPop) : {};
        const prioridadComanda = prioridadUnidadTrabajo(comandaPop);
        const cacheConectado = {};
        const cacheCargaTot = {};
        const cacheCocinero = {};
        let asignados = 0;
        let noAsignados = 0;

        // Recorremos platos → complementos. Para cada uno sin procesandoPor, elegimos cocinero.
        for (let pi = 0; pi < comandaPop.platos.length; pi++) {
            const plato = comandaPop.platos[pi];
            if (plato.eliminado || plato.anulado) continue;
            const comps = plato.complementosSeleccionados || [];
            if (!comps.length) continue;

            const cocineroPadreId = plato.procesandoPor && plato.procesandoPor.cocineroId
                ? plato.procesandoPor.cocineroId.toString() : null;
            const platoRef = plato.plato || plato;

            if (agrupacionOn) {
                const pendientes = [];
                for (let ci = 0; ci < comps.length; ci++) {
                    const comp = comps[ci];
                    if (!comp || comp.eliminado) continue;
                    if (comp.procesandoPor && comp.procesandoPor.cocineroId) continue;
                    if (comp.estadoCocina === 'recoger') continue;
                    pendientes.push({ ci, comp });
                }
                if (!pendientes.length) continue;

                let encontrada = null;
                let guarnicionKeyElegida = '';
                for (const p of pendientes) {
                    const key = normalizarGuarnicionKey(p.comp.grupo, p.comp.opcion);
                    const reg = encontrarReglaGuarnicion(perfil, p.comp.grupo, p.comp.opcion, key);
                    if (reg) {
                        encontrada = reg;
                        guarnicionKeyElegida = key;
                        break;
                    }
                }
                if (!encontrada) {
                    noAsignados += pendientes.length;
                    continue;
                }

                const candidatos = construirCandidatos(encontrada.regla);
                const evaluados = [];
                for (const cand of candidatos) {
                    const ev = await filtrarCandidatoGuarnicion(
                        cand, config, platoRef, guarnicionKeyElegida, cocineroPadreId,
                        encontrada.regla.estacionRecomendada,
                        cacheConectado, cacheCargaTot, cacheCocinero, null
                    );
                    if (ev) evaluados.push(ev);
                }
                if (evaluados.length === 0) {
                    noAsignados += pendientes.length;
                    continue;
                }
                if (prioridadComanda > 0) {
                    evaluados.forEach(e => { e.score += prioridadComanda * 10; });
                }
                evaluados.sort((a, b) => b.score - a.score);
                const elegido = evaluados[0];
                const grupoId = String(plato._id || '');
                let okGrupo = 0;
                for (const p of pendientes) {
                    const ok = await asignarGuarnicionInterna(
                        comandaPop._id, pi, p.ci, elegido.cocineroId,
                        'auto', 'grupo', null,
                        { platoId: plato._id, complementoId: p.comp._id },
                        grupoId
                    );
                    if (ok) okGrupo++;
                }
                if (okGrupo > 0) {
                    asignados += 1;
                    logger.info('Auto-asignación grupo guarniciones OK', {
                        comandaId: comandaPop._id?.toString(),
                        platoId: grupoId, cocineroId: elegido.cocineroId, extras: okGrupo
                    });
                } else {
                    noAsignados += pendientes.length;
                }
                continue;
            }

            for (let ci = 0; ci < comps.length; ci++) {
                const comp = comps[ci];
                if (comp.procesandoPor && comp.procesandoPor.cocineroId) continue; // ya asignada
                if (comp.estadoCocina === 'recoger') continue;

                const guarnicionKey = normalizarGuarnicionKey(comp.grupo, comp.opcion);
                const encontrada = encontrarReglaGuarnicion(perfil, comp.grupo, comp.opcion, guarnicionKey);
                if (!encontrada) {
                    noAsignados++;
                    continue;
                }

                // §3: ¿hay batch de esta guarnicionKey? Si ya asignamos una a un cocinero,
                // preferimos ese para el resto del batch.
                const batchItems = batchs[guarnicionKey];
                let batchCocineroPreferido = null;
                let batchId = null;
                if (batchItems && batchItems.length >= 2) {
                    batchId = `batch-${guarnicionKey.replace(/[^a-z0-9]/g, '-')}-${comandaPop._id?.toString().slice(-6)}`;
                    // Si ya asignamos alguna del batch, reusamos su cocinero (cacheado en cacheCocinero).
                    // Lo detectamos vía cacheCargaTot: si un cocinero ya tiene +1 de esta key, lo preferimos.
                }

                const candidatos = construirCandidatos(encontrada.regla);
                const evaluados = [];
                for (const cand of candidatos) {
                    const ev = await filtrarCandidatoGuarnicion(
                        cand, config, platoRef, guarnicionKey, cocineroPadreId,
                        encontrada.regla.estacionRecomendada,
                        cacheConectado, cacheCargaTot, cacheCocinero, batchCocineroPreferido
                    );
                    if (ev) evaluados.push(ev);
                }
                if (evaluados.length === 0) {
                    noAsignados++;
                    continue;
                }

                // §4: prioridad — VIP/refire suben score de todos los candidatos (al frente)
                if (prioridadComanda > 0) {
                    evaluados.forEach(e => { e.score += prioridadComanda * 10; });
                }

                evaluados.sort((a, b) => b.score - a.score);
                const elegido = evaluados[0];

                const ok = await asignarGuarnicionInterna(
                    comandaPop._id, pi, ci, elegido.cocineroId,
                    'auto', encontrada.tipo, batchId,
                    { platoId: plato._id, complementoId: comp._id }
                );
                if (ok) {
                    asignados++;
                    // §3: cachear el cocinero elegido como preferido para el resto del batch
                    if (batchId) batchCocineroPreferido = elegido.cocineroId;
                    logger.info('Auto-asignación guarnición OK', {
                        comandaId: comandaPop._id?.toString(),
                        guarnicionKey, cocineroId: elegido.cocineroId,
                        origen: 'auto', regla: encontrada.tipo, batchId
                    });
                } else {
                    noAsignados++;
                }
            }
        }

        logger.info('Auto-asignación guarniciones ejecutada', {
            comandaId: comandaPop._id?.toString(), asignados, noAsignados
        });
        return { asignados, noAsignados };
    } catch (error) {
        logger.error('Error en auto-asignación de guarniciones (no bloqueante)', {
            comandaId: comandaPop?._id?.toString(), error: error.message
        });
        return { asignados: 0, noAsignados: 0, error: error.message };
    }
}

/**
 * Dry-run: simula a qué cocinero iría una guarnición SIN escribir.
 */
async function simularAsignacionGuarnicion(grupo, opcion, cocineroPadreId = null, opciones = {}) {
    const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
    if (!config.habilitada) return { habilitada: false, cocineroId: null, mensaje: 'Asignación de guarniciones deshabilitada' };

    let perfilUsado = null;
    if (opciones.perfilId) {
        perfilUsado = (config.perfiles || []).find(p => p.id === opciones.perfilId && p.activo !== false) || null;
        if (!perfilUsado) return { habilitada: true, cocineroId: null, mensaje: 'Perfil no encontrado' };
    } else {
        const r = resolverPerfilActivo(config, opciones.enMomento ? moment(opciones.enMomento).tz(TZ) : null);
        perfilUsado = r.perfil;
        if (!perfilUsado) return { habilitada: true, cocineroId: null, mensaje: r.motivo };
    }

    const guarnicionKey = normalizarGuarnicionKey(grupo, opcion);
    const encontrada = encontrarReglaGuarnicion(perfilUsado, grupo, opcion, guarnicionKey);
    if (!encontrada) return { habilitada: true, cocineroId: null, mensaje: 'Sin regla para esta guarnición' };

    const candidatos = construirCandidatos(encontrada.regla);
    const cacheConectado = {}, cacheCargaTot = {}, cacheCocinero = {};
    const evaluados = [];
    for (const cand of candidatos) {
        const ev = await filtrarCandidatoGuarnicion(
            cand, config, null, guarnicionKey, cocineroPadreId,
            encontrada.regla.estacionRecomendada,
            cacheConectado, cacheCargaTot, cacheCocinero, null
        );
        if (ev) evaluados.push(ev);
    }
    if (evaluados.length === 0) return { habilitada: true, cocineroId: null, mensaje: 'Sin candidato válido (¿excluido por ser cocinero del principal?)' };
    evaluados.sort((a, b) => b.score - a.score);
    return {
        habilitada: true,
        cocineroId: evaluados[0].cocineroId,
        score: evaluados[0].score,
        regla: encontrada.tipo,
        estacionRecomendada: encontrada.regla.estacionRecomendada || null,
        candidatos: evaluados
    };
}

module.exports = {
    normalizarGuarnicionKey,
    etiquetaGuarnicion,
    nombreOpcionComplemento,
    construirCatalogoGuarniciones,
    resolverPerfilActivo,
    contarGuarnicionesEnCurso,
    mapaGuarnicionesEnCursoPorCocinero,
    cocineroAceptaAutoAsignacion,
    cocineroConectado,
    cocineroVePlatoEnZonas,
    cocineroTieneEstacion,
    encontrarReglaGuarnicion,
    construirCandidatos,
    detectarBatchsEnComanda,
    prioridadUnidadTrabajo,
    snapshotReglaGuarnicion,
    asignarGuarnicionesNuevas,
    simularAsignacionGuarnicion,
    ESTADOS_EN_CURSO,
    TZ,
    nowLima
};
