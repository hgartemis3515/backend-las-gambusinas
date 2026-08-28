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

// Cocina: primer en_espera/pedido → último recoger (congela al finalizar cocina).
// Mozo: primer recoger (o salio) → último entregado (incluye espera en pass).
// Diferencia = mozo − cocina a nivel comanda.
function platoListoCocina(p) {
    if (!p) return false;
    if (p.tiempos?.recoger) return true;
    const est = String(p.estado || '').toLowerCase();
    return ['recoger', 'salio', 'entregado', 'pagado'].includes(est);
}

function platoPendienteMozo(p) {
    if (!p) return false;
    const t = p.tiempos || {};
    const est = String(p.estado || '').toLowerCase();
    if (t.entregado || t.pagado || est === 'entregado' || est === 'pagado') return false;
    return !!(t.recoger || t.salio || est === 'recoger' || est === 'salio');
}

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

    let inicioCocina = null, finCocina = null;
    let inicioMozo = null, finMozo = null;
    let inicioGlobal = null, finGlobal = null;
    let platosEntregados = 0;
    let algunEnCocina = false;
    let algunPendienteMozo = false;

    for (const p of tiemposValidos) {
        const t = p.tiempos || {};
        const est = String(p.estado || '').toLowerCase();
        const inicio = t.en_espera || t.pedido;
        if (inicio) {
            if (!inicioCocina || new Date(inicio) < new Date(inicioCocina)) inicioCocina = inicio;
            if (!inicioGlobal || new Date(inicio) < new Date(inicioGlobal)) inicioGlobal = inicio;
        }

        const listoCocina = platoListoCocina(p);
        if (!listoCocina) algunEnCocina = true;
        const finCocinaPlato = t.recoger || (listoCocina ? (t.salio || t.entregado || t.pagado) : null);
        if (finCocinaPlato) {
            if (!finCocina || new Date(finCocinaPlato) > new Date(finCocina)) finCocina = finCocinaPlato;
        }

        const iniMozo = t.recoger || t.salio;
        if (iniMozo) {
            if (!inicioMozo || new Date(iniMozo) < new Date(inicioMozo)) inicioMozo = iniMozo;
        }

        if (t.entregado) {
            if (!finMozo || new Date(t.entregado) > new Date(finMozo)) finMozo = t.entregado;
            if (!finGlobal || new Date(t.entregado) > new Date(finGlobal)) finGlobal = t.entregado;
            platosEntregados++;
        } else if (t.pagado || est === 'pagado') {
            const finPago = t.pagado || ahora;
            if (!finMozo || new Date(finPago) > new Date(finMozo)) finMozo = finPago;
            if (!finGlobal || new Date(finPago) > new Date(finGlobal)) finGlobal = finPago;
            platosEntregados++;
        } else if (platoPendienteMozo(p)) {
            algunPendienteMozo = true;
            if (!finMozo || ahora > new Date(finMozo)) finMozo = ahora;
        }

        if (t.pagado) {
            if (!finGlobal || new Date(t.pagado) > new Date(finGlobal)) finGlobal = t.pagado;
        }
    }

    // Cocina en curso: aún hay platos sin finalizar → fin provisional = ahora
    if (algunEnCocina) {
        if (!finCocina || ahora > new Date(finCocina)) finCocina = ahora;
    }

    const diff = (a, b) => a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)) : null;
    const tiempoCocina = diff(inicioCocina, finCocina);
    const tiempoMozo = diff(inicioMozo, finMozo);
    const diferencia = (tiempoCocina != null && tiempoMozo != null) ? (tiempoMozo - tiempoCocina) : null;
    const tiempoExperiencia = diff(inicioGlobal, finGlobal || (algunPendienteMozo ? ahora : null));

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
 * Incluye ciclo abierto Y pedidos terminados (pagado/completado aunque IsActive=false).
 * Una fila por comanda, con todos los platos embebidos y métricas cocina/mozo/Δ.
 */
async function obtenerHistorialComandasMozos({ mozoId = null, fechaInicio, fechaFin, limite = 500 } = {}) {
    try {
        // NO exigir IsActive:true — al pagar/liberar la comanda queda IsActive=false
        // y debe seguir visible en el registro de platos.
        const matchBase = {
            mozos: { $ne: null },
            eliminada: { $ne: true }
        };
        if (mozoId) {
            const oid = toObjectId(mozoId);
            if (oid) matchBase.mozos = oid;
        }

        const desde = new Date(fechaInicio);
        const hasta = new Date(fechaFin);
        const diaDesde = new Date(moment(fechaInicio).startOf('day').toDate());
        const diaHasta = new Date(moment(fechaFin).endOf('day').toDate());
        const ahoraLima = moment.tz('America/Lima').toDate();
        const rangoIncluyeAhora = desde <= ahoraLima && hasta >= ahoraLima;

        // 1) Entregadas / cobradas en el período (activas o ya cerradas)
        const matchEntregadas = {
            ...matchBase,
            $or: [
                { 'platos.tiempos.entregado': { $gte: desde, $lte: hasta } },
                { 'platos.tiempos.pagado': { $gte: desde, $lte: hasta } },
                { tiempoPagado: { $gte: desde, $lte: hasta } }
            ]
        };

        // 2) Cerradas en el período (pagado/completado) aunque no tengan tiempos.entregado
        const matchCerradas = {
            ...matchBase,
            status: { $in: ['pagado', 'completado'] },
            $or: [
                { tiempoPagado: { $gte: desde, $lte: hasta } },
                { updatedAt: { $gte: desde, $lte: hasta } },
                { createdAt: { $gte: diaDesde, $lte: diaHasta } }
            ]
        };

        // 3) En curso (aún activas). Si el filtro incluye hoy, no exigir createdAt
        // del día: comandas de ayer con platos todavía en cocina deben verse.
        const matchEnCurso = {
            ...matchBase,
            IsActive: true,
            status: { $nin: ['pagado', 'completado', 'cancelado'] },
            'platos.estado': { $in: ['pendiente', 'pedido', 'en_espera', 'recoger', 'salio', 'entregado'] },
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
                            tipoServicio: '$$p.tipoServicio',
                            eliminado: '$$p.eliminado',
                            anulado: '$$p.anulado',
                            tiempos: '$$p.tiempos',
                            procesadoPor: '$$p.procesadoPor',
                            procesandoPor: '$$p.procesandoPor',
                            asignacionMeta: '$$p.asignacionMeta',
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

        const [entregadas, cerradas, enCurso] = await Promise.all([
            Comanda.aggregate(pipeline(matchEntregadas)),
            Comanda.aggregate(pipeline(matchCerradas)),
            rangoIncluyeAhora ? Comanda.aggregate(pipeline(matchEnCurso)) : Promise.resolve([])
        ]);

        // Deduplicar por comandaId
        const mapa = new Map();
        for (const c of [...entregadas, ...cerradas, ...enCurso]) {
            const key = String(c._id);
            if (!mapa.has(key)) mapa.set(key, c);
        }

        const ahora = new Date();
        const comandas = Array.from(mapa.values()).map(c => {
            const metricas = calcularMetricasComanda(c.platos);
            const platosActivos = (c.platos || []).filter(p => !p.eliminado && !p.anulado);
            const statusLower = String(c.statusComanda || '').toLowerCase();
            const cerrada = statusLower === 'pagado' || statusLower === 'completado' || c.IsActive === false;
            const todosTerminados = metricas.platosEntregados >= metricas.platosTotal && metricas.platosTotal > 0;
            let estadoRegistro = 'en_curso';
            if (statusLower === 'pagado') estadoRegistro = 'pagada';
            else if (statusLower === 'completado' || (cerrada && todosTerminados)) estadoRegistro = 'completada';
            else if (todosTerminados) estadoRegistro = 'completada';

            return {
                comandaId: c._id,
                comandaNumber: c.comandaNumber,
                mozoId: c.mozoId,
                mozoNombre: c.mozoNombre,
                mesaNum: c.mesaNum,
                statusComanda: c.statusComanda,
                IsActive: c.IsActive !== false,
                tiempoPagado: c.tiempoPagado || null,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
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

        // Ordenar por fecha: más nuevo → más antiguo
        comandas.sort((a, b) => {
            const fechaA = new Date(a.tiempoPagado || a.updatedAt || a.createdAt).getTime();
            const fechaB = new Date(b.tiempoPagado || b.updatedAt || b.createdAt).getTime();
            return fechaB - fechaA;
        });

        // Resumen agregado
        const porMozo = {};
        let totalComandas = 0, totalPlatosEntregados = 0, totalCerradas = 0;
        let sumaTiemposMozo = 0, cuentaMozo = 0;
        let sumaDiferencia = 0, cuentaDiff = 0;
        let dentroSLA = 0;

        for (const c of comandas) {
            totalComandas++;
            totalPlatosEntregados += c.platosEntregados;
            if (c.estadoRegistro === 'pagada' || c.estadoRegistro === 'completada') totalCerradas++;
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
            cerradasCount: totalCerradas,
            resumen: {
                totalComandas,
                totalPlatosEntregados,
                totalCerradas,
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
 * Snapshot en vivo: comandas activas del mozo en ciclo abierto
 * (desde crear pedido hasta pago/liberación).
 * Excluye pagado/completado/cancelado, IsActive=false y eliminadas (misma tabla que comandas.html).
 */
async function obtenerRendimientoEnVivo({ mozoId = null } = {}) {
    try {
        const ESTADOS_CICLO_ABIERTO = ['pendiente', 'pedido', 'en_espera', 'recoger', 'salio', 'entregado'];
        const match = {
            eliminada: { $ne: true },
            IsActive: true,
            status: { $nin: ['pagado', 'completado', 'cancelado'] },
            'platos.estado': { $in: ESTADOS_CICLO_ABIERTO },
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
                            eliminado: '$$p.eliminado',
                            anulado: '$$p.anulado',
                            tiempos: '$$p.tiempos',
                            entregadoPor: '$$p.entregadoPor',
                            platoNombre: { $ifNull: [{ $arrayElemAt: [{ $map: { input: { $filter: { input: '$platosInfo', as: 'pi', cond: { $eq: ['$$pi._id', '$$p.plato'] } } }, as: 'pi', in: '$$pi.nombre' } }, 0] }, '$$p.nombre'] }
                        }
                    }
                }
            } },
            { $limit: 200 }
        ]);

        // Agrupar por mozo — todos los platos activos del ciclo (no solo salón)
        const porMozo = {};
        let pendientesSalio = 0, pendientesRecoger = 0, platosEnCocina = 0;

        for (const c of comandas) {
            const platosActivos = (c.platos || []).filter(p =>
                !p.eliminado && !p.anulado && ESTADOS_CICLO_ABIERTO.includes(p.estado)
            );
            if (!platosActivos.length) continue;

            const idMozo = String(c.mozoId || 'desconocido');
            const nombre = c.mozoNombre || 'Mozo';
            if (!porMozo[idMozo]) porMozo[idMozo] = { mozoId: c.mozoId, mozoNombre: nombre, comandas: [] };

            const metricas = calcularMetricasComanda(platosActivos);
            for (const p of platosActivos) {
                if (p.estado === 'salio') pendientesSalio++;
                else if (p.estado === 'recoger') pendientesRecoger++;
                else if (p.estado === 'pedido' || p.estado === 'en_espera' || p.estado === 'pendiente') platosEnCocina++;
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
            platosEnCocina,
            comandasEnCurso: Object.values(porMozo).reduce((n, m) => n + (m.comandas?.length || 0), 0),
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