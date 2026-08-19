/**
 * COCINEROS REPOSITORY
 * Acceso a datos para gestión de cocineros y su configuración KDS
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');
const ConfigCocinero = require('../database/models/configCocinero.model');
const PerfilVerCocina = require('../database/models/perfilVerCocina.model');
const Mozos = require('../database/models/mozos.model');
const Comanda = require('../database/models/comanda.model');
const logger = require('../utils/logger');

const SLA_COCINA_MINUTOS = 15;
const ESTADOS_PLATO_COCINA = ['pendiente', 'pedido', 'en_espera', 'recoger', 'salio', 'entregado', 'pagado'];

function filtroTipoPerfil(tipo) {
    if (tipo === 'tablas_kds') return { tipo: 'tablas_kds' };
    return {
        $or: [
            { tipo: 'ver_cocina' },
            { tipo: { $exists: false } },
            { tipo: null },
            { tipo: '' },
        ],
    };
}

let indiceTipoPerfilAjustado = false;
async function asegurarIndiceTipoPerfil() {
    if (indiceTipoPerfilAjustado) return;
    indiceTipoPerfilAjustado = true;
    try {
        const indexes = await PerfilVerCocina.collection.indexes();
        const viejo = indexes.find((i) => i.name === 'nombre_1' && i.unique);
        if (viejo) await PerfilVerCocina.collection.dropIndex('nombre_1');
    } catch (e) {
        logger.warn('No se pudo ajustar índice nombre_1 de perfilVerCocina', { error: e.message });
    }
}
/** Plato aún en cocina (asignado / tomándose). Incluye pendiente por aprobación o toma temprana. */
const ESTADOS_PLATO_EN_CURSO = ['pendiente', 'pedido', 'en_espera'];
const ESTADOS_GUARNICION_EN_CURSO = ['pedido', 'en_espera'];
const STATUS_COMANDA_CERRADA = ['pagado', 'completado', 'cancelado'];

function clauseIdCocinero(usuarioId) {
    if (!usuarioId) return { $ne: null, $exists: true };
    const oid = toObjectIdSafe(usuarioId);
    if (!oid) return usuarioId;
    return { $in: [oid, String(usuarioId)] };
}

function elemPlatoEnCurso(usuarioId) {
    return {
        eliminado: { $ne: true },
        anulado: { $ne: true },
        estado: { $in: ESTADOS_PLATO_EN_CURSO },
        'procesandoPor.cocineroId': clauseIdCocinero(usuarioId)
    };
}

function elemGuarnicionEnCurso(usuarioId) {
    return {
        eliminado: { $ne: true },
        estadoCocina: { $nin: ['recoger'] },
        'procesandoPor.cocineroId': clauseIdCocinero(usuarioId)
    };
}

/** Comanda con ≥1 plato asignado en cocina (no falla si otros platos están libres). */
function matchComandaConPlatoEnCurso(usuarioId) {
    return {
        ...matchComandaAbierta(),
        platos: { $elemMatch: elemPlatoEnCurso(usuarioId) }
    };
}

function matchComandaConGuarnicionEnCurso(usuarioId) {
    return {
        ...matchComandaAbierta(),
        platos: {
            $elemMatch: {
                eliminado: { $ne: true },
                anulado: { $ne: true },
                complementosSeleccionados: { $elemMatch: elemGuarnicionEnCurso(usuarioId) }
            }
        }
    };
}

function matchCocineroTrasUnwind(path, usuarioId) {
    return { [path]: clauseIdCocinero(usuarioId) };
}

function matchComandaAbierta() {
    return {
        eliminada: { $ne: true },
        status: { $nin: STATUS_COMANDA_CERRADA }
    };
}

function agregarBloqueACocinero(porCocinero, row) {
    if (!row?.cocineroId) return;
    const key = String(row.cocineroId);
    if (!porCocinero.has(key)) {
        porCocinero.set(key, {
            cocineroId: key,
            cocineroNombre: row.cocineroNombre || 'Cocinero',
            cocineroAlias: row.cocineroAlias || row.cocineroNombre || 'Cocinero',
            bloques: []
        });
    }
    const { cocineroId: _id, cocineroNombre: _n, cocineroAlias: _a, ...bloque } = row;
    porCocinero.get(key).bloques.push(bloque);
}

function nombreGuarnicionEnCurso(row) {
    const op = row.opcion;
    const opcionTxt = Array.isArray(op) ? op.filter(Boolean).join(', ') : (op || row.grupo || 'Guarnición');
    const padre = row.platoNombrePadre || 'Plato';
    return `🥗 ${opcionTxt} (${padre})`;
}

function toObjectIdSafe(id) {
    try { return new mongoose.Types.ObjectId(String(id)); }
    catch { return null; }
}

function platoListoCocinaHist(p) {
    if (!p) return false;
    if (p.tiempos?.recoger) return true;
    const est = String(p.estado || '').toLowerCase();
    return ['recoger', 'salio', 'entregado', 'pagado'].includes(est);
}

/** Plato realmente tomado por un cocinero (procesando o ya procesado). */
function platoTomadoPorCocinero(p, cocineroId = null) {
    if (!p || p.eliminado || p.anulado) return false;
    const procId = p.procesandoPor?.cocineroId || p.procesadoPor?.cocineroId;
    if (!procId) return false;
    if (cocineroId && String(procId) !== String(cocineroId)) return false;
    return true;
}

function cocineroDePlato(p) {
    if (p?.procesandoPor?.cocineroId) {
        return {
            cocineroId: p.procesandoPor.cocineroId,
            cocineroNombre: p.procesandoPor.nombre || 'Cocinero',
            cocineroAlias: p.procesandoPor.alias || p.procesandoPor.nombre || 'Cocinero'
        };
    }
    if (p?.procesadoPor?.cocineroId) {
        return {
            cocineroId: p.procesadoPor.cocineroId,
            cocineroNombre: p.procesadoPor.nombre || 'Cocinero',
            cocineroAlias: p.procesadoPor.alias || p.procesadoPor.nombre || 'Cocinero'
        };
    }
    return null;
}

/**
 * Momento en que el cocinero TOMÓ / se le asignó el plato.
 * No usa pedido/en_espera (eso es entrada a cocina, no asignación).
 */
function tomadoEnPlato(p) {
    if (p?.procesandoPor?.timestamp) return p.procesandoPor.timestamp;
    if (p?.asignacionMeta?.timestamp) return p.asignacionMeta.timestamp;
    if (p?.tomadoEn) return p.tomadoEn;
    if (p?.procesadoPor?.tomadoEn) return p.procesadoPor.tomadoEn;
    // Legacy pre-v7.3: procesadoPor.timestamp era el de toma
    if (p?.procesadoPor?.timestamp) return p.procesadoPor.timestamp;
    return null;
}

/** Momento en que el plato quedó listo (preparado / recoger). Congela el cronómetro. */
function listoEnPlato(p) {
    if (!p) return null;
    if (p.tiempos?.recoger) return p.tiempos.recoger;
    if (!platoListoCocinaHist(p)) return null;
    return p.tiempos?.salio || p.tiempos?.entregado || p.tiempos?.pagado || p.procesadoPor?.timestamp || null;
}

function flattenGuarnicionesComoUnidades(platos) {
    const rows = [];
    for (const p of platos || []) {
        if (!p || p.eliminado || p.anulado) continue;
        const comps = p.complementosSeleccionados || [];
        for (const c of comps) {
            if (!c || c.eliminado) continue;
            if (!c.procesandoPor?.cocineroId && !c.procesadoPor?.cocineroId) continue;
            const opcion = Array.isArray(c.opcion) ? c.opcion.join(', ') : (c.opcion || 'Guarnición');
            const nombrePadre = p.platoNombre || p.nombre || p.plato?.nombre || 'Plato';
            const listo = c.estadoCocina === 'recoger' || !!c.procesadoPor?.timestamp;
            rows.push({
                esGuarnicion: true,
                nombre: `🥗 ${opcion} (${nombrePadre})`,
                platoNombre: `🥗 ${opcion} (${nombrePadre})`,
                estado: c.estadoCocina || 'pedido',
                cantidad: c.cantidad || 1,
                procesandoPor: c.procesandoPor,
                procesadoPor: c.procesadoPor,
                asignacionMeta: c.asignacionMeta,
                tomadoEn: c.procesandoPor?.timestamp || c.asignacionMeta?.timestamp || c.procesadoPor?.tomadoEn || null,
                listoEn: listo ? (c.procesadoPor?.timestamp || null) : null,
                tiempos: { recoger: listo ? (c.procesadoPor?.timestamp || null) : null }
            });
        }
    }
    return rows;
}

/**
 * Cronómetro de preparación del plato: tomado (asignación) → listo (recoger).
 * Si aún está en cocina, fin = ahora (vivo). Si ya está listo, se congela en recoger.
 */
function tiempoPrepPlatoSegundos(p, ahora = new Date()) {
    const ini = tomadoEnPlato(p);
    if (!ini) return null;
    const finFijo = listoEnPlato(p);
    const fin = finFijo || (!platoListoCocinaHist(p) ? ahora : null);
    if (!fin) return null;
    return Math.max(0, Math.round((new Date(fin) - new Date(ini)) / 1000));
}

/**
 * Métricas de cocina a nivel comanda (solo platos tomados por cocineros).
 * Cronómetro por plato: asignación (tomadoEn) → listo (recoger).
 * tiempoCocinaSegundos = promedio de prep de los platos (métrica de cocineros).
 */
function calcularMetricasComandaCocina(platos) {
    const ahora = new Date();
    const activos = (platos || []).filter(p => !p.eliminado && !p.anulado);
    if (!activos.length) {
        return {
            tiempoCocinaSegundos: null,
            tiempoPrepPromedioSegundos: null,
            platosListos: 0,
            platosEnCurso: 0,
            platosTotal: 0,
            resumenEstados: {},
            tiemposPlato: []
        };
    }

    let platosListos = 0;
    let platosEnCurso = 0;
    const resumenEstados = {};
    for (const e of ESTADOS_PLATO_COCINA) resumenEstados[e] = 0;
    const tiemposPlato = [];
    let sumaPrep = 0;
    let cuentaPrep = 0;

    for (const p of activos) {
        const est = String(p.estado || 'pedido').toLowerCase();
        if (resumenEstados[est] != null) resumenEstados[est]++;
        else resumenEstados[est] = 1;

        const listo = platoListoCocinaHist(p);
        const seg = tiempoPrepPlatoSegundos(p, ahora);
        if (listo) platosListos++;
        else platosEnCurso++;

        if (seg != null) {
            sumaPrep += seg;
            cuentaPrep++;
            tiemposPlato.push({
                plato: p,
                tomadoEn: tomadoEnPlato(p),
                listoEn: listoEnPlato(p),
                tiempoSegundos: seg,
                estadoRegistro: listo ? 'finalizado' : 'en_curso'
            });
        }
    }

    const tiempoPrepPromedio = cuentaPrep > 0 ? Math.round(sumaPrep / cuentaPrep) : null;

    return {
        tiempoCocinaSegundos: tiempoPrepPromedio,
        tiempoPrepPromedioSegundos: tiempoPrepPromedio,
        platosListos,
        platosEnCurso,
        platosTotal: activos.length,
        resumenEstados,
        tiemposPlato
    };
}

/**
 * Obtener todos los usuarios con rol de cocinero
 */
async function obtenerCocineros(filtros = {}) {
    try {
        const query = { rol: 'cocinero' };
        
        if (filtros.activo !== undefined) {
            query.activo = filtros.activo;
        }
        
        const cocineros = await Mozos.find(query)
            .select('name DNI phoneNumber rol activo zonaIds fotoUrl createdAt')
            .sort({ name: 1 })
            .lean();
        
        // Obtener configuración de cada cocinero
        const cocinerosConConfig = await Promise.all(
            cocineros.map(async (cocinero) => {
                const config = await ConfigCocinero.findOne({ usuarioId: cocinero._id }).lean();
                return {
                    ...cocinero,
                    nombre: cocinero.name,
                    configKDS: config || null,
                    tieneConfiguracion: !!config
                };
            })
        );
        
        return cocinerosConConfig;
    } catch (error) {
        logger.error('Error al obtener cocineros', { error: error.message });
        throw error;
    }
}

/**
 * Obtener un cocinero por ID con su configuración
 */
async function obtenerCocineroPorId(usuarioId) {
    try {
        const cocinero = await Mozos.findById(usuarioId)
            .select('name DNI phoneNumber rol activo createdAt')
            .lean();
        
        if (!cocinero) {
            return null;
        }
        
        const config = await ConfigCocinero.findOne({ usuarioId }).lean();
        
        return {
            ...cocinero,
            configuracion: config || null
        };
    } catch (error) {
        logger.error('Error al obtener cocinero por ID', { error: error.message });
        throw error;
    }
}

/**
 * Obtener configuración KDS de un cocinero
 */
async function obtenerConfigKDS(usuarioId) {
    try {
        let config = await ConfigCocinero.findOne({ usuarioId }).lean();
        
        // Si no existe, crear configuración por defecto
        if (!config) {
            const configDefecto = ConfigCocinero.getConfiguracionPorDefecto();
            config = await ConfigCocinero.create({
                usuarioId,
                ...configDefecto,
                activo: true
            });
            logger.info('Configuración KDS creada por defecto', { usuarioId });
        }
        
        // Obtener nombre del usuario para el alias y sus zonas asignadas
        const usuario = await Mozos.findById(usuarioId)
            .select('name zonaIds')
            .populate({
                path: 'zonaIds',
                select: 'nombre descripcion color icono activo filtrosPlatos filtrosComandas'
            })
            .lean();
            
        if (usuario && !config.aliasCocinero) {
            config.aliasCocinero = usuario.name;
        }
        
        // Agregar zonas asignadas al config
        config.zonasAsignadas = usuario?.zonaIds || [];
        
        logger.info('Configuración KDS obtenida', { 
            usuarioId, 
            alias: config.aliasCocinero,
            zonasAsignadas: config.zonasAsignadas.length 
        });
        
        return config;
    } catch (error) {
        logger.error('Error al obtener configuración KDS', { error: error.message });
        throw error;
    }
}

/**
 * Crear o actualizar configuración KDS de un cocinero
 */
async function actualizarConfigKDS(usuarioId, datosConfig, actualizadoPor = null) {
    try {
        // Verificar que el usuario existe y tiene rol de cocinero
        const usuario = await Mozos.findById(usuarioId);
        if (!usuario) {
            throw new Error('Usuario no encontrado');
        }
        
        // Si el usuario no es cocinero, actualizar su rol
        if (usuario.rol !== 'cocinero' && usuario.rol !== 'admin' && usuario.rol !== 'supervisor') {
            usuario.rol = 'cocinero';
            await usuario.save();
            logger.info('Rol actualizado a cocinero', { usuarioId });
        }
        
        const setPayload = {
            ...datosConfig,
            actualizadoPor,
            updatedAt: new Date()
        };
        if (Object.prototype.hasOwnProperty.call(datosConfig, 'pronombre')) {
            setPayload.pronombre = String(datosConfig.pronombre || '').trim().slice(0, 12);
        }

        const config = await ConfigCocinero.findOneAndUpdate(
            { usuarioId },
            { $set: setPayload },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true,
                // Evita que un schema cacheado sin `pronombre` lo descarte del $set.
                strict: false
            }
        );
        
        logger.info('Configuración KDS actualizada', { usuarioId, actualizadoPor });
        
        return config;
    } catch (error) {
        logger.error('Error al actualizar configuración KDS', { error: error.message });
        throw error;
    }
}

/**
 * Obtener perfil de personalización de Ver Cocina de un cocinero
 * (Flujo "Distribuir Cocina en monitores" - perfil=auto)
 */
async function obtenerPerfilVerCocina(usuarioId) {
    try {
        const config = await ConfigCocinero.findOne({ usuarioId })
            .select('perfilVerCocina')
            .lean();
        return (config && config.perfilVerCocina) ? config.perfilVerCocina : {};
    } catch (error) {
        logger.error('Error al obtener perfilVerCocina', { error: error.message, usuarioId });
        throw error;
    }
}

/**
 * Guardar perfil de personalización de Ver Cocina de un cocinero.
 * `config` debe venir sanitizado por el controller (whitelist de claves).
 */
async function guardarPerfilVerCocina(usuarioId, config, actualizadoPor = null) {
    try {
        const usuario = await Mozos.findById(usuarioId);
        if (!usuario) {
            throw new Error('Usuario no encontrado');
        }
        const actualizado = await ConfigCocinero.findOneAndUpdate(
            { usuarioId },
            {
                $set: {
                    perfilVerCocina: config,
                    actualizadoPor,
                    updatedAt: new Date(),
                },
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).select('perfilVerCocina updatedAt').lean();
        logger.info('perfilVerCocina guardado', { usuarioId, actualizadoPor });
        return actualizado && actualizado.perfilVerCocina ? actualizado.perfilVerCocina : config;
    } catch (error) {
        logger.error('Error al guardar perfilVerCocina', { error: error.message, usuarioId });
        throw error;
    }
}

// ============================================================
// PERFILES DE PERSONALIZACIÓN "VER COCINA" CON NOMBRE
// Flujo "Distribuir Cocina en monitores" - perfilId=<id>
// ============================================================

async function listarPerfilesVerCocina({ soloActivos = true, tipo = 'ver_cocina' } = {}) {
    try {
        await asegurarIndiceTipoPerfil();
        const filtro = {
            ...(soloActivos ? { activo: true } : {}),
            ...filtroTipoPerfil(tipo),
        };
        return await PerfilVerCocina.find(filtro)
            .sort({ updatedAt: -1 })
            .lean();
    } catch (error) {
        logger.error('Error al listar perfilesVerCocina', { error: error.message, tipo });
        throw error;
    }
}

async function obtenerPerfilVerCocinaPorId(perfilId) {
    try {
        if (!perfilId) return null;
        return await PerfilVerCocina.findById(perfilId).lean();
    } catch (error) {
        logger.error('Error al obtener perfilVerCocina por id', { error: error.message, perfilId });
        return null;
    }
}

async function crearPerfilVerCocina({ nombre, config, creadoPor = null, tipo = 'ver_cocina' }) {
    try {
        await asegurarIndiceTipoPerfil();
        const tipoNorm = tipo === 'tablas_kds' ? 'tablas_kds' : 'ver_cocina';
        const existente = await PerfilVerCocina.findOne({
            nombre: { $eq: nombre.trim() },
            activo: true,
            ...filtroTipoPerfil(tipoNorm),
        });
        if (existente) {
            const err = new Error('Ya existe un perfil con ese nombre');
            err.code = 'DUPLICADO';
            throw err;
        }
        const doc = await PerfilVerCocina.create({
            nombre: nombre.trim(),
            config: config || {},
            tipo: tipoNorm,
            creadoPor,
            actualizadoPor: creadoPor,
        });
        logger.info('perfilVerCocina (con nombre) creado', {
            perfilId: doc._id, nombre: doc.nombre, tipo: tipoNorm, creadoPor,
        });
        return doc.toObject();
    } catch (error) {
        logger.error('Error al crear perfilVerCocina', { error: error.message, nombre, tipo });
        throw error;
    }
}

async function actualizarPerfilVerCocina(perfilId, { nombre, config, actualizadoPor = null }) {
    try {
        const set = {};
        if (nombre !== undefined) set.nombre = nombre.trim();
        if (config !== undefined) set.config = config;
        if (Object.keys(set).length === 0) {
            const err = new Error('Nada que actualizar');
            err.code = 'VACIO';
            throw err;
        }
        set.actualizadoPor = actualizadoPor;
        if (nombre !== undefined) {
            const actual = await PerfilVerCocina.findById(perfilId).select('tipo').lean();
            const tipoNorm = actual && actual.tipo === 'tablas_kds' ? 'tablas_kds' : 'ver_cocina';
            const existente = await PerfilVerCocina.findOne({
                _id: { $ne: perfilId },
                nombre: { $eq: nombre.trim() },
                activo: true,
                ...filtroTipoPerfil(tipoNorm),
            });
            if (existente) {
                const err = new Error('Ya existe un perfil con ese nombre');
                err.code = 'DUPLICADO';
                throw err;
            }
        }
        const actualizado = await PerfilVerCocina.findByIdAndUpdate(
            perfilId,
            { $set: set },
            { new: true }
        ).lean();
        if (!actualizado) {
            const err = new Error('Perfil no encontrado');
            err.code = 'NO_ENCONTRADO';
            throw err;
        }
        logger.info('perfilVerCocina (con nombre) actualizado', { perfilId, actualizadoPor });
        return actualizado;
    } catch (error) {
        logger.error('Error al actualizar perfilVerCocina', { error: error.message, perfilId });
        throw error;
    }
}

async function eliminarPerfilVerCocina(perfilId) {
    try {
        const res = await PerfilVerCocina.findByIdAndUpdate(
            perfilId,
            { $set: { activo: false } },
            { new: true }
        ).lean();
        if (!res) {
            const err = new Error('Perfil no encontrado');
            err.code = 'NO_ENCONTRADO';
            throw err;
        }
        logger.info('perfilVerCocina (con nombre) eliminado', { perfilId });
        return res;
    } catch (error) {
        logger.error('Error al eliminar perfilVerCocina', { error: error.message, perfilId });
        throw error;
    }
}

/**
 * Asignar rol de cocinero a un usuario existente
 */
async function asignarRolCocinero(usuarioId, asignadoPor = null) {
    try {
        const usuario = await Mozos.findById(usuarioId);
        if (!usuario) {
            throw new Error('Usuario no encontrado');
        }
        
        if (usuario.rol === 'cocinero') {
            return { usuario, yaEraCocinero: true };
        }
        
        const rolAnterior = usuario.rol;
        usuario.rol = 'cocinero';
        await usuario.save();
        
        // Crear configuración por defecto si no existe
        const configExistente = await ConfigCocinero.findOne({ usuarioId });
        if (!configExistente) {
            const configDefecto = ConfigCocinero.getConfiguracionPorDefecto();
            await ConfigCocinero.create({
                usuarioId,
                ...configDefecto,
                creadoPor: asignadoPor,
                activo: true
            });
        }
        
        logger.info('Rol de cocinero asignado', { 
            usuarioId, 
            rolAnterior,
            asignadoPor 
        });
        
        return { usuario, yaEraCocinero: false, rolAnterior };
    } catch (error) {
        logger.error('Error al asignar rol de cocinero', { error: error.message });
        throw error;
    }
}

/**
 * Quitar rol de cocinero a un usuario
 */
async function quitarRolCocinero(usuarioId, nuevoRol = 'mozos', quitadoPor = null) {
    try {
        const usuario = await Mozos.findById(usuarioId);
        if (!usuario) {
            throw new Error('Usuario no encontrado');
        }
        
        const rolAnterior = usuario.rol;
        usuario.rol = nuevoRol;
        await usuario.save();
        
        // Desactivar configuración de cocinero
        await ConfigCocinero.findOneAndUpdate(
            { usuarioId },
            { activo: false, actualizadoPor: quitadoPor }
        );
        
        logger.info('Rol de cocinero quitado', { 
            usuarioId, 
            rolAnterior,
            nuevoRol,
            quitadoPor 
        });
        
        return { usuario, rolAnterior };
    } catch (error) {
        logger.error('Error al quitar rol de cocinero', { error: error.message });
        throw error;
    }
}

/**
 * Registrar conexión de cocinero
 */
async function registrarConexion(usuarioId) {
    try {
        await ConfigCocinero.findOneAndUpdate(
            { usuarioId },
            {
                $set: { 'estadisticas.ultimaConexion': new Date() },
                $inc: { 'estadisticas.totalSesiones': 1 }
            },
            { upsert: true }
        );
    } catch (error) {
        logger.error('Error al registrar conexión de cocinero', { error: error.message });
    }
}

/**
 * Incrementar contador de platos preparados
 */
async function incrementarPlatosPreparados(usuarioId, cantidad = 1) {
    try {
        await ConfigCocinero.findOneAndUpdate(
            { usuarioId },
            { $inc: { 'estadisticas.platosPreparados': cantidad } }
        );
    } catch (error) {
        logger.error('Error al incrementar platos preparados', { error: error.message });
    }
}

// ========== MÉTRICAS DE RENDIMIENTO ==========

/**
 * Calcular métricas de rendimiento de un cocinero
 * Filtra por platos donde procesadoPor.cocineroId coincide con usuarioId
 * (atribuir al cocinero que tomó el plato, no al supervisor que finaliza)
 */
async function calcularMetricasRendimiento(usuarioId, fechaInicio, fechaFin) {
    try {
        if (!usuarioId) {
            return {
                totalPlatos: 0,
                tiempoPromedioPreparacion: 0,
                tiempoMinPreparacion: 0,
                tiempoMaxPreparacion: 0,
                porcentajeDentroSLA: 0,
                tiempoPromedioCola: 0,
                platosEnCurso: 0
            };
        }

        const cocineroObjectId = new mongoose.Types.ObjectId(usuarioId);

        // Métricas históricas (período) - filtrar por procesadoPor.cocineroId
        const metricas = await Comanda.aggregate([
            {
                $match: {
                    IsActive: true,
                    'platos.procesadoPor.cocineroId': cocineroObjectId,
                    'platos.tiempos.recoger': {
                        $gte: new Date(fechaInicio),
                        $lte: new Date(fechaFin)
                    }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.procesadoPor.cocineroId': cocineroObjectId,
                    'platos.tiempos.recoger': { $exists: true, $ne: null }
                }
            },
            {
                $project: {
                    tiempoPreparacion: {
                        $divide: [
                            {
                                $subtract: [
                                    '$platos.tiempos.recoger',
                                    { $ifNull: ['$platos.procesadoPor.tomadoEn', '$platos.procesadoPor.timestamp'] }
                                ]
                            },
                            60000
                        ]
                    },
                    tiempoCola: {
                        $divide: [
                            {
                                $subtract: [
                                    { $ifNull: ['$platos.procesadoPor.tomadoEn', '$platos.procesadoPor.timestamp'] },
                                    { $ifNull: ['$platos.tiempos.en_espera', '$platos.procesadoPor.timestamp'] }
                                ]
                            },
                            60000
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    totalPlatos: { $sum: 1 },
                    tiempoPromedioPreparacion: { $avg: '$tiempoPreparacion' },
                    tiempoMinPreparacion: { $min: '$tiempoPreparacion' },
                    tiempoMaxPreparacion: { $max: '$tiempoPreparacion' },
                    tiempoPromedioCola: { $avg: '$tiempoCola' },
                    platosDentroSLA: {
                        $sum: { $cond: [{ $lte: ['$tiempoPreparacion', 15] }, 1, 0] }
                    }
                }
            }
        ]);

        // Platos en curso (sin importar fecha, estado activo)
        const platosEnCurso = await Comanda.aggregate([
            {
                $match: {
                    IsActive: true,
                    'platos.procesandoPor.cocineroId': cocineroObjectId,
                    'platos.estado': { $in: ['pedido', 'en_espera'] }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.procesandoPor.cocineroId': cocineroObjectId,
                    'platos.estado': { $in: ['pedido', 'en_espera'] }
                }
            },
            { $count: 'total' }
        ]);

        const garnishMatchFecha = {
            IsActive: true,
            'platos.complementosSeleccionados.procesadoPor.cocineroId': cocineroObjectId,
            'platos.complementosSeleccionados.procesadoPor.timestamp': {
                $gte: new Date(fechaInicio),
                $lte: new Date(fechaFin)
            }
        };
        const metricasGuarnicionPromise = Comanda.aggregate([
            { $match: garnishMatchFecha },
            { $unwind: '$platos' },
            { $unwind: '$platos.complementosSeleccionados' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.complementosSeleccionados.eliminado': { $ne: true },
                    'platos.complementosSeleccionados.procesadoPor.cocineroId': cocineroObjectId,
                    'platos.complementosSeleccionados.estadoCocina': 'recoger'
                }
            },
            {
                $project: {
                    tiempoPreparacion: {
                        $divide: [
                            {
                                $subtract: [
                                    '$platos.complementosSeleccionados.procesadoPor.timestamp',
                                    { $ifNull: [
                                        '$platos.complementosSeleccionados.procesadoPor.tomadoEn',
                                        '$platos.complementosSeleccionados.procesandoPor.timestamp'
                                    ] }
                                ]
                            },
                            60000
                        ]
                    }
                }
            },
            {
                $match: { tiempoPreparacion: { $gte: 0, $lt: 180 } }
            },
            {
                $group: {
                    _id: null,
                    totalPlatos: { $sum: 1 },
                    tiempoPromedioPreparacion: { $avg: '$tiempoPreparacion' },
                    tiempoMinPreparacion: { $min: '$tiempoPreparacion' },
                    tiempoMaxPreparacion: { $max: '$tiempoPreparacion' },
                    platosDentroSLA: {
                        $sum: { $cond: [{ $lte: ['$tiempoPreparacion', 15] }, 1, 0] }
                    }
                }
            }
        ]);

        const guarnicionesEnCursoPromise = Comanda.aggregate([
            {
                $match: {
                    IsActive: true,
                    'platos.complementosSeleccionados.procesandoPor.cocineroId': cocineroObjectId,
                    'platos.complementosSeleccionados.estadoCocina': { $in: ['pedido', 'en_espera'] }
                }
            },
            { $unwind: '$platos' },
            { $unwind: '$platos.complementosSeleccionados' },
            {
                $match: {
                    'platos.complementosSeleccionados.procesandoPor.cocineroId': cocineroObjectId,
                    'platos.complementosSeleccionados.estadoCocina': { $in: ['pedido', 'en_espera'] }
                }
            },
            { $count: 'total' }
        ]);

        const [metricasG, guarnicionesEnCurso] = await Promise.all([
            metricasGuarnicionPromise,
            guarnicionesEnCursoPromise
        ]);

        const totalEnCurso = (platosEnCurso.length > 0 ? platosEnCurso[0].total : 0)
            + (guarnicionesEnCurso.length > 0 ? guarnicionesEnCurso[0].total : 0);

        const mergeMetricas = (a, b) => {
            const rows = [a, b].filter(Boolean);
            if (!rows.length) {
                return {
                    totalPlatos: 0,
                    tiempoPromedioPreparacion: 0,
                    tiempoMinPreparacion: 0,
                    tiempoMaxPreparacion: 0,
                    porcentajeDentroSLA: 0,
                    tiempoPromedioCola: 0,
                    platosEnCurso: totalEnCurso
                };
            }
            const total = rows.reduce((s, r) => s + (r.totalPlatos || 0), 0);
            const sla = rows.reduce((s, r) => s + (r.platosDentroSLA || 0), 0);
            const avg = total > 0
                ? rows.reduce((s, r) => s + (r.tiempoPromedioPreparacion || 0) * (r.totalPlatos || 0), 0) / total
                : 0;
            const mins = rows.map(r => r.tiempoMinPreparacion).filter(n => n != null);
            const maxs = rows.map(r => r.tiempoMaxPreparacion).filter(n => n != null);
            const cola = a?.tiempoPromedioCola || 0;
            return {
                totalPlatos: total,
                tiempoPromedioPreparacion: Math.round(avg * 10) / 10,
                tiempoMinPreparacion: mins.length ? Math.round(Math.min(...mins) * 10) / 10 : 0,
                tiempoMaxPreparacion: maxs.length ? Math.round(Math.max(...maxs) * 10) / 10 : 0,
                porcentajeDentroSLA: total > 0 ? Math.round((sla / total) * 100) : 0,
                tiempoPromedioCola: Math.round((cola || 0) * 10) / 10,
                platosEnCurso: totalEnCurso
            };
        };

        return mergeMetricas(metricas[0], metricasG[0]);
    } catch (error) {
        logger.error('Error al calcular métricas de rendimiento', { error: error.message });
        throw error;
    }
}

/**
 * Obtener métricas de todos los cocineros (ranking)
 * Respuesta aplanada para UI: { usuarioId, nombre, alias, fotoUrl, totalPlatos, tiempoPromedio, ... }
 */
async function obtenerMetricasTodosCocineros(fechaInicio, fechaFin) {
    try {
        const cocineros = await Mozos.find({ rol: 'cocinero', activo: true })
            .select('_id name fotoUrl zonaIds')
            .lean();

        const cocinerosList = await Promise.all(
            cocineros.map(async (cocinero) => {
                const config = await ConfigCocinero.findOne({ usuarioId: cocinero._id }).lean();
                const metricasRendimiento = await calcularMetricasRendimiento(
                    cocinero._id,
                    fechaInicio,
                    fechaFin
                );

                return {
                    usuarioId: cocinero._id,
                    nombre: cocinero.name,
                    alias: config?.aliasCocinero || cocinero.name,
                    fotoUrl: cocinero.fotoUrl || null,
                    aliasCocinero: config?.aliasCocinero || null,
                    totalPlatos: metricasRendimiento.totalPlatos,
                    tiempoPromedio: metricasRendimiento.tiempoPromedioPreparacion,
                    tiempoMin: metricasRendimiento.tiempoMinPreparacion,
                    tiempoMax: metricasRendimiento.tiempoMaxPreparacion,
                    tiempoPromedioCola: metricasRendimiento.tiempoPromedioCola,
                    porcentajeDentroSLA: metricasRendimiento.porcentajeDentroSLA,
                    platosEnCurso: metricasRendimiento.platosEnCurso,
                    totalSesiones: config?.estadisticas?.totalSesiones || 0,
                    platosPreparadosAcumulado: config?.estadisticas?.platosPreparados || 0,
                    ultimaConexion: config?.estadisticas?.ultimaConexion || null,
                    metricas: metricasRendimiento
                };
            })
        );

        return cocinerosList.sort((a, b) =>
            a.tiempoPromedio - b.tiempoPromedio
        );
    } catch (error) {
        logger.error('Error al obtener métricas de todos los cocineros', { error: error.message });
        throw error;
    }
}

/**
 * Obtener platos más preparados por un cocinero
 * Filtra por procesadoPor.cocineroId = usuarioId
 */
async function obtenerPlatosTopPorCocinero(usuarioId, fechaInicio, fechaFin, limite = 10) {
    try {
        if (!usuarioId) return [];

        const cocineroObjectId = new mongoose.Types.ObjectId(usuarioId);

        const platosTop = await Comanda.aggregate([
            {
                $match: {
                    IsActive: true,
                    'platos.procesadoPor.cocineroId': cocineroObjectId,
                    'platos.tiempos.recoger': {
                        $gte: new Date(fechaInicio),
                        $lte: new Date(fechaFin)
                    }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.procesadoPor.cocineroId': cocineroObjectId,
                    'platos.tiempos.recoger': { $exists: true, $ne: null }
                }
            },
            {
                $lookup: {
                    from: 'platos',
                    localField: 'platos.plato',
                    foreignField: '_id',
                    as: 'platoInfo'
                }
            },
            { $unwind: '$platoInfo' },
            {
                $group: {
                    _id: '$platos.platoId',
                    nombre: { $first: '$platoInfo.nombre' },
                    categoria: { $first: '$platoInfo.categoria' },
                    cantidad: { $sum: 1 },
                    tiempoPromedio: {
                        $avg: {
                            $divide: [
                                {
                                    $subtract: [
                                        '$platos.tiempos.recoger',
                                        { $ifNull: ['$platos.procesadoPor.tomadoEn', '$platos.procesadoPor.timestamp'] }
                                    ]
                                },
                                60000
                            ]
                        }
                    }
                }
            },
            { $sort: { cantidad: -1 } },
            { $limit: limite }
        ]);

        return platosTop.map(p => ({
            platoId: p._id,
            nombre: p.nombre,
            categoria: p.categoria,
            cantidad: p.cantidad,
            tiempoPromedio: Math.round(p.tiempoPromedio * 10) / 10
        }));
    } catch (error) {
        logger.error('Error al obtener platos top por cocinero', { error: error.message });
        throw error;
    }
}

/**
 * Snapshot de platos en curso por cocinero (rendimiento en vivo)
 * Misma lógica que Ver Cocina Completo: platos con procesandoPor + estado activo
 * Respuesta enriquecida con grupos[] (mismo plato agrupado), timers[], mesas consolidadas
 * y métricas del turno (finalizadosHoy, tiempoPromedioHoy) por cocinero.
 */
async function obtenerRendimientoEnVivo(usuarioId = null) {
    try {
        const lookupPlatoYMesa = [
            {
                $lookup: {
                    from: 'platos',
                    let: { platoRef: '$platos.plato' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', '$$platoRef'] } } },
                        { $project: { nombre: 1, categoria: 1 } }
                    ],
                    as: 'platoInfo'
                }
            },
            { $lookup: { from: 'mesas', localField: 'mesas', foreignField: '_id', as: 'mesaInfo' } }
        ];

        const matchPlatos = matchComandaConPlatoEnCurso(usuarioId);

        const platosEnCurso = await Comanda.aggregate([
            { $match: matchPlatos },
            { $unwind: '$platos' },
            {
                $match: {
                    ...matchCocineroTrasUnwind('platos.procesandoPor.cocineroId', usuarioId),
                    'platos.estado': { $in: ESTADOS_PLATO_EN_CURSO },
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true }
                }
            },
            ...lookupPlatoYMesa,
            {
                $project: {
                    comandaId: '$_id',
                    comandaNumber: '$comandaNumber',
                    platoId: '$platos.platoId',
                    platoNombre: {
                        $ifNull: [
                            { $arrayElemAt: ['$platoInfo.nombre', 0] },
                            '$platos.nombre'
                        ]
                    },
                    platoCategoria: { $arrayElemAt: ['$platoInfo.categoria', 0] },
                    cantidad: '$platos.cantidad',
                    estado: '$platos.estado',
                    observaciones: {
                        $ifNull: ['$platos.observaciones', '$platos.notaEspecial']
                    },
                    complementos: {
                        $ifNull: ['$platos.complementos', '$platos.complementosSeleccionados']
                    },
                    prioritario: '$platos.prioritario',
                    cocineroId: '$platos.procesandoPor.cocineroId',
                    cocineroNombre: '$platos.procesandoPor.nombre',
                    cocineroAlias: '$platos.procesandoPor.alias',
                    procesandoDesde: {
                        $ifNull: [
                            '$platos.procesandoPor.timestamp',
                            { $ifNull: ['$platos.asignacionMeta.timestamp', '$platos.tiempos.en_espera'] }
                        ]
                    },
                    mesaNum: { $ifNull: [{ $arrayElemAt: ['$mesaInfo.nummesa', 0] }, '$mesaNumero'] },
                    mesaArea: { $arrayElemAt: ['$mesaInfo.area', 0] },
                    mesaIds: { $ifNull: ['$mesaIds', []] }
                }
            }
        ]);

        const matchGuarniciones = matchComandaConGuarnicionEnCurso(usuarioId);

        const guarnicionesEnCurso = await Comanda.aggregate([
            { $match: matchGuarniciones },
            { $unwind: '$platos' },
            { $unwind: { path: '$platos.complementosSeleccionados', preserveNullAndEmptyArrays: false } },
            {
                $match: {
                    ...matchCocineroTrasUnwind('platos.complementosSeleccionados.procesandoPor.cocineroId', usuarioId),
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.complementosSeleccionados.eliminado': { $ne: true },
                    'platos.complementosSeleccionados.estadoCocina': { $nin: ['recoger'] }
                }
            },
            ...lookupPlatoYMesa,
            {
                $project: {
                    comandaId: '$_id',
                    comandaNumber: '$comandaNumber',
                    platoId: '$platos.complementosSeleccionados._id',
                    platoNombrePadre: {
                        $ifNull: [
                            { $arrayElemAt: ['$platoInfo.nombre', 0] },
                            '$platos.nombre'
                        ]
                    },
                    grupo: '$platos.complementosSeleccionados.grupo',
                    opcion: '$platos.complementosSeleccionados.opcion',
                    platoCategoria: { $arrayElemAt: ['$platoInfo.categoria', 0] },
                    cantidad: { $ifNull: ['$platos.complementosSeleccionados.cantidad', 1] },
                    estado: { $ifNull: ['$platos.complementosSeleccionados.estadoCocina', 'en_espera'] },
                    observaciones: '',
                    complementos: [],
                    esGuarnicion: { $literal: true },
                    prioritario: '$platos.prioritario',
                    cocineroId: '$platos.complementosSeleccionados.procesandoPor.cocineroId',
                    cocineroNombre: '$platos.complementosSeleccionados.procesandoPor.nombre',
                    cocineroAlias: '$platos.complementosSeleccionados.procesandoPor.alias',
                    procesandoDesde: {
                        $ifNull: [
                            '$platos.complementosSeleccionados.procesandoPor.timestamp',
                            '$platos.complementosSeleccionados.asignacionMeta.timestamp'
                        ]
                    },
                    mesaNum: { $ifNull: [{ $arrayElemAt: ['$mesaInfo.nummesa', 0] }, '$mesaNumero'] },
                    mesaArea: { $arrayElemAt: ['$mesaInfo.area', 0] },
                    mesaIds: { $ifNull: ['$mesaIds', []] }
                }
            }
        ]);

        const porCocinero = new Map();
        for (const p of platosEnCurso) agregarBloqueACocinero(porCocinero, p);
        for (const g of guarnicionesEnCurso) {
            agregarBloqueACocinero(porCocinero, {
                ...g,
                platoNombre: nombreGuarnicionEnCurso(g)
            });
        }

        const idsValidos = (ids) => ids.map(id => toObjectIdSafe(id)).filter(Boolean);

        // Agregar info extendida (fotoUrl, alias, config KDS, métricas del día)
        const cocinerosIds = Array.from(porCocinero.keys());
        const cocinerosOids = idsValidos(cocinerosIds);
        const cocinerosInfo = await Mozos.find({
            _id: { $in: cocinerosOids }
        })
            .select('_id name fotoUrl')
            .lean();
        const configsInfo = await ConfigCocinero.find({
            usuarioId: { $in: cocinerosOids }
        })
            .select('usuarioId aliasCocinero estadisticas configTableroKDS.tiempoAmarillo configTableroKDS.tiempoRojo')
            .lean();

        // Incluir cocineros activos sin platos en curso (como selector Ver Cocina)
        const cocinerosActivos = await Mozos.find({ rol: 'cocinero', activo: true })
            .select('_id name fotoUrl')
            .lean();
        const configsActivos = await ConfigCocinero.find({
            usuarioId: { $in: cocinerosActivos.map(c => c._id) }
        })
            .select('usuarioId aliasCocinero estadisticas configTableroKDS.tiempoAmarillo configTableroKDS.tiempoRojo')
            .lean();

        for (const cocinero of cocinerosActivos) {
            const id = cocinero._id.toString();
            if (!porCocinero.has(id)) {
                porCocinero.set(id, {
                    cocineroId: id,
                    cocineroNombre: cocinero.name,
                    cocineroAlias: cocinero.name,
                    fotoUrl: cocinero.fotoUrl || null,
                    bloques: []
                });
            }
        }

        // Métricas del día por cocinero (paralelo para todos los cocineros activos)
        const inicioHoy = new Date();
        inicioHoy.setHours(0, 0, 0, 0);
        const finHoy = new Date();
        finHoy.setHours(23, 59, 59, 999);

        const todosIds = Array.from(porCocinero.keys());
        const metricasHoyPorCocinero = await Promise.all(
            todosIds.map(id => calcularMetricasRendimiento(id, inicioHoy, finHoy).catch(() => null))
        );
        const metricasMap = new Map();
        todosIds.forEach((id, i) => metricasMap.set(id, metricasHoyPorCocinero[i]));

        const result = Array.from(porCocinero.values()).map(item => {
            const info = cocinerosInfo.find(c => c._id.toString() === item.cocineroId);
            const config = configsInfo.find(c => c.usuarioId?.toString() === item.cocineroId);
            const configActivo = configsActivos.find(c => c.usuarioId?.toString() === item.cocineroId);
            const metricasHoy = metricasMap.get(item.cocineroId) || {};

            // Construir grupos[] a partir de bloques[]
            const grupos = construirGruposDesdeBloques(item.bloques || []);

            return {
                cocineroId: item.cocineroId,
                cocineroNombre: info?.name || item.cocineroNombre,
                cocineroAlias: config?.aliasCocinero || configActivo?.aliasCocinero || info?.name || item.cocineroAlias,
                fotoUrl: info?.fotoUrl || item.fotoUrl || null,
                slaMinutos: config?.configTableroKDS?.tiempoAmarillo
                    || configActivo?.configTableroKDS?.tiempoAmarillo || 15,
                slaRojoMinutos: config?.configTableroKDS?.tiempoRojo
                    || configActivo?.configTableroKDS?.tiempoRojo || 20,
                platosEnCurso: (item.bloques || []).length,
                finalizadosHoy: metricasHoy.totalPlatos || 0,
                tiempoPromedioHoy: metricasHoy.tiempoPromedioPreparacion || 0,
                grupos,
                bloques: item.bloques || []
            };
        });

        // Ordenar: primero los que tienen platos en curso, luego por nombre
        result.sort((a, b) => {
            if (b.platosEnCurso !== a.platosEnCurso) return b.platosEnCurso - a.platosEnCurso;
            return (a.cocineroNombre || '').localeCompare(b.cocineroNombre || '');
        });

        return result;
    } catch (error) {
        logger.error('Error al obtener rendimiento en vivo', { error: error.message });
        throw error;
    }
}

/**
 * Helper: agrupar bloques de platos por clave (platoId + complementos + observaciones)
 * Devuelve grupos con timers[] numerados (antiguo → nuevo) y mesas consolidadas.
 */
function construirGruposDesdeBloques(bloques) {
    const gruposMap = new Map();

    for (const bloque of bloques) {
        const platoIdStr = bloque.platoId != null ? String(bloque.platoId) : (bloque.platoNombre || 'sin-id');
        const comps = Array.isArray(bloque.complementos)
            ? bloque.complementos.map(c => (typeof c === 'string' ? c : (c?.nombre || c?._id || ''))).sort().join('|')
            : '';
        const obs = (bloque.observaciones || '').trim().toLowerCase();
        const clave = platoIdStr + '::' + comps + '::' + obs;

        if (!gruposMap.has(clave)) {
            gruposMap.set(clave, {
                plato: bloque.platoNombre || 'Plato',
                platoId: bloque.platoId,
                complementos: bloque.complementos || [],
                observaciones: bloque.observaciones || '',
                prioritario: !!bloque.prioritario,
                cantidad: 0,
                timers: [],
                mesas: []
            });
        }

        const grupo = gruposMap.get(clave);
        grupo.cantidad += 1;
        if (bloque.prioritario) grupo.prioritario = true;

        grupo.timers.push({
            desde: bloque.procesandoDesde,
            comandaId: bloque.comandaId
        });

        if (bloque.mesaNum != null) {
            grupo.mesas.push({ nummesa: bloque.mesaNum, comandaId: bloque.comandaId });
        }
    }

    // Numerar timers (1-indexed, antiguos primero) y deduplicar mesas
    const grupos = Array.from(gruposMap.values());
    for (const grupo of grupos) {
        grupo.timers.sort((a, b) => new Date(a.desde) - new Date(b.desde));
        grupo.timers = grupo.timers.map((t, i) => ({ indice: i + 1, desde: t.desde }));

        const mesasUnicas = new Map();
        for (const m of grupo.mesas) {
            if (!mesasUnicas.has(m.nummesa)) mesasUnicas.set(m.nummesa, m);
        }
        grupo.mesas = Array.from(mesasUnicas.values());
    }

    return grupos;
}

/**
 * Resumen del turno actual (hoy)
 * KPIs agregados para el header del dashboard
 */
async function obtenerResumenTurno(fechaInicio, fechaFin) {
    try {
        const [resumen] = await Comanda.aggregate([
            {
                $match: {
                    IsActive: true,
                    'platos.procesadoPor.cocineroId': { $ne: null, $exists: true },
                    'platos.tiempos.recoger': {
                        $gte: new Date(fechaInicio),
                        $lte: new Date(fechaFin)
                    }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.procesadoPor.cocineroId': { $ne: null, $exists: true },
                    'platos.tiempos.recoger': { $exists: true, $ne: null },
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true }
                }
            },
            {
                $project: {
                    tiempoPreparacion: {
                        $divide: [
                            {
                                $subtract: [
                                    '$platos.tiempos.recoger',
                                    { $ifNull: ['$platos.procesadoPor.tomadoEn', '$platos.procesadoPor.timestamp'] }
                                ]
                            },
                            60000
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    finalizadosHoy: { $sum: 1 },
                    tiempoPromedioEquipo: { $avg: '$tiempoPreparacion' },
                    platosDentroSLA: {
                        $sum: { $cond: [{ $lte: ['$tiempoPreparacion', 15] }, 1, 0] }
                    }
                }
            }
        ]);

        // Platos / guarniciones en curso (ahora): asignados, aún en cocina
        const enCursoPlatos = await Comanda.aggregate([
            { $match: matchComandaConPlatoEnCurso(null) },
            { $unwind: '$platos' },
            {
                $match: {
                    ...matchCocineroTrasUnwind('platos.procesandoPor.cocineroId', null),
                    'platos.estado': { $in: ESTADOS_PLATO_EN_CURSO },
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true }
                }
            },
            { $count: 'total' }
        ]);
        const enCursoGuarniciones = await Comanda.aggregate([
            { $match: matchComandaConGuarnicionEnCurso(null) },
            { $unwind: '$platos' },
            { $unwind: { path: '$platos.complementosSeleccionados', preserveNullAndEmptyArrays: false } },
            {
                $match: {
                    ...matchCocineroTrasUnwind('platos.complementosSeleccionados.procesandoPor.cocineroId', null),
                    'platos.complementosSeleccionados.eliminado': { $ne: true },
                    'platos.complementosSeleccionados.estadoCocina': { $nin: ['recoger'] }
                }
            },
            { $count: 'total' }
        ]);

        const activos = await Mozos.countDocuments({ rol: 'cocinero', activo: true });

        return {
            platosEnCurso: (enCursoPlatos[0]?.total || 0) + (enCursoGuarniciones[0]?.total || 0),
            finalizadosHoy: resumen?.finalizadosHoy || 0,
            tiempoPromedioEquipo: Math.round((resumen?.tiempoPromedioEquipo || 0) * 10) / 10,
            porcentajeDentroSLA: resumen
                ? Math.round((resumen.platosDentroSLA / resumen.finalizadosHoy) * 100)
                : 0,
            cocinerosActivos: activos
        };
    } catch (error) {
        logger.error('Error al obtener resumen del turno', { error: error.message });
        throw error;
    }
}

/**
 * Registro histórico de platos cocinados — UNA FILA POR COMANDA (misma lógica que mozos).
 * Solo incluye platos que un cocinero tomó (procesandoPor / procesadoPor).
 * Persiste comandas cerradas (pagado/completado / IsActive=false); no exige IsActive.
 *
 * @param {Object} opts
 * @param {String|null} opts.usuarioId
 * @param {Date}        opts.fechaInicio
 * @param {Date}        opts.fechaFin
 * @param {Number}      opts.limite
 */
async function obtenerHistorialPlatosCocinados({ usuarioId = null, fechaInicio, fechaFin, limite = 500 } = {}) {
    try {
        const objectId = usuarioId ? toObjectIdSafe(usuarioId) : null;
        const matchCocinero = objectId
            ? {
                $or: [
                    { 'platos.procesandoPor.cocineroId': objectId },
                    { 'platos.procesadoPor.cocineroId': objectId },
                    { 'platos.complementosSeleccionados.procesandoPor.cocineroId': objectId },
                    { 'platos.complementosSeleccionados.procesadoPor.cocineroId': objectId }
                ]
            }
            : {
                $or: [
                    { 'platos.procesandoPor.cocineroId': { $ne: null, $exists: true } },
                    { 'platos.procesadoPor.cocineroId': { $ne: null, $exists: true } },
                    { 'platos.complementosSeleccionados.procesandoPor.cocineroId': { $ne: null, $exists: true } },
                    { 'platos.complementosSeleccionados.procesadoPor.cocineroId': { $ne: null, $exists: true } }
                ]
            };

        const desde = new Date(fechaInicio);
        const hasta = new Date(fechaFin);
        const diaDesde = new Date(moment(fechaInicio).startOf('day').toDate());
        const diaHasta = new Date(moment(fechaFin).endOf('day').toDate());

        // 1) Platos listos (recoger) en el período — activas o ya cerradas
        const matchListos = {
            eliminada: { $ne: true },
            $and: [
                matchCocinero,
                { 'platos.tiempos.recoger': { $gte: desde, $lte: hasta } }
            ]
        };

        // 2) Comandas cerradas en el período con atribución de cocinero
        const matchCerradas = {
            eliminada: { $ne: true },
            status: { $in: ['pagado', 'completado'] },
            $and: [
                matchCocinero,
                {
                    $or: [
                        { tiempoPagado: { $gte: desde, $lte: hasta } },
                        { updatedAt: { $gte: desde, $lte: hasta } },
                        { createdAt: { $gte: diaDesde, $lte: diaHasta } }
                    ]
                }
            ]
        };

        // 3) En curso ahora (asignados, todavía preparando). Si el rango incluye
        // "ahora" (p.ej. hoy), no exigir createdAt del día: una comanda de ayer
        // con plato tomado hoy debe verse.
        const ahoraLima = moment.tz('America/Lima').toDate();
        const rangoIncluyeAhora = desde <= ahoraLima && hasta >= ahoraLima;
        const matchEnCurso = {
            $or: [
                matchComandaConPlatoEnCurso(usuarioId),
                matchComandaConGuarnicionEnCurso(usuarioId)
            ]
        };

        // 4) Activas del día donde ya hay platos procesados (siguen visibles tras finalizar plato)
        const matchActivasProcesadas = {
            eliminada: { $ne: true },
            IsActive: true,
            status: { $nin: ['pagado', 'completado', 'cancelado'] },
            $and: [
                matchCocinero,
                {
                    $or: [
                        { 'platos.tiempos.recoger': { $gte: diaDesde, $lte: diaHasta } },
                        { createdAt: { $gte: diaDesde, $lte: diaHasta } }
                    ]
                }
            ]
        };

        const pipeline = (match) => [
            { $match: match },
            { $lookup: { from: 'mesas', localField: 'mesas', foreignField: '_id', as: 'mesaInfo' } },
            {
                $lookup: {
                    from: 'platos',
                    let: { platoRefs: '$platos.plato' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$_id', '$$platoRefs'] } } },
                        { $project: { nombre: 1, categoria: 1 } }
                    ],
                    as: 'platosInfo'
                }
            },
            {
                $project: {
                    comandaId: '$_id',
                    comandaNumber: '$comandaNumber',
                    mesaNum: { $ifNull: [{ $arrayElemAt: ['$mesaInfo.nummesa', 0] }, '$mesaNumero'] },
                    statusComanda: '$status',
                    IsActive: 1,
                    tiempoPagado: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    platos: {
                        $map: {
                            input: '$platos',
                            as: 'p',
                            in: {
                                platoSubdocId: '$$p._id',
                                platoId: '$$p.platoId',
                                estado: '$$p.estado',
                                cantidad: '$$p.cantidad',
                                notaEspecial: '$$p.notaEspecial',
                                eliminado: '$$p.eliminado',
                                anulado: '$$p.anulado',
                                tiempos: '$$p.tiempos',
                                procesadoPor: '$$p.procesadoPor',
                                procesandoPor: '$$p.procesandoPor',
                                asignacionMeta: '$$p.asignacionMeta',
                                complementosSeleccionados: '$$p.complementosSeleccionados',
                                platoNombre: {
                                    $ifNull: [
                                        {
                                            $arrayElemAt: [
                                                {
                                                    $map: {
                                                        input: {
                                                            $filter: {
                                                                input: '$platosInfo',
                                                                as: 'pi',
                                                                cond: { $eq: ['$$pi._id', '$$p.plato'] }
                                                            }
                                                        },
                                                        as: 'pi',
                                                        in: '$$pi.nombre'
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        '$$p.nombre'
                                    ]
                                },
                                platoCategoria: {
                                    $arrayElemAt: [
                                        {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: '$platosInfo',
                                                        as: 'pi',
                                                        cond: { $eq: ['$$pi._id', '$$p.plato'] }
                                                    }
                                                },
                                                as: 'pi',
                                                in: '$$pi.categoria'
                                            }
                                        },
                                        0
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            { $limit: limite }
        ];

        const [listos, cerradas, enCurso, activasProc] = await Promise.all([
            Comanda.aggregate(pipeline(matchListos)),
            Comanda.aggregate(pipeline(matchCerradas)),
            rangoIncluyeAhora ? Comanda.aggregate(pipeline(matchEnCurso)) : Promise.resolve([]),
            Comanda.aggregate(pipeline(matchActivasProcesadas))
        ]);

        const mapa = new Map();
        for (const c of [...listos, ...cerradas, ...enCurso, ...activasProc]) {
            const key = String(c._id || c.comandaId);
            if (!mapa.has(key)) mapa.set(key, c);
        }

        const ahora = new Date();
        const registros = [];
        const comandas = [];

        for (const c of mapa.values()) {
            const platosTomados = (c.platos || []).filter(p => platoTomadoPorCocinero(p, objectId));
            const guarnicionesTomadas = flattenGuarnicionesComoUnidades(c.platos || [])
                .filter(g => platoTomadoPorCocinero(g, objectId));
            const unidadesTomadas = [...platosTomados, ...guarnicionesTomadas];
            if (!unidadesTomadas.length) continue;

            const metricas = calcularMetricasComandaCocina(unidadesTomadas);
            const statusLower = String(c.statusComanda || '').toLowerCase();
            const cerrada = statusLower === 'pagado' || statusLower === 'completado' || c.IsActive === false;
            const todosListos = metricas.platosListos >= metricas.platosTotal && metricas.platosTotal > 0;

            let estadoRegistro = 'en_curso';
            if (statusLower === 'pagado') estadoRegistro = 'pagada';
            else if (statusLower === 'completado' || (cerrada && todosListos)) estadoRegistro = 'completada';
            else if (todosListos) estadoRegistro = 'completada';

            // Cocinero(s) de la comanda (nombres únicos)
            const cocinerosMap = new Map();
            for (const p of platosTomados) {
                const info = cocineroDePlato(p);
                if (!info) continue;
                const key = String(info.cocineroId);
                if (!cocinerosMap.has(key)) cocinerosMap.set(key, info);
            }
            for (const g of guarnicionesTomadas) {
                const info = cocineroDePlato(g);
                if (!info) continue;
                const key = String(info.cocineroId);
                if (!cocinerosMap.has(key)) cocinerosMap.set(key, info);
            }
            const cocineros = Array.from(cocinerosMap.values());
            const principal = cocineros[0] || { cocineroId: null, cocineroNombre: '—', cocineroAlias: '—' };

            // Enriquecer platos: cronómetro asignación → listo (recoger)
            const platosUI = unidadesTomadas.map(p => {
                const info = cocineroDePlato(p);
                const listo = platoListoCocinaHist(p);
                const tomadoEn = tomadoEnPlato(p);
                const listoEn = listoEnPlato(p);
                const tiempoSegundos = tiempoPrepPlatoSegundos(p, ahora);
                return {
                    ...p,
                    cocineroId: info?.cocineroId || null,
                    cocineroNombre: info?.cocineroNombre || null,
                    cocineroAlias: info?.cocineroAlias || null,
                    tomadoEn,
                    listoEn,
                    entregadoEn: listoEn, // alias: momento "preparado / recoger"
                    tiempoSegundos,
                    estadoRegistro: listo ? 'finalizado' : 'en_curso'
                };
            });

            for (const p of platosUI) {
                registros.push({
                    comandaId: c._id || c.comandaId,
                    comandaNumber: c.comandaNumber,
                    platoId: p.platoId,
                    platoSubdocId: p.platoSubdocId,
                    platoNombre: p.platoNombre,
                    platoCategoria: p.platoCategoria,
                    cantidad: p.cantidad,
                    estadoPlato: p.estado,
                    mesaNum: c.mesaNum,
                    estadoRegistro: p.estadoRegistro,
                    cocineroId: p.cocineroId,
                    cocineroNombre: p.cocineroNombre,
                    cocineroAlias: p.cocineroAlias,
                    tomadoEn: p.tomadoEn,
                    listoEn: p.listoEn,
                    entregadoEn: p.listoEn,
                    tiempoSegundos: p.tiempoSegundos || 0
                });
            }

            comandas.push({
                comandaId: c._id || c.comandaId,
                comandaNumber: c.comandaNumber,
                mesaNum: c.mesaNum,
                statusComanda: c.statusComanda,
                IsActive: c.IsActive !== false,
                tiempoPagado: c.tiempoPagado || null,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                cocineroId: principal.cocineroId,
                cocineroNombre: principal.cocineroNombre,
                cocineroAlias: principal.cocineroAlias,
                cocineros,
                platos: platosUI,
                resumenEstados: metricas.resumenEstados,
                platosListos: metricas.platosListos,
                platosEnCurso: metricas.platosEnCurso,
                platosTotal: metricas.platosTotal,
                tiempoCocinaSegundos: metricas.tiempoCocinaSegundos,
                tiempoPrepPromedioSegundos: metricas.tiempoPrepPromedioSegundos,
                estadoRegistro,
                _snapshotAt: ahora
            });
        }

        comandas.sort((a, b) => {
            const fechaA = new Date(a.tiempoPagado || a.updatedAt || a.createdAt).getTime();
            const fechaB = new Date(b.tiempoPagado || b.updatedAt || b.createdAt).getTime();
            return fechaB - fechaA;
        });

        // Resumen agregados (solo platos finalizados)
        const porPlatoMap = new Map();
        const porCocineroMap = new Map();
        let totalFinalizados = 0;
        let sumaTiempos = 0;
        let dentroSLA = 0;
        let totalEnCursoPlatos = 0;

        for (const r of registros) {
            if (r.estadoRegistro === 'en_curso') {
                totalEnCursoPlatos++;
                continue;
            }
            totalFinalizados++;
            const seg = Math.max(0, Math.round(r.tiempoSegundos || 0));
            sumaTiempos += seg;
            if (seg <= SLA_COCINA_MINUTOS * 60) dentroSLA++;

            const platoKey = String(r.platoId ?? r.platoNombre ?? 'sin-id');
            if (!porPlatoMap.has(platoKey)) {
                porPlatoMap.set(platoKey, {
                    platoId: r.platoId,
                    platoNombre: r.platoNombre || 'Plato',
                    categoria: r.platoCategoria || null,
                    cantidad: 0,
                    tiempoTotalSegundos: 0,
                    tiempos: []
                });
            }
            const pp = porPlatoMap.get(platoKey);
            pp.cantidad++;
            pp.tiempoTotalSegundos += seg;
            pp.tiempos.push(seg);

            const cocKey = r.cocineroId?.toString() || 'desconocido';
            if (!porCocineroMap.has(cocKey)) {
                porCocineroMap.set(cocKey, {
                    cocineroId: cocKey,
                    cocineroNombre: r.cocineroNombre || 'Cocinero',
                    cocineroAlias: r.cocineroAlias || r.cocineroNombre || 'Cocinero',
                    totalPlatos: 0,
                    tiempoTotalSegundos: 0,
                    dentroSLA: 0
                });
            }
            const cc = porCocineroMap.get(cocKey);
            cc.totalPlatos++;
            cc.tiempoTotalSegundos += seg;
            if (seg <= SLA_COCINA_MINUTOS * 60) cc.dentroSLA++;
        }

        const porPlato = Array.from(porPlatoMap.values()).map(p => {
            const arr = p.tiempos;
            delete p.tiempos;
            return {
                ...p,
                tiempoPromedioSegundos: p.cantidad > 0 ? Math.round(p.tiempoTotalSegundos / p.cantidad) : 0,
                tiempoMinSegundos: arr.length ? Math.min(...arr) : 0,
                tiempoMaxSegundos: arr.length ? Math.max(...arr) : 0
            };
        }).sort((a, b) => b.cantidad - a.cantidad);

        const porCocinero = Array.from(porCocineroMap.values()).map(c => ({
            ...c,
            tiempoPromedioSegundos: c.totalPlatos > 0 ? Math.round(c.tiempoTotalSegundos / c.totalPlatos) : 0,
            porcentajeDentroSLA: c.totalPlatos > 0 ? Math.round((c.dentroSLA / c.totalPlatos) * 100) : 0
        })).sort((a, b) => b.totalPlatos - a.totalPlatos);

        const pendientesCount = comandas.filter(c => c.estadoRegistro === 'en_curso').length;
        const cerradasCount = comandas.filter(c => c.estadoRegistro === 'pagada' || c.estadoRegistro === 'completada').length;

        return {
            comandas,
            registros,
            pendientesCount,
            cerradasCount,
            enCursoCount: totalEnCursoPlatos,
            resumen: {
                totalComandas: comandas.length,
                totalFinalizados,
                totalEnCurso: totalEnCursoPlatos,
                totalCerradas: cerradasCount,
                tiempoPromedioSegundos: totalFinalizados > 0 ? Math.round(sumaTiempos / totalFinalizados) : 0,
                porcentajeDentroSLA: totalFinalizados > 0 ? Math.round((dentroSLA / totalFinalizados) * 100) : 0,
                porPlato,
                porCocinero
            }
        };
    } catch (error) {
        logger.error('Error al obtener historial de platos cocinados', { error: error.message });
        throw error;
    }
}

module.exports = {
    obtenerCocineros,
    obtenerCocineroPorId,
    obtenerConfigKDS,
    actualizarConfigKDS,
    obtenerPerfilVerCocina,
    guardarPerfilVerCocina,
    listarPerfilesVerCocina,
    obtenerPerfilVerCocinaPorId,
    crearPerfilVerCocina,
    actualizarPerfilVerCocina,
    eliminarPerfilVerCocina,
    asignarRolCocinero,
    quitarRolCocinero,
    registrarConexion,
    incrementarPlatosPreparados,
    calcularMetricasRendimiento,
    obtenerMetricasTodosCocineros,
    obtenerPlatosTopPorCocinero,
    obtenerRendimientoEnVivo,
    obtenerResumenTurno,
    obtenerHistorialPlatosCocinados
};
