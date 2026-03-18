/**
 * COCINEROS REPOSITORY
 * Acceso a datos para gestión de cocineros y su configuración KDS
 */

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
            .select('name DNI phoneNumber rol activo zonaIds createdAt')
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
 */
async function calcularMetricasRendimiento(usuarioId, fechaInicio, fechaFin) {
    try {
        const matchStage = {
            IsActive: true,
            createdAt: {
                $gte: new Date(fechaInicio),
                $lte: new Date(fechaFin)
            }
        };
        
        // Pipeline de agregación para obtener métricas
        const metricas = await Comanda.aggregate([
            { $match: matchStage },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.tiempos.en_espera': { $exists: true },
                    'platos.tiempos.recoger': { $exists: true }
                }
            },
            {
                $project: {
                    platoId: '$platos.platoId',
                    tiempoPreparacion: {
                        $divide: [
                            { $subtract: ['$platos.tiempos.recoger', '$platos.tiempos.en_espera'] },
                            60000 // Convertir a minutos
                        ]
                    },
                    categoria: '$platos.plato.categoria',
                    comandaId: '$_id',
                    createdAt: '$createdAt'
                }
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
        
        if (metricas.length === 0) {
            return {
                totalPlatos: 0,
                tiempoPromedioPreparacion: 0,
                tiempoMinPreparacion: 0,
                tiempoMaxPreparacion: 0,
                porcentajeDentroSLA: 0
            };
        }
        
        const m = metricas[0];
        return {
            totalPlatos: m.totalPlatos,
            tiempoPromedioPreparacion: Math.round(m.tiempoPromedioPreparacion * 10) / 10,
            tiempoMinPreparacion: Math.round(m.tiempoMinPreparacion * 10) / 10,
            tiempoMaxPreparacion: Math.round(m.tiempoMaxPreparacion * 10) / 10,
            porcentajeDentroSLA: Math.round((m.platosDentroSLA / m.totalPlatos) * 100)
        };
    } catch (error) {
        logger.error('Error al calcular métricas de rendimiento', { error: error.message });
        throw error;
    }
}

/**
 * Obtener métricas de todos los cocineros
 */
async function obtenerMetricasTodosCocineros(fechaInicio, fechaFin) {
    try {
        const cocineros = await Mozos.find({ rol: 'cocinero', activo: true })
            .select('_id name')
            .lean();
        
        const metricas = await Promise.all(
            cocineros.map(async (cocinero) => {
                const config = await ConfigCocinero.findOne({ usuarioId: cocinero._id }).lean();
                const metricasRendimiento = await calcularMetricasRendimiento(
                    cocinero._id,
                    fechaInicio,
                    fechaFin
                );
                
                return {
                    ...cocinero,
                    alias: config?.aliasCocinero || cocinero.name,
                    estadisticas: config?.estadisticas || {},
                    metricas: metricasRendimiento
                };
            })
        );
        
        // Ordenar por tiempo promedio (menor es mejor)
        return metricas.sort((a, b) => 
            a.metricas.tiempoPromedioPreparacion - b.metricas.tiempoPromedioPreparacion
        );
    } catch (error) {
        logger.error('Error al obtener métricas de todos los cocineros', { error: error.message });
        throw error;
    }
}

/**
 * Obtener platos más preparados por un cocinero
 */
async function obtenerPlatosTopPorCocinero(usuarioId, fechaInicio, fechaFin, limite = 10) {
    try {
        const matchStage = {
            IsActive: true,
            createdAt: {
                $gte: new Date(fechaInicio),
                $lte: new Date(fechaFin)
            }
        };
        
        const platosTop = await Comanda.aggregate([
            { $match: matchStage },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true }
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
                                { $subtract: ['$platos.tiempos.recoger', '$platos.tiempos.en_espera'] },
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
    obtenerPlatosTopPorCocinero
};
