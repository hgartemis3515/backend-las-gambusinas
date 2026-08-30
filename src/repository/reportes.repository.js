/**
 * REPORTES REPOSITORY
 * Aggregations de MongoDB para métricas de reportes
 * Incluye: Métricas de cocineros, series temporales, heatmaps
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const {
    rangoLima,
    matchComandasEstadisticas,
    matchComandaVigente,
    matchBoucherVigente,
    exprMontoComanda,
    exprFechaComanda,
    exprPrecioPlatoUnwind,
    listarFilasEstadisticas,
    cargarConfigMonedaEstadisticas,
    etiquetasComplemento
} = require('../utils/estadisticasComandas');

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
        const { inicio: fechaInicioDate, fin: fechaFinDate } = rangoLima(fechaInicio, fechaFin);

        logger.info('[ReportesRepo] Obteniendo métricas de cocineros', {
            fechaInicio: fechaInicioDate,
            fechaFin: fechaFinDate
        });

        // Pipeline principal: obtener todos los platos preparados con su cocinero
        const pipeline = [
            // Filtro de fechas y comandas activas
            {
                $match: matchComandaVigente({
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                })
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
        const { inicio: fechaInicioDate, fin: fechaFinDate } = rangoLima(fechaInicio, fechaFin);

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
                $match: matchComandaVigente({
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                })
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
        const { inicio: fechaInicioDate, fin: fechaFinDate } = rangoLima(fechaInicio, fechaFin);

        const pipeline = [
            {
                $match: matchComandaVigente({
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                })
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
        const { inicio: fechaInicioDate, fin: fechaFinDate } = rangoLima(fechaInicio, fechaFin);

        const pipeline = [
            {
                $match: matchComandaVigente({
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                })
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
                $match: matchComandaVigente({
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate }
                })
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

function round1(n) {
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 10) / 10;
}

function minutosEntre(a, b) {
    if (!a || !b) return null;
    const m = (new Date(b) - new Date(a)) / 60000;
    if (!Number.isFinite(m) || m < 0 || m > 24 * 60) return null;
    return round1(m);
}

function oidCocinero(cocineroId) {
    return mongoose.Types.ObjectId.isValid(cocineroId)
        ? new mongoose.Types.ObjectId(cocineroId)
        : cocineroId;
}

/**
 * Detalle de un cocinero: cada plato atendido (tiempos) y comandas únicas.
 */
async function getDetalleCocinero(cocineroId, fechaInicio, fechaFin) {
    try {
        const { inicio: fechaInicioDate, fin: fechaFinDate } = rangoLima(fechaInicio, fechaFin);

        const cocinero = await Mozos.findById(cocineroId)
            .select('name aliasCocinero rol')
            .lean();

        if (!cocinero) {
            throw new Error('Cocinero no encontrado');
        }

        const oid = oidCocinero(cocineroId);
        const matchCocinero = {
            $or: [
                { 'platos.procesadoPor.cocineroId': oid },
                { 'platos.procesandoPor.cocineroId': oid }
            ]
        };

        const pipeline = [
            {
                $match: matchComandaVigente({
                    createdAt: { $gte: fechaInicioDate, $lte: fechaFinDate },
                    ...matchCocinero
                })
            },
            { $unwind: { path: '$platos', includeArrayIndex: 'platoIdx' } },
            {
                $match: {
                    'platos.eliminado': { $ne: true },
                    'platos.anulado': { $ne: true },
                    ...matchCocinero
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
                $lookup: {
                    from: 'mesas',
                    localField: 'mesas',
                    foreignField: '_id',
                    as: 'mesaInfo'
                }
            },
            { $unwind: { path: '$mesaInfo', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    comandaId: '$_id',
                    comandaNumber: 1,
                    status: 1,
                    createdAt: 1,
                    mozoNombre: 1,
                    totalCalculado: 1,
                    tiempoEnEspera: 1,
                    tiempoPagado: 1,
                    tiempoEntregado: 1,
                    mesaNum: { $ifNull: ['$mesaNumero', '$mesaInfo.nummesa'] },
                    nombre: { $ifNull: ['$platoInfo.nombre', '$platos.nombre'] },
                    categoria: { $ifNull: ['$platoInfo.categoria', 'Sin categoría'] },
                    cantidad: {
                        $ifNull: [
                            { $arrayElemAt: ['$cantidades', '$platoIdx'] },
                            { $ifNull: ['$platos.cantidad', 1] }
                        ]
                    },
                    estado: '$platos.estado',
                    tipoServicio: { $ifNull: ['$platos.tipoServicio', 'mesa'] },
                    notaEspecial: '$platos.notaEspecial',
                    tiempos: '$platos.tiempos',
                    complementos: '$platos.complementosSeleccionados',
                    procesadoPor: '$platos.procesadoPor',
                    procesandoPor: '$platos.procesandoPor',
                    platoId: '$platos.platoId'
                }
            },
            { $sort: { createdAt: -1, 'tiempos.pedido': -1 } },
            { $limit: 800 }
        ];

        const lineas = await Comanda.aggregate(pipeline);

        const platos = lineas.map((l) => {
            const t = l.tiempos || {};
            const inicioPrep = t.en_espera || l.procesadoPor?.tomadoEn || t.pedido;
            const cant = Number(l.cantidad);
            return {
                comandaId: l.comandaId,
                comandaNumber: l.comandaNumber,
                mesa: l.mesaNum != null ? l.mesaNum : null,
                mozo: l.mozoNombre || '—',
                statusComanda: l.status,
                createdAt: l.createdAt,
                nombre: l.nombre || 'Desconocido',
                categoria: l.categoria || 'Sin categoría',
                cantidad: Number.isFinite(cant) && cant > 0 ? cant : 1,
                estado: l.estado || 'pedido',
                tipoServicio: l.tipoServicio || 'mesa',
                notaEspecial: l.notaEspecial || '',
                complementos: etiquetasComplemento({ complementosSeleccionados: l.complementos }),
                tiempos: {
                    pedido: t.pedido || null,
                    en_espera: t.en_espera || null,
                    recoger: t.recoger || null,
                    salio: t.salio || null,
                    entregado: t.entregado || null,
                    pagado: t.pagado || null
                },
                minutosPrep: minutosEntre(inicioPrep, t.recoger),
                minutosPedidoAListo: minutosEntre(t.pedido, t.recoger),
                minutosListoASalio: minutosEntre(t.recoger, t.salio),
                minutosSalioAEntregado: minutosEntre(t.salio, t.entregado)
            };
        });

        const comandasMap = new Map();
        for (const l of lineas) {
            const key = String(l.comandaId);
            if (!comandasMap.has(key)) {
                comandasMap.set(key, {
                    _id: l.comandaId,
                    comandaNumber: l.comandaNumber,
                    mesa: l.mesaNum != null ? l.mesaNum : null,
                    mozo: l.mozoNombre || '—',
                    status: l.status,
                    createdAt: l.createdAt,
                    totalCalculado: Number(l.totalCalculado) || 0,
                    totalPlatos: 0,
                    _sumPrep: 0,
                    _nPrep: 0
                });
            }
        }
        for (const p of platos) {
            const c = comandasMap.get(String(p.comandaId));
            if (!c) continue;
            c.totalPlatos += p.cantidad;
            if (Number.isFinite(p.minutosPrep)) {
                c._sumPrep += p.minutosPrep;
                c._nPrep += 1;
            }
        }
        const comandas = Array.from(comandasMap.values())
            .map((c) => {
                const { _sumPrep, _nPrep, ...rest } = c;
                return {
                    ...rest,
                    tiempoPromedioPrep: _nPrep > 0 ? round1(_sumPrep / _nPrep) : null
                };
            })
            .sort((a, b) => (Number(b.comandaNumber) || 0) - (Number(a.comandaNumber) || 0));

        const aggMap = new Map();
        for (const p of platos) {
            const k = p.nombre;
            if (!aggMap.has(k)) {
                aggMap.set(k, { nombre: k, categoria: p.categoria, cantidad: 0, _sum: 0, _n: 0 });
            }
            const a = aggMap.get(k);
            a.cantidad += p.cantidad;
            if (Number.isFinite(p.minutosPrep)) {
                a._sum += p.minutosPrep;
                a._n += 1;
            }
        }
        const platosPreparados = Array.from(aggMap.values())
            .map((a) => ({
                nombre: a.nombre,
                categoria: a.categoria,
                cantidad: a.cantidad,
                tiempoPromedio: a._n > 0 ? round1(a._sum / a._n) : 0
            }))
            .sort((a, b) => b.cantidad - a.cantidad)
            .slice(0, 20);

        return {
            cocinero: {
                _id: cocineroId,
                nombre: cocinero.name,
                alias: cocinero.aliasCocinero || cocinero.name
            },
            platos,
            comandas,
            platosPreparados
        };

    } catch (error) {
        logger.error('[ReportesRepo] Error en getDetalleCocinero', { error: error.message });
        throw error;
    }
}

// ============================================================
// VENTAS POR FECHA
// ============================================================

/**
 * Obtiene ventas agrupadas por hora, día o semana
 * @param {string} fechaInicio - Fecha inicio (YYYY-MM-DD)
 * @param {string} fechaFin - Fecha fin (YYYY-MM-DD)
 * @param {string} agruparPor - 'hora', 'dia', 'semana'
 * @returns {Promise<Object>} Ventas agrupadas
 */
async function getVentas(fechaInicio, fechaFin, agruparPor = 'dia') {
    try {
        const Boucher = mongoose.model('Boucher') || require('../database/models/boucher.model');
        const { inicio: fechaInicioDate, fin: fechaFinDate } = rangoLima(fechaInicio, fechaFin);
        await cargarConfigMonedaEstadisticas();

        logger.info('[ReportesRepo] Obteniendo ventas', {
            fechaInicio: fechaInicioDate,
            fechaFin: fechaFinDate,
            agruparPor
        });

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

        const formatDatos = (resultados) => {
            const datos = resultados.map(r => ({
                _id: r._id,
                hora: agruparPor === 'hora' ? r._id : undefined,
                fecha: agruparPor !== 'hora' ? r._id : undefined,
                total: Math.round((r.total || 0) * 100) / 100,
                subtotal: Math.round((r.subtotal != null ? r.subtotal : (r.total || 0) / 1.18) * 100) / 100,
                igv: Math.round((r.igv != null ? r.igv : (r.total || 0) - (r.total || 0) / 1.18) * 100) / 100,
                cantidadBouchers: r.cantidadBouchers
            }));
            const totalVentas = datos.reduce((sum, d) => sum + d.total, 0);
            const totalBouchers = datos.reduce((sum, d) => sum + d.cantidadBouchers, 0);
            return {
                datos,
                resumen: {
                    totalVentas: Math.round(totalVentas * 100) / 100,
                    totalBouchers,
                    promedioPorBoucher: totalBouchers > 0
                        ? Math.round((totalVentas / totalBouchers) * 100) / 100
                        : 0
                }
            };
        };

        const filas = await listarFilasEstadisticas(fechaInicioDate, fechaFinDate);
        if (filas.length) {
            const groups = new Map();
            for (const f of filas) {
                const d = moment(f.fechaPago || f.createdAt).tz('America/Lima');
                let key = 'Sin fecha';
                if (d.isValid()) {
                    if (agruparPor === 'hora') key = d.format('YYYY-MM-DD HH:00');
                    else if (agruparPor === 'semana') key = d.format('YYYY-[W]ww');
                    else key = d.format('YYYY-MM-DD');
                }
                if (!groups.has(key)) groups.set(key, { _id: key, total: 0, cantidadBouchers: 0 });
                const g = groups.get(key);
                g.total += Number(f.total) || 0;
                g.cantidadBouchers += 1;
            }
            const resultados = Array.from(groups.values())
                .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
                .sort((a, b) => String(a._id).localeCompare(String(b._id)));
            return formatDatos(resultados);
        }

        const pipeline = [
            {
                $match: matchBoucherVigente({
                    isActive: true,
                    fechaPago: { $gte: fechaInicioDate, $lte: fechaFinDate }
                })
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: formatoFecha,
                            date: '$fechaPago',
                            timezone: 'America/Lima'
                        }
                    },
                    total: { $sum: '$total' },
                    subtotal: { $sum: '$subtotal' },
                    igv: { $sum: '$igv' },
                    cantidadBouchers: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ];

        const resultados = await Boucher.aggregate(pipeline);
        return formatDatos(resultados);

    } catch (error) {
        logger.error('[ReportesRepo] Error en getVentas', { error: error.message });
        throw error;
    }
}

// ============================================================
// PLATOS TOP VENDIDOS
// ============================================================

/**
 * Obtiene los platos más vendidos en un rango de fechas
 * @param {string} fechaInicio - Fecha inicio (YYYY-MM-DD)
 * @param {string} fechaFin - Fecha fin (YYYY-MM-DD)
 * @returns {Promise<Object>} Platos más vendidos
 */
async function getPlatosTop(fechaInicio, fechaFin) {
    try {
        const Boucher = mongoose.model('Boucher') || require('../database/models/boucher.model');
        const { inicio: fechaInicioDate, fin: fechaFinDate } = rangoLima(fechaInicio, fechaFin);

        logger.info('[ReportesRepo] Obteniendo platos top', {
            fechaInicio: fechaInicioDate,
            fechaFin: fechaFinDate
        });

        const formatPlatos = (resultados) => {
            const datos = resultados.map((r, index) => ({
                posicion: index + 1,
                _id: r._id,
                nombre: r.nombre || 'Desconocido',
                vendidos: r.vendidos,
                ingresos: Math.round((r.ingresos || 0) * 100) / 100,
                promedioPrecio: r.veces > 0 ? Math.round((r.ingresos / r.veces) * 100) / 100 : 0
            }));
            const resumen = {
                totalPlatosVendidos: datos.reduce((sum, d) => sum + d.vendidos, 0),
                totalIngresos: datos.reduce((sum, d) => sum + d.ingresos, 0),
                platosUnicos: datos.length
            };
            return {
                datos,
                resumen: {
                    totalPlatosVendidos: resumen.totalPlatosVendidos,
                    totalIngresos: Math.round(resumen.totalIngresos * 100) / 100,
                    platosUnicos: resumen.platosUnicos
                }
            };
        };

        const resultadosComanda = await Comanda.aggregate([
            { $match: matchComandasEstadisticas(fechaInicioDate, fechaFinDate) },
            { $unwind: { path: '$platos', includeArrayIndex: 'idx' } },
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
                    as: '_catArr'
                }
            },
            {
                $addFields: {
                    _catDoc: { $arrayElemAt: ['$_catArr', 0] }
                }
            },
            {
                $addFields: {
                    _cant: {
                        $ifNull: [
                            '$platos.cantidad',
                            { $ifNull: [{ $arrayElemAt: ['$cantidades', '$idx'] }, 1] }
                        ]
                    },
                    _precio: exprPrecioPlatoUnwind(),
                    _nombre: {
                        $ifNull: [
                            '$platos.nombre',
                            { $ifNull: ['$_catDoc.nombre', { $ifNull: ['$platos.platoNombre', 'Plato'] }] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: { $ifNull: ['$platos.plato', '$_nombre'] },
                    nombre: { $first: '$_nombre' },
                    vendidos: { $sum: '$_cant' },
                    ingresos: { $sum: { $multiply: ['$_cant', '$_precio'] } },
                    veces: { $sum: 1 }
                }
            },
            { $sort: { vendidos: -1 } },
            { $limit: 20 }
        ]);

        if (resultadosComanda.length) {
            return formatPlatos(resultadosComanda);
        }

        const pipeline = [
            {
                $match: matchBoucherVigente({
                    isActive: true,
                    fechaPago: { $gte: fechaInicioDate, $lte: fechaFinDate }
                })
            },
            { $unwind: '$platos' },
            {
                $group: {
                    _id: '$platos.platoId',
                    nombre: { $first: '$platos.nombre' },
                    platoRef: { $first: '$platos.plato' },
                    vendidos: { $sum: '$platos.cantidad' },
                    ingresos: { $sum: '$platos.subtotal' },
                    veces: { $sum: 1 }
                }
            },
            { $sort: { vendidos: -1 } },
            { $limit: 20 }
        ];

        const resultados = await Boucher.aggregate(pipeline);
        return formatPlatos(resultados);

    } catch (error) {
        logger.error('[ReportesRepo] Error en getPlatosTop', { error: error.message });
        throw error;
    }
}

async function getFilasOperacion(fechaInicio, fechaFin) {
    const { inicio, fin } = rangoLima(fechaInicio, fechaFin);
    const filas = await listarFilasEstadisticas(inicio, fin);
    if (filas.length) return filas;

    const Boucher = mongoose.model('Boucher') || require('../database/models/boucher.model');
    return Boucher.find(matchBoucherVigente({
        isActive: true,
        fechaPago: { $gte: inicio, $lte: fin }
    }))
        .populate('mozo', 'name nombres DNI')
        .populate('mesa', 'nummesa numero')
        .populate('platos.plato', 'nombre precio categoria')
        .sort({ fechaPago: -1 })
        .lean();
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    getMetricasCocineros,
    getSerieTemporalCocineros,
    getHeatmapHorario,
    getDistribucionCategorias,
    getDetalleCocinero,
    getVentas,
    getPlatosTop,
    getFilasOperacion
};
