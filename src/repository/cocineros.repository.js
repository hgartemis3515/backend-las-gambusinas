/**
 * COCINEROS REPOSITORY
 * Acceso a datos para gestión de cocineros y su configuración KDS
 */

const mongoose = require('mongoose');
const ConfigCocinero = require('../database/models/configCocinero.model');
const Mozos = require('../database/models/mozos.model');
const Comanda = require('../database/models/comanda.model');
const logger = require('../utils/logger');

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
        
        const config = await ConfigCocinero.findOneAndUpdate(
            { usuarioId },
            {
                $set: {
                    ...datosConfig,
                    actualizadoPor,
                    updatedAt: new Date()
                }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        
        logger.info('Configuración KDS actualizada', { usuarioId, actualizadoPor });
        
        return config;
    } catch (error) {
        logger.error('Error al actualizar configuración KDS', { error: error.message });
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
                            { $subtract: ['$platos.tiempos.recoger', '$platos.procesadoPor.timestamp'] },
                            60000
                        ]
                    },
                    tiempoCola: {
                        $divide: [
                            {
                                $subtract: [
                                    '$platos.procesadoPor.timestamp',
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

        const totalEnCurso = platosEnCurso.length > 0 ? platosEnCurso[0].total : 0;

        if (metricas.length === 0) {
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

        const m = metricas[0];
        return {
            totalPlatos: m.totalPlatos,
            tiempoPromedioPreparacion: Math.round(m.tiempoPromedioPreparacion * 10) / 10,
            tiempoMinPreparacion: Math.round(m.tiempoMinPreparacion * 10) / 10,
            tiempoMaxPreparacion: Math.round(m.tiempoMaxPreparacion * 10) / 10,
            porcentajeDentroSLA: Math.round((m.platosDentroSLA / m.totalPlatos) * 100),
            tiempoPromedioCola: Math.round((m.tiempoPromedioCola || 0) * 10) / 10,
            platosEnCurso: totalEnCurso
        };
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
                                { $subtract: ['$platos.tiempos.recoger', '$platos.procesadoPor.timestamp'] },
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
        const matchStage = {
            IsActive: true,
            'platos.procesandoPor.cocineroId': { $ne: null, $exists: true },
            'platos.estado': { $in: ['pedido', 'en_espera'] }
        };

        if (usuarioId) {
            matchStage['platos.procesandoPor.cocineroId'] = new mongoose.Types.ObjectId(usuarioId);
        }

        const comandas = await Comanda.aggregate([
            { $match: matchStage },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.procesandoPor.cocineroId': { $ne: null, $exists: true },
                    'platos.estado': { $in: ['pedido', 'en_espera'] },
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true }
                }
            },
            {
                $project: {
                    comandaId: '$_id',
                    comandaNumber: '$comandaNumber',
                    platoId: '$platos.platoId',
                    platoNombre: '$platos.nombre',
                    cantidad: '$platos.cantidad',
                    estado: '$platos.estado',
                    observaciones: '$platos.observaciones',
                    complementos: '$platos.complementos',
                    prioritario: '$platos.prioritario',
                    cocineroId: '$platos.procesandoPor.cocineroId',
                    cocineroNombre: '$platos.procesandoPor.nombre',
                    cocineroAlias: '$platos.procesandoPor.alias',
                    procesandoDesde: '$platos.procesandoPor.timestamp',
                    mesaNum: '$mesas.nummesa',
                    mesaIds: { $ifNull: ['$mesaIds', []] }
                }
            }
        ]);

        // Agrupar por cocineroId
        const porCocinero = new Map();
        for (const p of comandas) {
            const key = p.cocineroId.toString();
            if (!porCocinero.has(key)) {
                porCocinero.set(key, {
                    cocineroId: key,
                    cocineroNombre: p.cocineroNombre || 'Cocinero',
                    cocineroAlias: p.cocineroAlias || p.cocineroNombre || 'Cocinero',
                    bloques: []
                });
            }
            const cocinero = porCocinero.get(key);
            delete p.cocineroId;
            delete p.cocineroNombre;
            delete p.cocineroAlias;
            cocinero.bloques.push(p);
        }

        // Agregar info extendida (fotoUrl, alias, config KDS, métricas del día)
        const cocinerosIds = Array.from(porCocinero.keys());
        const cocinerosInfo = await Mozos.find({
            _id: { $in: cocinerosIds.map(id => new mongoose.Types.ObjectId(id)) }
        })
            .select('_id name fotoUrl')
            .lean();
        const configsInfo = await ConfigCocinero.find({
            usuarioId: { $in: cocinerosIds.map(id => new mongoose.Types.ObjectId(id)) }
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
                            { $subtract: ['$platos.tiempos.recoger', '$platos.procesadoPor.timestamp'] },
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

        // Platos en curso (ahora)
        const enCurso = await Comanda.aggregate([
            {
                $match: {
                    IsActive: true,
                    'platos.procesandoPor.cocineroId': { $ne: null, $exists: true },
                    'platos.estado': { $in: ['pedido', 'en_espera'] }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.procesandoPor.cocineroId': { $ne: null, $exists: true },
                    'platos.estado': { $in: ['pedido', 'en_espera'] }
                }
            },
            { $count: 'total' }
        ]);

        const activos = await Mozos.countDocuments({ rol: 'cocinero', activo: true });

        return {
            platosEnCurso: enCurso.length > 0 ? enCurso[0].total : 0,
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

module.exports = {
    obtenerCocineros,
    obtenerCocineroPorId,
    obtenerConfigKDS,
    actualizarConfigKDS,
    asignarRolCocinero,
    quitarRolCocinero,
    registrarConexion,
    incrementarPlatosPreparados,
    calcularMetricasRendimiento,
    obtenerMetricasTodosCocineros,
    obtenerPlatosTopPorCocinero,
    obtenerRendimientoEnVivo,
    obtenerResumenTurno
};
