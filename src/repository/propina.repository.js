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
                participacionPropinas
            },
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
