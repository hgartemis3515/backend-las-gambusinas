const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const boucherModel = require('../database/models/boucher.model');
const comandaModel = require('../database/models/comanda.model');
const platoModel = require('../database/models/plato.model');
const mozosModel = require('../database/models/mozos.model');
const redisCache = require('../utils/redisCache');
const logger = require('../utils/logger');

/**
 * GET /api/reportes/ventas
 * Reporte de ventas con agregación por fecha/hora/mesa
 * Query params: fechaInicio, fechaFin, agruparPor (dia|hora|mesa)
 */
router.get('/ventas', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, agruparPor = 'dia' } = req.query;

        // Log de debug
        logger.info('📊 Request reportes/ventas', { fechaInicio, fechaFin, agruparPor });

        // Validar fechas
        if (!fechaInicio || !fechaFin) {
            logger.warn('❌ Fechas faltantes en request', { fechaInicio, fechaFin });
            return res.status(400).json({ 
                success: false,
                message: 'fechaInicio y fechaFin son requeridos (formato: YYYY-MM-DD)' 
            });
        }

        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        logger.info('🔍 Fechas procesadas', { 
            fechaInicioDate: fechaInicioDate.toISOString(), 
            fechaFinDate: fechaFinDate.toISOString() 
        });

        // Cache key
        const cacheKey = `reporte:ventas:${fechaInicio}:${fechaFin}:${agruparPor}`;
        
        // Intentar obtener de cache
        const cached = await redisCache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        let groupByField;
        let dateFormat;

        switch (agruparPor) {
            case 'hora':
                groupByField = { $hour: '$fechaPago' };
                dateFormat = '%H:00';
                break;
            case 'mesa':
                groupByField = '$numMesa';
                dateFormat = null;
                break;
            case 'dia':
            default:
                groupByField = { 
                    $dateToString: { 
                        format: '%Y-%m-%d', 
                        date: '$fechaPago',
                        timezone: 'America/Lima'
                    } 
                };
                dateFormat = '%Y-%m-%d';
                break;
        }

        const pipeline = [
            {
                $match: {
                    isActive: true,
                    fechaPago: {
                        $gte: fechaInicioDate,
                        $lte: fechaFinDate
                    }
                }
            },
            {
                $group: {
                    _id: groupByField,
                    total: { $sum: '$total' },
                    subtotal: { $sum: '$subtotal' },
                    igv: { $sum: '$igv' },
                    cantidadBouchers: { $sum: 1 },
                    cantidadItems: { $sum: { $size: '$platos' } }
                }
            },
            {
                $project: {
                    _id: 0,
                    fecha: '$_id',
                    total: 1,
                    subtotal: 1,
                    igv: 1,
                    cantidadBouchers: 1,
                    cantidadItems: 1,
                    promedioPorItem: { 
                        $divide: ['$subtotal', { $max: ['$cantidadItems', 1] }] 
                    }
                }
            },
            {
                $sort: { fecha: 1 }
            }
        ];

        logger.info('🔍 Ejecutando aggregation pipeline', { pipeline: JSON.stringify(pipeline, null, 2) });
        
        const resultados = await boucherModel.aggregate(pipeline);

        logger.info('✅ Resultado aggregation', { 
            cantidad: resultados.length, 
            primeros: resultados.slice(0, 3) 
        });

        // Calcular totales generales
        const totales = resultados.reduce((acc, item) => ({
            total: acc.total + (item.total || 0),
            subtotal: acc.subtotal + (item.subtotal || 0),
            igv: acc.igv + (item.igv || 0),
            cantidadBouchers: acc.cantidadBouchers + (item.cantidadBouchers || 0),
            cantidadItems: acc.cantidadItems + (item.cantidadItems || 0)
        }), { total: 0, subtotal: 0, igv: 0, cantidadBouchers: 0, cantidadItems: 0 });

        const respuesta = {
            success: true,
            fechaInicio,
            fechaFin,
            agruparPor,
            datos: resultados,
            totales,
            promedioPorBoucher: totales.cantidadBouchers > 0 
                ? totales.total / totales.cantidadBouchers 
                : 0
        };

        // Guardar en cache por 5 minutos
        await redisCache.set(cacheKey, respuesta, 300).catch(err => {
            logger.warn('⚠️ Error guardando en cache', { error: err.message });
        });

        logger.info('📤 Enviando respuesta', { 
            datosCount: resultados.length, 
            total: totales.total 
        });

        res.json(respuesta);
    } catch (error) {
        logger.error('❌ Error en reporte de ventas', { 
            error: error.message, 
            stack: error.stack,
            query: req.query 
        });
        res.status(500).json({ 
            success: false,
            message: 'Error al generar reporte de ventas', 
            error: error.message 
        });
    }
});

/**
 * GET /api/reportes/platos-top
 * Top platos más vendidos con cálculo de margen
 * Query params: fechaInicio, fechaFin, limit (default: 10)
 */
router.get('/platos-top', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, limit = 10 } = req.query;

        logger.info('📊 Request reportes/platos-top', { fechaInicio, fechaFin, limit });

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ 
                success: false,
                message: 'fechaInicio y fechaFin son requeridos (formato: YYYY-MM-DD)' 
            });
        }

        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        const cacheKey = `reporte:platos-top:${fechaInicio}:${fechaFin}:${limit}`;
        const cached = await redisCache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Agregación para obtener platos vendidos desde bouchers
        const pipeline = [
            {
                $match: {
                    isActive: true,
                    fechaPago: {
                        $gte: fechaInicioDate,
                        $lte: fechaFinDate
                    }
                }
            },
            {
                $unwind: '$platos'
            },
            {
                $group: {
                    _id: {
                        platoId: '$platos.platoId',
                        nombre: '$platos.nombre'
                    },
                    vendidos: { $sum: '$platos.cantidad' },
                    ingreso: { $sum: '$platos.subtotal' },
                    precioPromedio: { $avg: '$platos.precio' }
                }
            },
            {
                $lookup: {
                    from: 'platos',
                    localField: '_id.platoId',
                    foreignField: 'id',
                    as: 'platoInfo'
                }
            },
            {
                $unwind: {
                    path: '$platoInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 0,
                    platoId: '$_id.platoId',
                    nombre: '$_id.nombre',
                    vendidos: 1,
                    ingreso: 1,
                    precioPromedio: { $round: ['$precioPromedio', 2] },
                    costoUnitario: { 
                        $ifNull: ['$platoInfo.costo', 0] 
                    },
                    costoTotal: {
                        $multiply: [
                            '$vendidos',
                            { $ifNull: ['$platoInfo.costo', 0] }
                        ]
                    }
                }
            },
            {
                $project: {
                    platoId: 1,
                    nombre: 1,
                    vendidos: 1,
                    ingreso: { $round: ['$ingreso', 2] },
                    costoTotal: { $round: ['$costoTotal', 2] },
                    precioPromedio: 1,
                    costoUnitario: 1,
                    margen: {
                        $round: [
                            {
                                $cond: [
                                    { $gt: ['$ingreso', 0] },
                                    {
                                        $multiply: [
                                            {
                                                $divide: [
                                                    { $subtract: ['$ingreso', '$costoTotal'] },
                                                    '$ingreso'
                                                ]
                                            },
                                            100
                                        ]
                                    },
                                    0
                                ]
                            },
                            2
                        ]
                    },
                    ganancia: {
                        $round: [
                            { $subtract: ['$ingreso', '$costoTotal'] },
                            2
                        ]
                    }
                }
            },
            {
                $sort: { ingreso: -1 }
            },
            {
                $limit: parseInt(limit)
            }
        ];

        const resultados = await boucherModel.aggregate(pipeline);

        // Calcular totales y porcentajes
        const totalIngreso = resultados.reduce((sum, item) => sum + item.ingreso, 0);
        const resultadosConPorcentaje = resultados.map((item, index) => ({
            ...item,
            posicion: index + 1,
            porcentajeMenu: totalIngreso > 0 
                ? parseFloat(((item.ingreso / totalIngreso) * 100).toFixed(2))
                : 0
        }));

        // Obtener todos los platos para calcular porcentaje del menú completo
        const totalPlatos = await platoModel.countDocuments();
        
        const respuesta = {
            success: true,
            fechaInicio,
            fechaFin,
            totalPlatos,
            datos: resultadosConPorcentaje,
            totalIngreso,
            totalVendidos: resultados.reduce((sum, item) => sum + item.vendidos, 0)
        };

        await redisCache.set(cacheKey, respuesta, 300).catch(err => {
            logger.warn('⚠️ Error guardando en cache', { error: err.message });
        });

        logger.info('📤 Enviando respuesta platos-top', { cantidad: resultadosConPorcentaje.length });
        res.json(respuesta);
    } catch (error) {
        logger.error('❌ Error en reporte de platos top', { error: error.message, stack: error.stack });
        res.status(500).json({ 
            success: false,
            message: 'Error al generar reporte de platos top', 
            error: error.message 
        });
    }
});

/**
 * GET /api/reportes/mozos-performance
 * Performance de mozos: comandas, tiempo promedio, facturación
 * Query params: fechaInicio, fechaFin
 */
router.get('/mozos-performance', async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;

        logger.info('📊 Request reportes/mozos-performance', { fechaInicio, fechaFin });

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ 
                success: false,
                message: 'fechaInicio y fechaFin son requeridos (formato: YYYY-MM-DD)' 
            });
        }

        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        const cacheKey = `reporte:mozos-performance:${fechaInicio}:${fechaFin}`;
        const cached = await redisCache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Agregación desde bouchers (ventas procesadas)
        const pipelineVentas = [
            {
                $match: {
                    isActive: true,
                    fechaPago: {
                        $gte: fechaInicioDate,
                        $lte: fechaFinDate
                    }
                }
            },
            {
                $group: {
                    _id: '$mozo',
                    nombreMozo: { $first: '$nombreMozo' },
                    totalVentas: { $sum: '$total' },
                    cantidadBouchers: { $sum: 1 },
                    cantidadPlatos: { $sum: { $size: '$platos' } }
                }
            }
        ];

        const ventasPorMozo = await boucherModel.aggregate(pipelineVentas);

        // Agregación desde comandas (comandas creadas)
        const pipelineComandas = [
            {
                $match: {
                    IsActive: true,
                    createdAt: {
                        $gte: fechaInicioDate,
                        $lte: fechaFinDate
                    }
                }
            },
            {
                $group: {
                    _id: '$mozos',
                    cantidadComandas: { $sum: 1 },
                    tiempoPromedio: {
                        $avg: {
                            $cond: [
                                { $ne: ['$updatedAt', null] },
                                {
                                    $divide: [
                                        { $subtract: ['$updatedAt', '$createdAt'] },
                                        60000 // minutos
                                    ]
                                },
                                null
                            ]
                        }
                    }
                }
            }
        ];

        const comandasPorMozo = await comandaModel.aggregate(pipelineComandas);

        // Combinar datos y obtener información completa de mozos
        const mozosIds = [...new Set([
            ...ventasPorMozo.map(v => v._id.toString()),
            ...comandasPorMozo.map(c => c._id.toString())
        ])];

        const mozos = await mozosModel.find({ _id: { $in: mozosIds } });

        const resultados = mozos.map(mozo => {
            const ventas = ventasPorMozo.find(v => v._id.toString() === mozo._id.toString());
            const comandas = comandasPorMozo.find(c => c._id.toString() === mozo._id.toString());

            const totalVentas = ventas?.totalVentas || 0;
            const cantidadBouchers = ventas?.cantidadBouchers || 0;
            const cantidadComandas = comandas?.cantidadComandas || 0;
            const tiempoPromedio = comandas?.tiempoPromedio || 0;

            return {
                mozoId: mozo.mozoId,
                nombre: mozo.name,
                totalVentas: parseFloat(totalVentas.toFixed(2)),
                cantidadBouchers,
                cantidadComandas,
                tiempoPromedioMinutos: tiempoPromedio ? parseFloat(tiempoPromedio.toFixed(2)) : 0,
                promedioPorBoucher: cantidadBouchers > 0 
                    ? parseFloat((totalVentas / cantidadBouchers).toFixed(2))
                    : 0
            };
        });

        // Calcular promedios para ranking
        const promedioVentas = resultados.length > 0
            ? resultados.reduce((sum, m) => sum + m.totalVentas, 0) / resultados.length
            : 0;

        const promedioTiempo = resultados.length > 0
            ? resultados.reduce((sum, m) => sum + m.tiempoPromedioMinutos, 0) / resultados.length
            : 0;

        // Ordenar por totalVentas DESC y agregar ranking
        resultados.sort((a, b) => b.totalVentas - a.totalVentas);

        const resultadosConRanking = resultados.map((mozo, index) => {
            const badge = index === 0 ? 'oro' : index === 1 ? 'plata' : index === 2 ? 'bronce' : null;
            const performance = mozo.totalVentas >= promedioVentas ? 'alto' : 'bajo';
            
            return {
                ...mozo,
                posicion: index + 1,
                badge,
                performance,
                diferenciaPromedio: parseFloat((mozo.totalVentas - promedioVentas).toFixed(2)),
                diferenciaPromedioPorcentaje: promedioVentas > 0
                    ? parseFloat(((mozo.totalVentas - promedioVentas) / promedioVentas * 100).toFixed(2))
                    : 0
            };
        });

        const respuesta = {
            success: true,
            fechaInicio,
            fechaFin,
            datos: resultadosConRanking,
            promedios: {
                ventas: parseFloat(promedioVentas.toFixed(2)),
                tiempoMinutos: parseFloat(promedioTiempo.toFixed(2))
            },
            totalMozos: resultados.length
        };

        await redisCache.set(cacheKey, respuesta, 300).catch(err => {
            logger.warn('⚠️ Error guardando en cache', { error: err.message });
        });

        logger.info('📤 Enviando respuesta mozos-performance', { cantidad: resultadosConRanking.length });
        res.json(respuesta);
    } catch (error) {
        logger.error('❌ Error en reporte de mozos performance', { error: error.message, stack: error.stack });
        res.status(500).json({ 
            success: false,
            message: 'Error al generar reporte de mozos', 
            error: error.message 
        });
    }
});

/**
 * GET /api/reportes/mesas-ocupacion
 * Ocupación de mesas por hora/día
 * Query params: fechaInicio, fechaFin, agruparPor (hora|dia)
 */
router.get('/mesas-ocupacion', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, agruparPor = 'hora' } = req.query;

        logger.info('📊 Request reportes/mesas-ocupacion', { fechaInicio, fechaFin, agruparPor });

        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ 
                success: false,
                message: 'fechaInicio y fechaFin son requeridos (formato: YYYY-MM-DD)' 
            });
        }

        const fechaInicioDate = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fechaFinDate = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        const cacheKey = `reporte:mesas-ocupacion:${fechaInicio}:${fechaFin}:${agruparPor}`;
        const cached = await redisCache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const groupByField = agruparPor === 'hora' 
            ? { $hour: '$fechaPago' }
            : { 
                $dateToString: { 
                    format: '%Y-%m-%d', 
                    date: '$fechaPago',
                    timezone: 'America/Lima'
                } 
            };

        const pipeline = [
            {
                $match: {
                    isActive: true,
                    fechaPago: {
                        $gte: fechaInicioDate,
                        $lte: fechaFinDate
                    }
                }
            },
            {
                $group: {
                    _id: {
                        periodo: groupByField,
                        numMesa: '$numMesa'
                    },
                    cantidad: { $sum: 1 },
                    totalFacturado: { $sum: '$total' }
                }
            },
            {
                $group: {
                    _id: '$_id.periodo',
                    mesasUnicas: { $addToSet: '$_id.numMesa' },
                    cantidadBouchers: { $sum: '$cantidad' },
                    totalFacturado: { $sum: '$totalFacturado' }
                }
            },
            {
                $project: {
                    _id: 0,
                    periodo: '$_id',
                    mesasOcupadas: { $size: '$mesasUnicas' },
                    cantidadBouchers: 1,
                    totalFacturado: 1
                }
            },
            {
                $sort: { periodo: 1 }
            }
        ];

        const resultados = await boucherModel.aggregate(pipeline);

        const respuesta = {
            success: true,
            fechaInicio,
            fechaFin,
            agruparPor,
            datos: resultados
        };

        await redisCache.set(cacheKey, respuesta, 300).catch(err => {
            logger.warn('⚠️ Error guardando en cache', { error: err.message });
        });

        logger.info('📤 Enviando respuesta mesas-ocupacion', { cantidad: resultados.length });
        res.json(respuesta);
    } catch (error) {
        logger.error('❌ Error en reporte de mesas ocupación', { error: error.message, stack: error.stack });
        res.status(500).json({ 
            success: false,
            message: 'Error al generar reporte de mesas', 
            error: error.message 
        });
    }
});

/**
 * GET /api/reportes/kpis
 * KPIs generales del día/semana/mes
 * Query params: fecha (default: hoy)
 */
router.get('/kpis', async (req, res) => {
    try {
        const { fecha } = req.query;
        const fechaConsulta = fecha 
            ? moment.tz(fecha, 'America/Lima')
            : moment.tz('America/Lima');

        const fechaInicio = fechaConsulta.clone().startOf('day').toDate();
        const fechaFin = fechaConsulta.clone().endOf('day').toDate();

        const cacheKey = `reporte:kpis:${fechaConsulta.format('YYYY-MM-DD')}`;
        const cached = await redisCache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Ventas del día
        const ventasHoy = await boucherModel.aggregate([
            {
                $match: {
                    isActive: true,
                    fechaPago: { $gte: fechaInicio, $lte: fechaFin }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$total' },
                    cantidad: { $sum: 1 }
                }
            }
        ]);

        const totalVentas = ventasHoy[0]?.total || 0;
        const cantidadBouchers = ventasHoy[0]?.cantidad || 0;

        // Top plato del día
        const topPlato = await boucherModel.aggregate([
            {
                $match: {
                    isActive: true,
                    fechaPago: { $gte: fechaInicio, $lte: fechaFin }
                }
            },
            { $unwind: '$platos' },
            {
                $group: {
                    _id: '$platos.nombre',
                    cantidad: { $sum: '$platos.cantidad' }
                }
            },
            { $sort: { cantidad: -1 } },
            { $limit: 1 }
        ]);

        logger.info('📊 KPIs calculados', { 
            ventasHoy: totalVentas, 
            topPlato: topPlato[0]?._id || 'N/A',
            horaPico: horaPico[0]?._id || null
        });

        // Hora pico
        const horaPico = await boucherModel.aggregate([
            {
                $match: {
                    isActive: true,
                    fechaPago: { $gte: fechaInicio, $lte: fechaFin }
                }
            },
            {
                $group: {
                    _id: { $hour: '$fechaPago' },
                    cantidad: { $sum: 1 }
                }
            },
            { $sort: { cantidad: -1 } },
            { $limit: 1 }
        ]);

        // Margen global (necesitaríamos costo de platos)
        const margenGlobal = 0; // Placeholder - se calcularía con costo de platos

        const respuesta = {
            success: true,
            fecha: fechaConsulta.format('YYYY-MM-DD'),
            ventasHoy: parseFloat(totalVentas.toFixed(2)),
            cantidadBouchers,
            topPlato: topPlato[0]?._id || 'N/A', // _id contiene el nombre del plato
            horaPico: horaPico[0]?._id !== undefined ? horaPico[0]._id : null,
            margenGlobal: margenGlobal
        };

        await redisCache.set(cacheKey, respuesta, 60).catch(err => {
            logger.warn('⚠️ Error guardando en cache', { error: err.message });
        });

        logger.info('📤 Enviando respuesta KPIs', { ventasHoy: respuesta.ventasHoy });
        res.json(respuesta);
    } catch (error) {
        logger.error('❌ Error en KPIs', { error: error.message, stack: error.stack });
        res.status(500).json({ 
            success: false,
            message: 'Error al generar KPIs', 
            error: error.message 
        });
    }
});

module.exports = router;

