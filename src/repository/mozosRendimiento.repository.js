const mongoose = require('mongoose');
const moment = require('moment-timezone');
const Comanda = require('../database/models/comanda.model');
const logger = require('../utils/logger');

const SLA_SALON_MINUTOS = 5;
const ESTADOS_PLATO = ['pendiente', 'pedido', 'en_espera', 'recoger', 'salio', 'entregado', 'pagado'];

function toObjectId(id) {
    try { return new mongoose.Types.ObjectId(String(id)); }
    catch { return null; }
}

function segundosAMinutos(seg) {
    return Math.max(0, Math.round((seg || 0) / 60));
}

function formatDuracion(seg) {
    const s = Math.max(0, Math.floor(seg || 0));
    const m = Math.floor(s / 60);
    const rest = s % 60;
    if (m <= 0) return rest + 's';
    return m + 'm ' + String(rest).padStart(2, '0') + 's';
}

// Calcula tiempo cocina (en_espera/pedido → último recoger), tiempo mozo (primer salio → último entregado)
// y diferencia (mozo − cocina) a nivel comanda a partir del array de platos.
function calcularMetricasComanda(platos) {
    const ahora = new Date();
    const tiemposValidos = (platos || []).filter(p => !p.eliminado && !p.anulado);

    if (!tiemposValidos.length) {
        return {
            tiempoCocinaSegundos: null,
            tiempoMozoSegundos: null,
            diferenciaSegundos: null,
            tiempoExperienciaSegundos: null,
            resumenEstados: {},
            platosEntregados: 0,
            platosTotal: 0
        };
    }

    // Tiempo cocina: desde primer en_espera/pedido hasta último recoger
    let inicioCocina = null, finCocina = null;
    let inicioMozo = null, finMozo = null;
    let inicioGlobal = null, finGlobal = null;
    let platosEntregados = 0;

    for (const p of tiemposValidos) {
        const t = p.tiempos || {};
        const inicio = t.en_espera || t.pedido;
        if (inicio) {
            if (!inicioCocina || new Date(inicio) < new Date(inicioCocina)) inicioCocina = inicio;
            if (!inicioGlobal || new Date(inicio) < new Date(inicioGlobal)) inicioGlobal = inicio;
        }
        if (t.recoger) {
            if (!finCocina || new Date(t.recoger) > new Date(finCocina)) finCocina = t.recoger;
        }
        if (t.salio) {
            if (!inicioMozo || new Date(t.salio) < new Date(inicioMozo)) inicioMozo = t.salio;
        }
        if (t.entregado) {
            if (!finMozo || new Date(t.entregado) > new Date(finMozo)) finMozo = t.entregado;
            if (!finGlobal || new Date(t.entregado) > new Date(finGlobal)) finGlobal = t.entregado;
            platosEntregados++;
        } else if (t.salio) {
            // Plato aún en salón: usar ahora como fin provisional para tiempo mozo en curso
            if (!finMozo || ahora > new Date(finMozo)) finMozo = ahora;
        }
        if (t.pagado) {
            if (!finGlobal || new Date(t.pagado) > new Date(finGlobal)) finGlobal = t.pagado;
        }
    }

    const diff = (a, b) => a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)) : null;
    const tiempoCocina = diff(inicioCocina, finCocina);
    const tiempoMozo = diff(inicioMozo, finMozo);
    const diferencia = (tiempoCocina != null && tiempoMozo != null) ? (tiempoMozo - tiempoCocina) : null;
    const tiempoExperiencia = diff(inicioGlobal, finGlobal);

    const resumenEstados = {};
    for (const e of ESTADOS_PLATO) resumenEstados[e] = 0;
    for (const p of tiemposValidos) {
        const e = p.estado || 'pedido';
        if (resumenEstados[e] != null) resumenEstados[e]++;
        else resumenEstados[e] = 1;
    }

    return {
        tiempoCocinaSegundos: tiempoCocina,
        tiempoMozoSegundos: tiempoMozo,
        diferenciaSegundos: diferencia,
        tiempoExperienciaSegundos: tiempoExperiencia,
        resumenEstados,
        platosEntregados,
        platosTotal: tiemposValidos.length
    };
}

/**
 * Historial de comandas atendidas por mozo en un rango de fechas.
 * Una fila por comanda, con todos los platos embebidos y métricas cocina/mozo/Δ.
 */
async function obtenerHistorialComandasMozos({ mozoId = null, fechaInicio, fechaFin, limite = 500 } = {}) {
    try {
        const matchBase = {
            IsActive: true,
            mozos: { $ne: null }
        };
        if (mozoId) {
            const oid = toObjectId(mozoId);
            if (oid) matchBase.mozos = oid;
        }

        // Comandas que tienen al menos un plato entregado en el período
        // o en curso (recoger/salio/entregado) si es del día.
        const matchEntregadas = {
            ...matchBase,
            'platos.tiempos.entregado': {
                $gte: new Date(fechaInicio),
                $lte: new Date(fechaFin)
            }
        };
        const matchEnCurso = {
            ...matchBase,
            createdAt: {
                $gte: new Date(moment(fechaInicio).startOf('day').toDate()),
                $lte: new Date(moment(fechaFin).endOf('day').toDate())
            },
            'platos.estado': { $in: ['recoger', 'salio', 'entregado'] },
            'platos.eliminado': { $ne: true },
            'platos.anulado': { $ne: true }
        };

        const pipeline = (match) => [
            { $match: match },
            { $lookup: { from: 'mozos', localField: 'mozos', foreignField: '_id', as: 'mozoInfo' } },
            { $lookup: { from: 'mesas', localField: 'mesas', foreignField: '_id', as: 'mesaInfo' } },
            { $lookup: {
                from: 'platos',
                let: { platoRefs: '$platos.plato' },
                pipeline: [{ $match: { $expr: { $in: ['$_id', '$$platoRefs'] } } }, { $project: { nombre: 1, categoria: 1 } }],
                as: 'platosInfo'
            } },
            { $project: {
                comandaId: '$_id',
                comandaNumber: '$comandaNumber',
                mozoId: '$mozos',
                mozoNombre: { $ifNull: [{ $arrayElemAt: ['$mozoInfo.name', 0] }, '$mozoNombre'] },
                mesaNum: { $ifNull: [{ $arrayElemAt: ['$mesaInfo.nummesa', 0] }, '$mesaNumero'] },
                statusComanda: '$status',
                createdAt: 1,
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
                            tipoServicio: '$$p.tipoServicio',
                            eliminado: '$$p.eliminado',
                            anulado: '$$p.anulado',
                            tiempos: '$$p.tiempos',
                            procesadoPor: '$$p.procesadoPor',
                            procesandoPor: '$$p.procesandoPor',
                            entregadoPor: '$$p.entregadoPor',
                            platoNombre: {
                                $ifNull: [
                                    { $arrayElemAt: [
                                        { $map: {
                                            input: { $filter: { input: '$platosInfo', as: 'pi', cond: { $eq: ['$$pi._id', '$$p.plato'] } } },
                                            as: 'pi', in: '$$pi.nombre'
                                        } },
                                        0
                                    ] },
                                    '$$p.nombre'
                                ]
                            },
                            platoCategoria: {
                                $arrayElemAt: [
                                    { $map: {
                                        input: { $filter: { input: '$platosInfo', as: 'pi', cond: { $eq: ['$$pi._id', '$$p.plato'] } } },
                                        as: 'pi', in: '$$pi.categoria'
                                    } },
                                    0
                                ]
                            }
                        }
                    }
                }
            } },
            { $limit: limite }
        ];

        const [entregadas, enCurso] = await Promise.all([
            Comanda.aggregate(pipeline(matchEntregadas)),
            Comanda.aggregate(pipeline(matchEnCurso))
        ]);

        // Deduplicar por comandaId (puede estar en ambos conjuntos)
        const mapa = new Map();
        for (const c of [...entregadas, ...enCurso]) {
            const key = String(c._id);
            if (!mapa.has(key)) mapa.set(key, c);
        }

        const ahora = new Date();
        const comandas = Array.from(mapa.values()).map(c => {
            const metricas = calcularMetricasComanda(c.platos);
            const platosActivos = (c.platos || []).filter(p => !p.eliminado && !p.anulado);
            const estadoRegistro = metricas.platosEntregados >= metricas.platosTotal && metricas.platosTotal > 0
                ? 'completada'
                : 'en_curso';
            return {
                comandaId: c._id,
                comandaNumber: c.comandaNumber,
                mozoId: c.mozoId,
                mozoNombre: c.mozoNombre,
                mesaNum: c.mesaNum,
                statusComanda: c.statusComanda,
                createdAt: c.createdAt,
                platos: platosActivos,
                resumenEstados: metricas.resumenEstados,
                platosEntregados: metricas.platosEntregados,
                platosTotal: metricas.platosTotal,
                tiempoCocinaSegundos: metricas.tiempoCocinaSegundos,
                tiempoMozoSegundos: metricas.tiempoMozoSegundos,
                diferenciaSegundos: metricas.diferenciaSegundos,
                tiempoExperienciaSegundos: metricas.tiempoExperienciaSegundos,
                estadoRegistro,
                _snapshotAt: ahora
            };
        });

        // Ordenar por createdAt desc
        comandas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Resumen agregado
        const porMozo = {};
        let totalComandas = 0, totalPlatosEntregados = 0;
        let sumaTiemposMozo = 0, cuentaMozo = 0;
        let sumaDiferencia = 0, cuentaDiff = 0;
        let dentroSLA = 0;

        for (const c of comandas) {
            totalComandas++;
            totalPlatosEntregados += c.platosEntregados;
            if (c.tiempoMozoSegundos != null) { sumaTiemposMozo += c.tiempoMozoSegundos; cuentaMozo++; if (c.tiempoMozoSegundos <= SLA_SALON_MINUTOS * 60) dentroSLA++; }
            if (c.diferenciaSegundos != null) { sumaDiferencia += c.diferenciaSegundos; cuentaDiff++; }
            const key = String(c.mozoId || 'desconocido');
            if (!porMozo[key]) porMozo[key] = { mozoId: key, mozoNombre: c.mozoNombre, totalComandas: 0, totalPlatos: 0, totalEntregados: 0, tiempoTotalMozo: 0, cuentaMozo: 0 };
            porMozo[key].totalComandas++;
            porMozo[key].totalPlatos += c.platosTotal;
            porMozo[key].totalEntregados += c.platosEntregados;
            if (c.tiempoMozoSegundos != null) { porMozo[key].tiempoTotalMozo += c.tiempoMozoSegundos; porMozo[key].cuentaMozo++; }
        }

        const resumenPorMozo = Object.values(porMozo).map(m => ({
            ...m,
            tiempoPromedioMozoSegundos: m.cuentaMozo > 0 ? Math.round(m.tiempoTotalMozo / m.cuentaMozo) : 0
        })).sort((a, b) => b.totalEntregados - a.totalEntregados);

        return {
            comandas,
            pendientesCount: enCurso.length,
            resumen: {
                totalComandas,
                totalPlatosEntregados,
                tiempoPromedioMozoSegundos: cuentaMozo > 0 ? Math.round(sumaTiemposMozo / cuentaMozo) : 0,
                tiempoPromedioDiferenciaSegundos: cuentaDiff > 0 ? Math.round(sumaDiferencia / cuentaDiff) : 0,
                porcentajeDentroSLA: cuentaMozo > 0 ? Math.round((dentroSLA / cuentaMozo) * 100) : 0,
                porMozo: resumenPorMozo
            }
        };
    } catch (error) {
        logger.error('Error al obtener historial de comandas de mozos', { error: error.message });
        throw error;
    }
}

/**
 * Snapshot en vivo: comandas activas con platos en salón (recoger/salio/entregado).
 */
async function obtenerRendimientoEnVivo({ mozoId = null } = {}) {
    try {
        const match = {
            IsActive: true,
            'platos.estado': { $in: ['recoger', 'salio', 'entregado'] },
            'platos.eliminado': { $ne: true },
            'platos.anulado': { $ne: true }
        };
        if (mozoId) {
            const oid = toObjectId(mozoId);
            if (oid) match.mozos = oid;
        }

        const comandas = await Comanda.aggregate([
            { $match: match },
            { $lookup: { from: 'mozos', localField: 'mozos', foreignField: '_id', as: 'mozoInfo' } },
            { $lookup: { from: 'mesas', localField: 'mesas', foreignField: '_id', as: 'mesaInfo' } },
            { $lookup: {
                from: 'platos',
                let: { platoRefs: '$platos.plato' },
                pipeline: [{ $match: { $expr: { $in: ['$_id', '$$platoRefs'] } } }, { $project: { nombre: 1 } }],
                as: 'platosInfo'
            } },
            { $project: {
                comandaNumber: 1,
                mozoId: '$mozos',
                mozoNombre: { $ifNull: [{ $arrayElemAt: ['$mozoInfo.name', 0] }, '$mozoNombre'] },
                mesaNum: { $ifNull: [{ $arrayElemAt: ['$mesaInfo.nummesa', 0] }, '$mesaNumero'] },
                statusComanda: '$status',
                createdAt: 1,
                platos: {
                    $map: {
                        input: '$platos',
                        as: 'p',
                        in: {
                            platoSubdocId: '$$p._id',
                            platoId: '$$p.platoId',
                            estado: '$$p.estado',
                            cantidad: '$$p.cantidad',
                            tiempos: '$$p.tiempos',
                            entregadoPor: '$$p.entregadoPor',
                            platoNombre: { $ifNull: [{ $arrayElemAt: [{ $map: { input: { $filter: { input: '$platosInfo', as: 'pi', cond: { $eq: ['$$pi._id', '$$p.plato'] } } }, as: 'pi', in: '$$pi.nombre' } }, 0] }, '$$p.nombre'] }
                        }
                    }
                }
            } },
            { $limit: 200 }
        ]);

        // Agrupar por mozo
        const porMozo = {};
        let pendientesSalio = 0, pendientesRecoger = 0;

        for (const c of comandas) {
            const platosActivos = (c.platos || []).filter(p => !p.eliminado && !p.anulado && ['recoger', 'salio', 'entregado'].includes(p.estado));
            if (!platosActivos.length) continue;

            const idMozo = String(c.mozoId || 'desconocido');
            const nombre = c.mozoNombre || 'Mozo';
            if (!porMozo[idMozo]) porMozo[idMozo] = { mozoId: c.mozoId, mozoNombre: nombre, comandas: [] };

            const metricas = calcularMetricasComanda(c.platos);
            for (const p of platosActivos) {
                if (p.estado === 'salio') pendientesSalio++;
                else if (p.estado === 'recoger') pendientesRecoger++;
            }

            porMozo[idMozo].comandas.push({
                comandaId: c._id,
                comandaNumber: c.comandaNumber,
                mesaNum: c.mesaNum,
                statusComanda: c.statusComanda,
                platos: platosActivos,
                resumenEstados: metricas.resumenEstados,
                platosEntregados: metricas.platosEntregados,
                platosTotal: metricas.platosTotal,
                tiempoCocinaSegundos: metricas.tiempoCocinaSegundos,
                tiempoMozoSegundos: metricas.tiempoMozoSegundos,
                diferenciaSegundos: metricas.diferenciaSegundos
            });
        }

        return {
            mozos: Object.values(porMozo),
            pendientesSalio,
            pendientesRecoger,
            cocinerosActivos: Object.keys(porMozo).length
        };
    } catch (error) {
        logger.error('Error al obtener rendimiento en vivo de mozos', { error: error.message });
        throw error;
    }
}

/**
 * KPIs agregados del turno (hoy).
 */
async function obtenerResumenTurnoMozos({ fechaInicio, fechaFin } = {}) {
    try {
        const inicio = fechaInicio ? new Date(fechaInicio) : moment().startOf('day').toDate();
        const fin = fechaFin ? new Date(fechaFin) : moment().endOf('day').toDate();

        const resultado = await obtenerHistorialComandasMozos({ fechaInicio: inicio, fechaFin: fin, limite: 1000 });
        const r = resultado.resumen;
        return {
            pendientesSalio: resultado.pendientesCount,
            comandasAtendidas: r.totalComandas,
            platosEntregados: r.totalPlatosEntregados,
            tiempoPromedioMozoSegundos: r.tiempoPromedioMozoSegundos,
            tiempoPromedioDiferenciaSegundos: r.tiempoPromedioDiferenciaSegundos,
            porcentajeDentroSLA: r.porcentajeDentroSLA,
            mozosActivos: r.porMozo.length
        };
    } catch (error) {
        logger.error('Error al obtener resumen de turno de mozos', { error: error.message });
        throw error;
    }
}

module.exports = {
    calcularMetricasComanda,
    obtenerHistorialComandasMozos,
    obtenerRendimientoEnVivo,
    obtenerResumenTurnoMozos,
    SLA_SALON_MINUTOS,
    formatDuracion,
    segundosAMinutos
};