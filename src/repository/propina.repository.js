const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { calcularMontoPropina } = require('../utils/propinaCalculo');

// Importar modelo
let Propina;
try {
    Propina = mongoose.model('Propina');
} catch (e) {
    Propina = require('../database/models/propina.model');
}

// Modelos adicionales
const Boucher = mongoose.model('Boucher') || require('../database/models/boucher.model');
const Mozos = mongoose.model('mozos') || require('../database/models/mozos.model');
const Mesa = mongoose.model('mesas') || require('../database/models/mesas.model');

// ============================================================
// CREATE - CREAR PROPINA
// ============================================================

/**
 * Propina activa existente para un boucher (máximo una)
 */
async function obtenerPropinaActivaPorBoucher(boucherId) {
    if (!boucherId || !mongoose.Types.ObjectId.isValid(String(boucherId))) {
        return null;
    }
    const bid = new mongoose.Types.ObjectId(String(boucherId));
    return Propina.findOne({ boucherId: bid, activo: true }).lean();
}

/**
 * Registra una nueva propina (monto siempre calculado en servidor)
 */
async function crearPropina(data) {
    const {
        mesaId,
        numMesa,
        boucherId,
        boucherNumber,
        mozoId,
        nombreMozo,
        tipo,
        montoFijo,
        porcentaje,
        totalBoucher,
        nota,
        registradoPor,
        registradoPorNombre
    } = data;

    const existente = await obtenerPropinaActivaPorBoucher(boucherId);
    if (existente) {
        const err = new Error('Ya existe una propina activa para este boucher');
        err.code = 'PROPINA_DUPLICADA';
        err.statusCode = 409;
        err.existingId = existente._id;
        throw err;
    }

    const { monto, error } = calcularMontoPropina(tipo, totalBoucher, montoFijo, porcentaje);
    if (error) {
        throw new Error(error);
    }

    const now = moment.tz('America/Lima').toDate();
    const fechaDia = moment.tz('America/Lima').format('YYYY-MM-DD');

    const propina = new Propina({
        mesaId,
        numMesa,
        boucherId,
        boucherNumber,
        mozoId,
        nombreMozo,
        montoPropina: monto,
        tipo,
        montoFijo: tipo === 'monto' ? montoFijo : null,
        porcentaje: tipo === 'porcentaje' ? porcentaje : null,
        totalBoucher,
        nota,
        registradoPor,
        registradoPorNombre,
        fechaRegistro: now,
        fechaRegistroString: moment(now).tz('America/Lima').format('DD/MM/YYYY HH:mm:ss'),
        fechaDia,
        estadoMesa: 'pagado',
        activo: true
    });

    try {
        await propina.save();
    } catch (e) {
        if (e && e.code === 11000) {
            const err = new Error('Ya existe una propina activa para este boucher');
            err.code = 'PROPINA_DUPLICADA';
            err.statusCode = 409;
            throw err;
        }
        throw e;
    }

    logger.info('[PropinaRepo] Propina creada exitosamente', {
        propinaId: propina.propinaId,
        mozoId,
        montoPropina: monto,
        tipo
    });

    return propina;
}

// ============================================================
// READ - CONSULTAS
// ============================================================

/**
 * Lista todas las propinas con filtros opcionales
 * @param {Object} filtros - Filtros de búsqueda
 * @returns {Promise<Array>} Lista de propinas
 */
async function listarPropinas(filtros = {}) {
    try {
        const { fechaInicio, fechaFin, mozoId, mesaId, tipo } = filtros;
        
        const query = { activo: true };
        
        // Filtro por fechas
        if (fechaInicio || fechaFin) {
            query.fechaRegistro = {};
            if (fechaInicio) {
                query.fechaRegistro.$gte = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
            }
            if (fechaFin) {
                query.fechaRegistro.$lte = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();
            }
        }
        
        // Filtro por mozo
        if (mozoId) {
            query.mozoId = mongoose.Types.ObjectId(mozoId);
        }
        
        // Filtro por mesa
        if (mesaId) {
            query.mesaId = mongoose.Types.ObjectId(mesaId);
        }
        
        // Filtro por tipo
        if (tipo) {
            query.tipo = tipo;
        }

        const propinas = await Propina.find(query)
            .sort({ fechaRegistro: -1 })
            .populate('mozoId', 'name rol')
            .populate('mesaId', 'nummesa')
            .populate('boucherId', 'boucherNumber total')
            .lean();

        return propinas;
    } catch (error) {
        logger.error('[PropinaRepo] Error al listar propinas', { error: error.message });
        throw error;
    }
}

/**
 * Obtiene una propina por ID
 * @param {String} id - ID de la propina
 * @returns {Promise<Object>} Propina encontrada
 */
async function obtenerPropinaPorId(id) {
    try {
        const propina = await Propina.findById(id)
            .populate('mozoId', 'name rol')
            .populate('mesaId', 'nummesa')
            .populate('boucherId', 'boucherNumber total')
            .populate('registradoPor', 'name');

        if (!propina) {
            throw new Error('Propina no encontrada');
        }

        return propina;
    } catch (error) {
        logger.error('[PropinaRepo] Error al obtener propina por ID', { error: error.message });
        throw error;
    }
}

/**
 * Obtiene propinas de una mesa específica
 * @param {String} mesaId - ID de la mesa
 * @param {Object} opciones - Opciones adicionales (fechaInicio, fechaFin)
 * @returns {Promise<Array>} Lista de propinas de la mesa
 */
async function obtenerPropinasPorMesa(mesaId, opciones = {}) {
    try {
        const { fechaInicio, fechaFin } = opciones;
        
        const query = {
            mesaId: mongoose.Types.ObjectId(mesaId),
            activo: true
        };
        
        if (fechaInicio || fechaFin) {
            query.fechaRegistro = {};
            if (fechaInicio) {
                query.fechaRegistro.$gte = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
            }
            if (fechaFin) {
                query.fechaRegistro.$lte = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();
            }
        }

        const propinas = await Propina.find(query)
            .sort({ fechaRegistro: -1 })
            .lean();

        return propinas;
    } catch (error) {
        logger.error('[PropinaRepo] Error al obtener propinas por mesa', { error: error.message });
        throw error;
    }
}

/**
 * Obtiene propinas de un mozo específico
 * @param {String} mozoId - ID del mozo
 * @param {Object} opciones - Opciones adicionales
 * @returns {Promise<Array>} Lista de propinas del mozo
 */
async function obtenerPropinasPorMozo(mozoId, opciones = {}) {
    try {
        const { fechaInicio, fechaFin, limite = 50 } = opciones;
        
        const query = {
            mozoId: mongoose.Types.ObjectId(mozoId),
            activo: true
        };
        
        if (fechaInicio || fechaFin) {
            query.fechaRegistro = {};
            if (fechaInicio) {
                query.fechaRegistro.$gte = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
            }
            if (fechaFin) {
                query.fechaRegistro.$lte = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();
            }
        }

        const propinas = await Propina.find(query)
            .sort({ fechaRegistro: -1 })
            .limit(limite)
            .lean();

        // Calcular totales
        const totalPropinas = propinas.reduce((sum, p) => sum + p.montoPropina, 0);
        const cantidadPropinas = propinas.length;
        const promedioPropina = cantidadPropinas > 0 ? totalPropinas / cantidadPropinas : 0;

        return {
            propinas,
            resumen: {
                mozoId,
                totalPropinas: Math.round(totalPropinas * 100) / 100,
                cantidadPropinas,
                promedioPropina: Math.round(promedioPropina * 100) / 100
            }
        };
    } catch (error) {
        logger.error('[PropinaRepo] Error al obtener propinas por mozo', { error: error.message });
        throw error;
    }
}

/**
 * Obtiene resumen de propinas del día
 * @param {String} fecha - Fecha en formato YYYY-MM-DD (opcional, default: hoy)
 * @returns {Promise<Object>} Resumen de propinas
 */
async function obtenerResumenDia(fecha = null) {
    try {
        return await Propina.getResumenDia(fecha);
    } catch (error) {
        logger.error('[PropinaRepo] Error al obtener resumen del día', { error: error.message });
        throw error;
    }
}

/**
 * Obtiene datos para el dashboard de mozos
 * @param {String} fechaInicio - Fecha inicio
 * @param {String} fechaFin - Fecha fin
 * @returns {Promise<Object>} Datos del dashboard
 */
async function obtenerDatosDashboardMozos(fechaInicio, fechaFin) {
    try {
        const inicio = moment.tz(fechaInicio, 'America/Lima').startOf('day').toDate();
        const fin = moment.tz(fechaFin, 'America/Lima').endOf('day').toDate();

        // Obtener todos los mozos activos
        const mozos = await Mozos.find({ activo: { $ne: false } })
            .select('_id mozoId name DNI rol')
            .lean();

        // Pipeline de agregación para obtener métricas por mozo
        const pipelineVentas = [
            {
                $match: {
                    fechaPago: { $gte: inicio, $lte: fin },
                    isActive: true
                }
            },
            {
                $group: {
                    _id: '$mozo',
                    totalVentas: { $sum: '$total' },
                    cantidadBouchers: { $sum: 1 },
                    mesasAtendidas: { $addToSet: '$mesa' }
                }
            }
        ];

        const ventasPorMozo = await Boucher.aggregate(pipelineVentas);
        const ventasMap = new Map(ventasPorMozo.map(v => [v._id?.toString(), v]));

        // Pipeline de agregación para propinas
        const pipelinePropinas = [
            {
                $match: {
                    fechaRegistro: { $gte: inicio, $lte: fin },
                    activo: true
                }
            },
            {
                $group: {
                    _id: '$mozoId',
                    totalPropinas: { $sum: '$montoPropina' },
                    cantidadPropinas: { $sum: 1 }
                }
            }
        ];

        const propinasPorMozo = await Propina.aggregate(pipelinePropinas);
        const propinasMap = new Map(propinasPorMozo.map(p => [p._id?.toString(), p]));

        // Combinar datos
        const mozosConMetricas = mozos.map(mozo => {
            const mozoIdStr = mozo._id.toString();
            const ventas = ventasMap.get(mozoIdStr) || { totalVentas: 0, cantidadBouchers: 0, mesasAtendidas: [] };
            const propinas = propinasMap.get(mozoIdStr) || { totalPropinas: 0, cantidadPropinas: 0 };
            const mesasAt = ventas.mesasAtendidas?.length || 0;
            const bouchers = ventas.cantidadBouchers || 0;
            const totalProp = Math.round(propinas.totalPropinas * 100) / 100;

            return {
                _id: mozo._id,
                mozoId: mozo.mozoId,
                nombre: mozo.name,
                DNI: mozo.DNI,
                rol: mozo.rol,
                ventasHoy: Math.round(ventas.totalVentas * 100) / 100,
                bouchersHoy: bouchers,
                mesasAtendidas: mesasAt,
                propinasHoy: totalProp,
                cantidadPropinas: propinas.cantidadPropinas,
                promedioPropina: propinas.cantidadPropinas > 0
                    ? Math.round((propinas.totalPropinas / propinas.cantidadPropinas) * 100) / 100
                    : 0,
                promedioPropinaPorMesa: mesasAt > 0
                    ? Math.round((totalProp / mesasAt) * 100) / 100
                    : 0,
                promedioPropinaPorTicket: bouchers > 0
                    ? Math.round((totalProp / bouchers) * 100) / 100
                    : 0
            };
        });

        // Calcular totales
        const totales = {
            totalVentas: mozosConMetricas.reduce((sum, m) => sum + m.ventasHoy, 0),
            totalPropinas: mozosConMetricas.reduce((sum, m) => sum + m.propinasHoy, 0),
            totalMozos: mozos.length
        };

        const mejorMozoPropina = mozosConMetricas.reduce((best, current) =>
            current.propinasHoy > (best?.propinasHoy || 0) ? current : best, null);
        const mejorMozoVentas = mozosConMetricas.reduce((best, current) =>
            current.ventasHoy > (best?.ventasHoy || 0) ? current : best, null);

        const porVentas = [...mozosConMetricas].sort((a, b) => b.ventasHoy - a.ventasHoy);
        const porPropinas = [...mozosConMetricas].sort((a, b) => b.propinasHoy - a.propinasHoy);

        // Serie horaria de propinas (America/Lima)
        const propinasLean = await Propina.find({
            fechaRegistro: { $gte: inicio, $lte: fin },
            activo: true
        })
            .select('montoPropina fechaRegistro')
            .lean();

        const porHora = Array(24).fill(0);
        propinasLean.forEach(p => {
            const h = moment(p.fechaRegistro).tz('America/Lima').hour();
            porHora[h] += p.montoPropina || 0;
        });
        const propinasPorHora = porHora.map((total, hora) => ({
            hora,
            total: Math.round(total * 100) / 100
        }));

        // Ventas y mesas únicas por hora (Lima) + matriz mozo × hora (mesas distintas atendidas)
        // CORRECCIÓN: Solo considerar bouchers con total > 0 para coherencia comercial
        // Una mesa atendida debe representar una venta real, no un cierre en cero
        const ventasPorHoraArr = Array.from({ length: 24 }, (_, hora) => ({ hora, total: 0 }));
        const mesasPorHoraArr = Array.from({ length: 24 }, (_, hora) => ({ hora, mesas: 0 }));
        let productividadMozoHora = [];

        try {
            const facetAgg = await Boucher.aggregate([
                {
                    $match: {
                        fechaPago: { $gte: inicio, $lte: fin },
                        isActive: true,
                        // CRÍTICO: Solo bouchers con total > 0 para coherencia comercial
                        // Esto garantiza que "mesas atendidas" = "mesas con venta real"
                        total: { $gt: 0 },
                        mozo: { $exists: true, $ne: null },
                        mesa: { $exists: true, $ne: null }
                    }
                },
                {
                    $project: {
                        total: { $ifNull: ['$total', 0] },
                        mesa: 1,
                        mozo: 1,
                        hora: { $hour: { date: '$fechaPago', timezone: 'America/Lima' } }
                    }
                },
                {
                    $facet: {
                        ventasPorHoraBuckets: [
                            { $group: { _id: '$hora', ventas: { $sum: '$total' } } },
                            { $sort: { _id: 1 } }
                        ],
                        mesasPorHoraBuckets: [
                            { $group: { _id: '$hora', mesas: { $addToSet: '$mesa' } } },
                            {
                                $project: {
                                    _id: 0,
                                    hora: '$_id',
                                    n: { $size: '$mesas' }
                                }
                            },
                            { $sort: { hora: 1 } }
                        ],
                        mozoHoraBuckets: [
                            {
                                $group: {
                                    _id: { mozo: '$mozo', hora: '$hora' },
                                    mesas: { $addToSet: '$mesa' }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    mozoId: '$_id.mozo',
                                    hora: '$_id.hora',
                                    mesas: { $size: '$mesas' }
                                }
                            }
                        ]
                    }
                }
            ]);

            const facet = facetAgg[0] || {};
            (facet.ventasPorHoraBuckets || []).forEach(b => {
                const h = b._id;
                if (h >= 0 && h < 24) {
                    ventasPorHoraArr[h].total = Math.round((b.ventas || 0) * 100) / 100;
                }
            });
            (facet.mesasPorHoraBuckets || []).forEach(b => {
                const h = b.hora;
                if (h >= 0 && h < 24) mesasPorHoraArr[h].mesas = b.n || 0;
            });
            productividadMozoHora = (facet.mozoHoraBuckets || []).map(r => ({
                mozoId: r.mozoId?.toString?.() || String(r.mozoId),
                hora: r.hora,
                mesas: r.mesas || 0
            }));
        } catch (aggErr) {
            logger.warn('[PropinaRepo] Agregación horaria bouchers omitida', { error: aggErr.message });
        }

        let ocupacionSalon = { pct: 0, ocupadas: 0, capacidad: 0 };
        try {
            const capacidad = await Mesa.countDocuments({ isActive: true });
            const ocupadas = await Mesa.countDocuments({
                isActive: true,
                estado: { $in: ['esperando', 'pedido', 'preparado', 'pagado'] }
            });
            ocupacionSalon = {
                capacidad,
                ocupadas,
                pct: capacidad > 0 ? Math.round((ocupadas / capacidad) * 1000) / 10 : 0
            };
        } catch (ocErr) {
            logger.warn('[PropinaRepo] Snapshot ocupación mesas omitido', { error: ocErr.message });
        }

        // ============================================================
        // NUEVAS AGREGACIONES: Tendencia Diaria y Comparación por Turno
        // ============================================================
        
        /**
         * DEFINICIÓN DE TURNOS (configurable según horario del negocio)
         * Almuerzo: 11:00 - 16:59 (horas 11-16)
         * Cena: 17:00 - 23:59 (horas 17-23)
         * Nota: Las horas 0-10 se excluyen del análisis por turno (preparación/cierre)
         */
        const TURNOS_HORARIOS = {
            almuerzo: { inicio: 11, fin: 16, label: 'Almuerzo' },
            cena: { inicio: 17, fin: 23, label: 'Cena' }
        };

        // Ventas por día de la semana (para Tendencia Diaria)
        const ventasPorDiaSemana = [
            { dia: 'Lun', ventas: 0, tickets: 0 },
            { dia: 'Mar', ventas: 0, tickets: 0 },
            { dia: 'Mié', ventas: 0, tickets: 0 },
            { dia: 'Jue', ventas: 0, tickets: 0 },
            { dia: 'Vie', ventas: 0, tickets: 0 },
            { dia: 'Sáb', ventas: 0, tickets: 0 },
            { dia: 'Dom', ventas: 0, tickets: 0 }
        ];

        // Comparación por turno: Almuerzo vs Cena
        const comparacionPorTurno = {
            almuerzo: { ventas: 0, tickets: 0, ticketPromedio: 0, mesas: 0 },
            cena: { ventas: 0, tickets: 0, ticketPromedio: 0, mesas: 0 }
        };

        try {
            // Agregación combinada: por día de semana y por turno
            const turnosAgg = await Boucher.aggregate([
                {
                    $match: {
                        fechaPago: { $gte: inicio, $lte: fin },
                        isActive: true,
                        total: { $gt: 0 },  // Solo ventas reales
                        mozo: { $exists: true, $ne: null }
                    }
                },
                {
                    $project: {
                        total: 1,
                        mesa: 1,
                        fechaPago: 1,
                        // Día de semana: 1=Dom, 2=Lun, ..., 7=Sab
                        diaSemana: { $dayOfWeek: { date: '$fechaPago', timezone: 'America/Lima' } },
                        // Hora para clasificar turno
                        hora: { $hour: { date: '$fechaPago', timezone: 'America/Lima' } }
                    }
                },
                {
                    $facet: {
                        // Agregación por día de semana
                        porDiaSemana: [
                            {
                                $group: {
                                    _id: '$diaSemana',
                                    ventas: { $sum: '$total' },
                                    tickets: { $sum: 1 }
                                }
                            },
                            { $sort: { _id: 1 } }
                        ],
                        // Agregación por turno
                        porTurno: [
                            {
                                $group: {
                                    _id: null,
                                    // Almuerzo: horas 11-16
                                    almuerzoVentas: {
                                        $sum: {
                                            $cond: [
                                                { $and: [{ $gte: ['$hora', 11] }, { $lte: ['$hora', 16] }] },
                                                '$total',
                                                0
                                            ]
                                        }
                                    },
                                    almuerzoTickets: {
                                        $sum: {
                                            $cond: [
                                                { $and: [{ $gte: ['$hora', 11] }, { $lte: ['$hora', 16] }] },
                                                1,
                                                0
                                            ]
                                        }
                                    },
                                    almuerzoMesas: {
                                        $addToSet: {
                                            $cond: [
                                                { $and: [{ $gte: ['$hora', 11] }, { $lte: ['$hora', 16] }] },
                                                '$mesa',
                                                null
                                            ]
                                        }
                                    },
                                    // Cena: horas 17-23
                                    cenaVentas: {
                                        $sum: {
                                            $cond: [
                                                { $and: [{ $gte: ['$hora', 17] }, { $lte: ['$hora', 23] }] },
                                                '$total',
                                                0
                                            ]
                                        }
                                    },
                                    cenaTickets: {
                                        $sum: {
                                            $cond: [
                                                { $and: [{ $gte: ['$hora', 17] }, { $lte: ['$hora', 23] }] },
                                                1,
                                                0
                                            ]
                                        }
                                    },
                                    cenaMesas: {
                                        $addToSet: {
                                            $cond: [
                                                { $and: [{ $gte: ['$hora', 17] }, { $lte: ['$hora', 23] }] },
                                                '$mesa',
                                                null
                                            ]
                                        }
                                    }
                                }
                            }
                        ]
                    }
                }
            ]);

            const facetResult = turnosAgg[0] || {};

            // Procesar resultados por día de semana
            // MongoDB $dayOfWeek: 1=Domingo, 2=Lunes, ..., 7=Sábado
            // Nuestro array: 0=Lun, 1=Mar, 2=Mié, 3=Jue, 4=Vie, 5=Sáb, 6=Dom
            const diaMapping = { 1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 }; // MongoDB -> nuestro índice
            
            (facetResult.porDiaSemana || []).forEach(d => {
                const idx = diaMapping[d._id];
                if (idx !== undefined && idx >= 0 && idx < 7) {
                    ventasPorDiaSemana[idx].ventas = Math.round((d.ventas || 0) * 100) / 100;
                    ventasPorDiaSemana[idx].tickets = d.tickets || 0;
                }
            });

            // Procesar resultados por turno
            const turnoData = (facetResult.porTurno || [])[0];
            if (turnoData) {
                // Almuerzo
                const almuerzoMesasCount = (turnoData.almuerzoMesas || []).filter(m => m !== null).length;
                comparacionPorTurno.almuerzo = {
                    ventas: Math.round((turnoData.almuerzoVentas || 0) * 100) / 100,
                    tickets: turnoData.almuerzoTickets || 0,
                    ticketPromedio: turnoData.almuerzoTickets > 0 
                        ? Math.round((turnoData.almuerzoVentas / turnoData.almuerzoTickets) * 100) / 100 
                        : 0,
                    mesas: almuerzoMesasCount
                };

                // Cena
                const cenaMesasCount = (turnoData.cenaMesas || []).filter(m => m !== null).length;
                comparacionPorTurno.cena = {
                    ventas: Math.round((turnoData.cenaVentas || 0) * 100) / 100,
                    tickets: turnoData.cenaTickets || 0,
                    ticketPromedio: turnoData.cenaTickets > 0 
                        ? Math.round((turnoData.cenaVentas / turnoData.cenaTickets) * 100) / 100 
                        : 0,
                    mesas: cenaMesasCount
                };
            }
        } catch (turnoErr) {
            logger.warn('[PropinaRepo] Agregación por turno/día semana omitida', { error: turnoErr.message });
        }

        // Participación en propinas del período (pastel)
        const totalP = totales.totalPropinas || 1;
        const participacionPropinas = porPropinas
            .filter(m => m.propinasHoy > 0)
            .slice(0, 12)
            .map(m => ({
                mozoId: m._id?.toString(),
                nombre: m.nombre,
                propinasHoy: m.propinasHoy,
                porcentaje: Math.round((m.propinasHoy / totalP) * 1000) / 10
            }));

        return {
            fechaInicio,
            fechaFin,
            totales,
            mejorMozo: mejorMozoPropina,
            mejorMozoVentas,
            rankings: {
                topVentas: porVentas.slice(0, 3),
                topPropinas: porPropinas.slice(0, 3)
            },
            series: {
                propinasPorHora,
                ventasPorHora: ventasPorHoraArr,
                mesasPorHora: mesasPorHoraArr,
                productividadMozoHora,
                participacionPropinas,
                // NUEVAS SERIES para gráficos de rendimiento
                ventasPorDiaSemana,      // Tendencia Diaria de Ventas
                comparacionPorTurno      // Comparación Almuerzo vs Cena
            },
            ocupacionSalon,
            mozos: porPropinas
        };
    } catch (error) {
        logger.error('[PropinaRepo] Error al obtener datos del dashboard', { error: error.message });
        throw error;
    }
}

// ============================================================
// UPDATE - ACTUALIZAR
// ============================================================

/**
 * Actualiza una propina existente
 * @param {String} id - ID de la propina
 * @param {Object} newData - Nuevos datos
 * @returns {Promise<Object>} Propina actualizada
 */
async function actualizarPropina(id, newData) {
    const propina = await Propina.findById(id);

    if (!propina || !propina.activo) {
        throw new Error('Propina no encontrada');
    }

    const affectsCalculo = ['tipo', 'montoFijo', 'porcentaje'].some(
        k => newData[k] !== undefined
    );

    if (newData.nota !== undefined) {
        propina.nota = newData.nota;
    }

    if (!affectsCalculo) {
        await propina.save();
        logger.info('[PropinaRepo] Propina actualizada (solo nota u otros)', { propinaId: id });
        return propina;
    }

    if (newData.tipo !== undefined) {
        propina.tipo = newData.tipo;
    }
    if (newData.montoFijo !== undefined) {
        propina.montoFijo = newData.montoFijo;
    }
    if (newData.porcentaje !== undefined) {
        propina.porcentaje = newData.porcentaje;
    }

    if (propina.tipo === 'ninguna') {
        propina.montoFijo = null;
        propina.porcentaje = null;
    } else if (propina.tipo === 'monto') {
        propina.porcentaje = null;
    } else if (propina.tipo === 'porcentaje') {
        propina.montoFijo = null;
    }

    const { monto, error } = calcularMontoPropina(
        propina.tipo,
        propina.totalBoucher,
        propina.montoFijo,
        propina.porcentaje
    );
    if (error) {
        throw new Error(error);
    }
    propina.montoPropina = monto;

    await propina.save();
    logger.info('[PropinaRepo] Propina actualizada', { propinaId: id });
    return propina;
}

// ============================================================
// DELETE - ELIMINAR
// ============================================================

/**
 * Elimina una propina (soft delete)
 * @param {String} id - ID de la propina
 * @returns {Promise<Object>} Propina eliminada
 */
async function eliminarPropina(id) {
    try {
        const propina = await Propina.findByIdAndUpdate(
            id,
            { activo: false },
            { new: true }
        );

        if (!propina) {
            throw new Error('Propina no encontrada');
        }

        logger.info('[PropinaRepo] Propina eliminada (soft delete)', { propinaId: id });
        return propina;
    } catch (error) {
        logger.error('[PropinaRepo] Error al eliminar propina', { error: error.message });
        throw error;
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    crearPropina,
    obtenerPropinaActivaPorBoucher,
    listarPropinas,
    obtenerPropinaPorId,
    obtenerPropinasPorMesa,
    obtenerPropinasPorMozo,
    obtenerResumenDia,
    obtenerDatosDashboardMozos,
    actualizarPropina,
    eliminarPropina
};
