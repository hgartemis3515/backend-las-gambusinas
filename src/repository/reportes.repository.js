/**
 * REPORTES REPOSITORY
 * Aggregations de MongoDB para métricas de reportes
 * Incluye: Métricas de cocineros, series temporales, heatmaps
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

// Modelos
const Comanda = mongoose.model('Comanda') || require('../database/models/comanda.model');
const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');
const Plato = mongoose.model('platos') || require('../database/models/plato.model');

// ============================================================
// MÉTRICAS DE COCINEROS
// ============================================================

/**
 * Obtiene métricas agregadas de todos los cocineros en un rango de fechas
 * @param {string} fechaInicio - Fecha inicio (YYYY-MM-DD)
 * @param {string} fechaFin - Fecha fin (YYYY-MM-DD)
 * @returns {Promise<Object>} Métricas agregadas por cocinero
 */
async function getMetricasCocineros(fechaInicio, fechaFin) {
    try {
        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        logger.info('[ReportesRepo] Obteniendo métricas de cocineros', {
            fechaInicio: fechaInicioDate,
            fechaFin: fechaFinDate
        });

        // Pipeline principal: obtener todos los platos preparados con su cocinero
        const pipeline = [
            // Filtro de fechas y comandas activas
            {
                $match: {
                    IsActive: true,
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                }
            },
            // Desenrollar platos
            { $unwind: '$platos' },
            // Filtrar platos válidos (no eliminados, no anulados, con tiempo de finalización y cocinero asignado)
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.tiempos.recoger': { $exists: true, $ne: null },
                    'platos.procesadoPor.cocineroId': { $exists: true, $ne: null }
                }
            },
            // Proyectar campos necesarios
            {
                $project: {
                    comandaId: '$_id',
                    comandaNumber: 1,
                    createdAt: 1,
                    platoId: '$platos.platoId',
                    platoRef: '$platos.plato',
                    estado: '$platos.estado',
                    tiempos: '$platos.tiempos',
                    procesadoPor: '$platos.procesadoPor',
                    tiempoPreparacion: {
                        $divide: [
                            { $subtract: ['$platos.tiempos.recoger', '$platos.tiempos.en_espera'] },
                            60000 // Convertir a minutos
                        ]
                    },
                    horaPreparacion: {
                        $hour: '$platos.tiempos.recoger'
                    },
                    diaPreparacion: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$platos.tiempos.recoger',
                            timezone: 'America/Lima'
                        }
                    }
                }
            },
            // Agrupar por cocinero
            {
                $group: {
                    _id: '$procesadoPor.cocineroId',
                    nombre: { $first: '$procesadoPor.nombre' },
                    alias: { $first: '$procesadoPor.alias' },
                    totalPlatos: { $sum: 1 },
                    tickets: { $addToSet: '$comandaId' },
                    tiempoTotal: { $sum: '$tiempoPreparacion' },
                    tiempoMin: { $min: '$tiempoPreparacion' },
                    tiempoMax: { $max: '$tiempoPreparacion' },
                    tiemposArray: { $push: '$tiempoPreparacion' },
                    platosDentroSLA: {
                        $sum: { $cond: [{ $lte: ['$tiempoPreparacion', 15] }, 1, 0] }
                    },
                    platosFueraSLA: {
                        $sum: { $cond: [{ $gt: ['$tiempoPreparacion', 20] }, 1, 0] }
                    },
                    primeraActividad: { $min: '$tiempos.en_espera' },
                    ultimaActividad: { $max: '$tiempos.recoger' },
                    platosPorHora: { $push: '$horaPreparacion' },
                    platosPorDia: { $push: '$diaPreparacion' },
                    platoIds: { $push: '$platoRef' }
                }
            },
            // Calcular métricas derivadas
            {
                $project: {
                    _id: 1,
                    nombre: 1,
                    alias: 1,
                    totalPlatos: 1,
                    totalTickets: { $size: '$tickets' },
                    tiempoPromedioPlato: { $round: [{ $divide: ['$tiempoTotal', '$totalPlatos'] }, 1] },
                    tiempoMin: { $round: ['$tiempoMin', 1] },
                    tiempoMax: { $round: ['$tiempoMax', 1] },
                    porcentajeSLA: {
                        $round: [{ $multiply: [{ $divide: ['$platosDentroSLA', '$totalPlatos'] }, 100] }, 1]
                    },
                    porcentajeRetrasos: {
                        $round: [{ $multiply: [{ $divide: ['$platosFueraSLA', '$totalPlatos'] }, 100] }, 1]
                    },
                    horasTrabajadas: {
                        $round: [
                            { $divide: [
                                { $subtract: ['$ultimaActividad', '$primeraActividad'] },
                                3600000 // Convertir a horas
                            ]},
                            1
                        ]
                    },
                    platosPorHora: 1,
                    platosPorDia: 1,
                    platoIds: 1
                }
            },
            // Ordenar por total de platos
            { $sort: { totalPlatos: -1 } }
        ];

        const resultados = await Comanda.aggregate(pipeline);

        // Enriquecer con información de cocineros sin actividad
        const cocinerosCompletos = await enriquecerCocineros(resultados, fechaInicioDate, fechaFinDate);

        // Calcular métricas generales
        const resumen = calcularResumenGeneral(cocinerosCompletos);

        return {
            resumen,
            cocineros: cocinerosCompletos
        };

    } catch (error) {
        logger.error('[ReportesRepo] Error en getMetricasCocineros', { error: error.message });
        throw error;
    }
}

/**
 * Enriquece la lista con cocineros que no tuvieron actividad
 */
async function enriquecerCocineros(cocinerosConActividad, fechaInicio, fechaFin) {
    try {
        // Obtener todos los cocineros del sistema
        const todosCocineros = await Mozos.find({
            rol: { $in: ['cocinero', 'admin', 'supervisor'] },
            activo: { $ne: false }
        })
        .select('_id name aliasCocinero rol')
        .lean();

        const cocinerosMap = new Map();

        // Agregar cocineros con actividad
        cocinerosConActividad.forEach(c => {
            if (c._id) {
                cocinerosMap.set(c._id.toString(), {
                    _id: c._id,
                    nombre: c.nombre || 'Sin nombre',
                    alias: c.alias || c.nombre || 'Cocinero',
                    totalPlatos: c.totalPlatos,
                    totalTickets: c.totalTickets,
                    tiempoPromedioPlato: c.tiempoPromedioPlato || 0,
                    tiempoMin: c.tiempoMin || 0,
                    tiempoMax: c.tiempoMax || 0,
                    porcentajeSLA: c.porcentajeSLA || 0,
                    porcentajeRetrasos: c.porcentajeRetrasos || 0,
                    platosHora: calcularPlatosHora(c),
                    participacion: 0, // Se calculará después
                    score: calcularScore(c),
                    sinActividad: false
                });
            }
        });

        // Agregar cocineros sin actividad en el período
        todosCocineros.forEach(c => {
            const id = c._id.toString();
            if (!cocinerosMap.has(id)) {
                cocinerosMap.set(id, {
                    _id: c._id,
                    nombre: c.name || 'Sin nombre',
                    alias: c.aliasCocinero || c.name || 'Cocinero',
                    totalPlatos: 0,
                    totalTickets: 0,
                    tiempoPromedioPlato: 0,
                    tiempoMin: 0,
                    tiempoMax: 0,
                    porcentajeSLA: 0,
                    porcentajeRetrasos: 0,
                    platosHora: 0,
                    participacion: 0,
                    score: 0,
                    sinActividad: true
                });
            }
        });

        // Calcular participación de cada cocinero
        const totalPlatosGlobal = Array.from(cocinerosMap.values())
            .reduce((sum, c) => sum + c.totalPlatos, 0);

        cocinerosMap.forEach(c => {
            c.participacion = totalPlatosGlobal > 0
                ? Math.round((c.totalPlatos / totalPlatosGlobal) * 100 * 10) / 10
                : 0;
        });

        // Convertir a array y ordenar por platos
        return Array.from(cocinerosMap.values())
            .sort((a, b) => b.totalPlatos - a.totalPlatos);

    } catch (error) {
        logger.error('[ReportesRepo] Error en enriquecerCocineros', { error: error.message });
        return cocinerosConActividad;
    }
}

/**
 * Calcula platos por hora
 */
function calcularPlatosHora(cocinero) {
    if (!cocinero.horasTrabajadas || cocinero.horasTrabajadas < 0.5) {
        // Si trabajó menos de 30 min, usar tiempo promedio como base
        return cocinero.tiempoPromedioPlato > 0
            ? Math.round(60 / cocinero.tiempoPromedioPlato * 10) / 10
            : 0;
    }
    return Math.round((cocinero.totalPlatos / cocinero.horasTrabajadas) * 10) / 10;
}

/**
 * Calcula score de eficiencia del cocinero
 * Fórmula: (Platos × 1) + (Platos dentro SLA × 0.5) - (Retrasos × 2)
 */
function calcularScore(cocinero) {
    if (!cocinero.totalPlatos) return 0;

    const platosDentroSLA = Math.round(cocinero.totalPlatos * (cocinero.porcentajeSLA || 0) / 100);
    const platosFueraSLA = Math.round(cocinero.totalPlatos * (cocinero.porcentajeRetrasos || 0) / 100);

    const score = (cocinero.totalPlatos * 1) + (platosDentroSLA * 0.5) - (platosFueraSLA * 2);

    return Math.round(score);
}

/**
 * Calcula resumen general de todos los cocineros
 */
function calcularResumenGeneral(cocineros) {
    const totalPlatos = cocineros.reduce((sum, c) => sum + (c.totalPlatos || 0), 0);
    const totalTickets = new Set(cocineros.flatMap(c => c.tickets || [])).size;
    const cocinerosActivos = cocineros.filter(c => c.totalPlatos > 0).length;

    const tiemposValidos = cocineros.filter(c => c.tiempoPromedioPlato > 0);
    const tiempoPromedioGeneral = tiemposValidos.length > 0
        ? Math.round(tiemposValidos.reduce((sum, c) => sum + c.tiempoPromedioPlato, 0) / tiemposValidos.length * 10) / 10
        : 0;

    const platosDentroSLA = cocineros.reduce((sum, c) => {
        return sum + Math.round((c.totalPlatos || 0) * ((c.porcentajeSLA || 0) / 100));
    }, 0);

    const porcentajeDentroSLA = totalPlatos > 0
        ? Math.round((platosDentroSLA / totalPlatos) * 100)
        : 0;

    return {
        totalPlatos,
        totalTickets,
        cocinerosActivos,
        tiempoPromedioGeneral,
        porcentajeDentroSLA
    };
}

// ============================================================
// SERIES TEMPORALES
// ============================================================

/**
 * Obtiene serie temporal de platos por cocinero
 * @param {string} fechaInicio - Fecha inicio
 * @param {string} fechaFin - Fecha fin
 * @param {string} agruparPor - 'dia', 'semana', 'hora'
 */
async function getSerieTemporalCocineros(fechaInicio, fechaFin, agruparPor = 'dia') {
    try {
        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        let formatoFecha;
        switch (agruparPor) {
            case 'hora':
                formatoFecha = '%Y-%m-%d %H:00';
                break;
            case 'semana':
                formatoFecha = '%Y-%U';
                break;
            default:
                formatoFecha = '%Y-%m-%d';
        }

        const pipeline = [
            {
                $match: {
                    IsActive: true,
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.tiempos.recoger': { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: {
                        fecha: {
                            $dateToString: {
                                format: formatoFecha,
                                date: '$platos.tiempos.recoger',
                                timezone: 'America/Lima'
                            }
                        },
                        cocineroId: '$platos.procesadoPor.cocineroId',
                        cocineroNombre: '$platos.procesadoPor.nombre'
                    },
                    cantidad: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.fecha',
                    cocineros: {
                        $push: {
                            id: '$_id.cocineroId',
                            nombre: '$_id.cocineroNombre',
                            cantidad: '$cantidad'
                        }
                    },
                    total: { $sum: '$cantidad' }
                }
            },
            { $sort: { _id: 1 } }
        ];

        const resultados = await Comanda.aggregate(pipeline);

        // Formatear para el frontend
        const labels = resultados.map(r => r._id);
        const cocinerosData = {};

        resultados.forEach(r => {
            r.cocineros.forEach(c => {
                if (!c.id) return;
                const nombre = c.nombre || 'Sin asignar';
                if (!cocinerosData[nombre]) {
                    cocinerosData[nombre] = {
                        label: nombre,
                        data: new Array(labels.length).fill(0)
                    };
                }
                const idx = labels.indexOf(r._id);
                if (idx >= 0) {
                    cocinerosData[nombre].data[idx] = c.cantidad;
                }
            });
        });

        return {
            labels,
            datasets: Object.values(cocinerosData).slice(0, 8) // Top 8 cocineros
        };

    } catch (error) {
        logger.error('[ReportesRepo] Error en getSerieTemporalCocineros', { error: error.message });
        throw error;
    }
}

// ============================================================
// HEATMAP HORARIO
// ============================================================

/**
 * Obtiene heatmap de carga de trabajo por hora y cocinero
 */
async function getHeatmapHorario(fechaInicio, fechaFin) {
    try {
        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        const pipeline = [
            {
                $match: {
                    IsActive: true,
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    'platos.tiempos.recoger': { $exists: true, $ne: null },
                    'platos.procesadoPor.cocineroId': { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: {
                        hora: { $hour: '$platos.tiempos.recoger' },
                        cocineroId: '$platos.procesadoPor.cocineroId',
                        cocineroNombre: '$platos.procesadoPor.nombre'
                    },
                    cantidad: { $sum: 1 }
                }
            },
            {
                $project: {
                    hora: '$_id.hora',
                    cocineroId: '$_id.cocineroId',
                    cocinero: '$_id.cocineroNombre',
                    cantidad: 1,
                    _id: 0
                }
            },
            { $sort: { hora: 1, cantidad: -1 } }
        ];

        const resultados = await Comanda.aggregate(pipeline);

        // Formatear para el frontend
        const horasUnicas = [...new Set(resultados.map(r => r.hora))].sort((a, b) => a - b);
        const cocinerosUnicos = [...new Set(resultados.map(r => r.cocinero))].filter(Boolean);

        const heatmapData = resultados.map(r => ({
            hora: r.hora,
            horaLabel: `${r.hora}:00`,
            cocinero: r.cocinero,
            cantidad: r.cantidad
        }));

        return {
            horas: horasUnicas.map(h => `${h}:00`),
            cocineros: cocinerosUnicos.slice(0, 10),
            data: heatmapData
        };

    } catch (error) {
        logger.error('[ReportesRepo] Error en getHeatmapHorario', { error: error.message });
        throw error;
    }
}

// ============================================================
// DISTRIBUCIÓN POR CATEGORÍA
// ============================================================

/**
 * Obtiene distribución de platos por categoría para cada cocinero
 */
async function getDistribucionCategorias(fechaInicio, fechaFin) {
    try {
        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        const pipeline = [
            {
                $match: {
                    IsActive: true,
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
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
            { $unwind: { path: '$platoInfo', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: {
                        cocineroId: '$platos.procesadoPor.cocineroId',
                        cocineroNombre: '$platos.procesadoPor.nombre',
                        categoria: { $ifNull: ['$platoInfo.categoria', 'Sin categoría'] }
                    },
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
            {
                $group: {
                    _id: '$_id.cocineroId',
                    cocinero: { $first: '$_id.cocineroNombre' },
                    categorias: {
                        $push: {
                            nombre: '$_id.categoria',
                            cantidad: '$cantidad',
                            tiempoPromedio: { $round: ['$tiempoPromedio', 1] }
                        }
                    },
                    total: { $sum: '$cantidad' }
                }
            }
        ];

        const resultados = await Comanda.aggregate(pipeline);

        // También obtener distribución general
        const pipelineGeneral = [
            {
                $match: {
                    IsActive: true,
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
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
            { $unwind: { path: '$platoInfo', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $ifNull: ['$platoInfo.categoria', 'Sin categoría'] },
                    cantidad: { $sum: 1 }
                }
            },
            { $sort: { cantidad: -1 } }
        ];

        const distribucionGeneral = await Comanda.aggregate(pipelineGeneral);

        return {
            porCocinero: resultados,
            general: distribucionGeneral.map(d => ({
                categoria: d._id,
                cantidad: d.cantidad
            }))
        };

    } catch (error) {
        logger.error('[ReportesRepo] Error en getDistribucionCategorias', { error: error.message });
        throw error;
    }
}

// ============================================================
// DETALLE DE COCINERO
// ============================================================

/**
 * Obtiene detalle de un cocinero específico
 */
async function getDetalleCocinero(cocineroId, fechaInicio, fechaFin) {
    try {
        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        // Obtener datos del cocinero
        const cocinero = await Mozos.findById(cocineroId)
            .select('name aliasCocinero rol')
            .lean();

        if (!cocinero) {
            throw new Error('Cocinero no encontrado');
        }

        // Platos preparados
        const pipelinePlatos = [
            {
                $match: {
                    IsActive: true,
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate },
                    'platos.procesadoPor.cocineroId': mongoose.Types.ObjectId.isValid(cocineroId)
                        ? new mongoose.Types.ObjectId(cocineroId)
                        : cocineroId
                }
            },
            { $unwind: '$platos' },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
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
            { $unwind: { path: '$platoInfo', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$platos.platoId',
                    nombre: { $first: '$platoInfo.nombre' },
                    categoria: { $first: { $ifNull: ['$platoInfo.categoria', 'Sin categoría'] } },
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
            { $limit: 20 }
        ];

        const platosPreparados = await Comanda.aggregate(pipelinePlatos);

        return {
            cocinero: {
                _id: cocineroId,
                nombre: cocinero.name,
                alias: cocinero.aliasCocinero || cocinero.name
            },
            platosPreparados: platosPreparados.map(p => ({
                platoId: p._id,
                nombre: p.nombre || 'Desconocido',
                categoria: p.categoria,
                cantidad: p.cantidad,
                tiempoPromedio: Math.round(p.tiempoPromedio * 10) / 10
            }))
        };

    } catch (error) {
        logger.error('[ReportesRepo] Error en getDetalleCocinero', { error: error.message });
        throw error;
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    getMetricasCocineros,
    getSerieTemporalCocineros,
    getHeatmapHorario,
    getDistribucionCategorias,
    getDetalleCocinero
};
