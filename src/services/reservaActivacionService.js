/**
 * Servicio de activación de reservas programadas.
 * PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1
 *
 * Responsabilidades:
 *  - activarReservaProgramada(reservaId): transición pendiente -> activa.
 *    * Reserva.estado: pendiente -> activa
 *    * Comanda programada: programadaPorReserva=true -> false
 *    * Platos: pendiente -> pedido (entran a la cola operativa del KDS)
 *    * prioridadOrden = Date.now() (criterio KDS v5.5: ordena arriba)
 *    * Emite comanda-actualizada / mesa-actualizada vía globals de events.js
 *  - Es idempotente: si la reserva ya está activa, asegura platos en KDS.
 *  - No activa reservas en pendiente_aprobar (el ticket PPA aún no pasó caja).
 *  - No cambia el enum de status de comanda (sigue 'en_espera').
 *
 * El scheduler (timeoutService) es el único que debería llamar a activarReservaProgramada
 * en el flujo automático. El endpoint POST /reservas/:id/activar (manual) puede
 * reutilizarlo para el caso de "sentar al cliente antes de la hora".
 */
const moment = require('moment-timezone');
const logger = require('../utils/logger');

const Reserva = require('../database/models/reserva.model');
const Comanda = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');

/**
 * Activa una reserva programada: mueve la comanda a la cola operativa del KDS.
 * @param {String} reservaId
 * @param {Object} opts { origen: 'job' | 'manual' }
 * @returns {Object} { activada: boolean, reserva, comanda }
 */
/**
 * Misma secuencia que POST /comanda: platos y luego guarniciones, si los motores están habilitados.
 * No bloquea la activación si falla (Tomar manual sigue disponible).
 */
const aplicarAsignacionAutomaticaReserva = async (comandaId) => {
    try {
        const asignacionAutomaticaService = require('./asignacionAutomaticaService');
        const comandaPop = await Comanda.findById(comandaId)
            .populate('platos.plato', 'id categoria tipo tipos nombre codigo complementosUnidosAlPlato')
            .lean();
        if (!comandaPop || !comandaPop.platos?.length) return;
        const resultado = await asignacionAutomaticaService.asignarPlatosNuevos(comandaPop);
        logger.info('Auto-asignación post-activación reserva', {
            comandaId: comandaId?.toString(),
            comandaNumber: comandaPop.comandaNumber,
            asignados: resultado.asignados,
            noAsignados: resultado.noAsignados,
            motivo: resultado.motivo || null
        });
        try {
            const asignacionGuarnicionesService = require('./asignacionAutomaticaGuarnicionesService');
            const comandaPostPlatos = await Comanda.findById(comandaId)
                .populate('platos.plato', 'id categoria tipo tipos nombre codigo complementosUnidosAlPlato')
                .lean();
            if (comandaPostPlatos) {
                const resG = await asignacionGuarnicionesService.asignarGuarnicionesNuevas(comandaPostPlatos);
                logger.info('Auto-asignación guarniciones post-activación reserva', {
                    comandaId: comandaId?.toString(),
                    comandaNumber: comandaPop.comandaNumber,
                    asignados: resG.asignados,
                    noAsignados: resG.noAsignados,
                    motivo: resG.motivo || null
                });
            }
        } catch (eG) {
            logger.warn('Auto-asignación de guarniciones post-activación reserva falló (no crítico)', {
                comandaId, error: eG.message
            });
        }
        if ((resultado.asignados > 0) && global.emitRendimientoCocineroActualizado) {
            global.emitRendimientoCocineroActualizado({ tipo: 'reserva_activada', comandaId: comandaId?.toString() });
        }
    } catch (e) {
        logger.warn('Auto-asignación post-activación reserva falló (no crítico)', {
            comandaId, error: e.message
        });
    }
};

const listarComandasDeReserva = async (reserva) => {
    const ids = [];
    if (reserva.comandaGenerada) {
        ids.push(reserva.comandaGenerada._id || reserva.comandaGenerada);
    }
    const extras = await Comanda.find({
        origenReserva: reserva._id,
        IsActive: { $ne: false },
        status: { $nin: ['cancelado', 'anulado'] }
    }).select('_id');
    extras.forEach((c) => ids.push(c._id));
    const unique = [...new Set(ids.map((id) => String(id)))];
    if (!unique.length) return [];
    return Comanda.find({ _id: { $in: unique } });
};

const asegurarComandaReservaEnKds = async (comanda, logLabel) => {
    if (!comanda) return null;
    const debeActivar = comanda.programadaPorReserva
        || (comanda.platos || []).some((p) => p.estado === 'pendiente');
    if (!debeActivar && !comanda.programadaPorReserva) {
        return comanda;
    }
    let platosModificados = 0;
    (comanda.platos || []).forEach((p) => {
        if (p.estado === 'pendiente') {
            p.estado = 'pedido';
            if (!p.tiempos) p.tiempos = {};
            if (!p.tiempos.pedido) {
                p.tiempos.pedido = moment.tz('America/Lima').toDate();
            }
            platosModificados++;
        }
        (p.complementosSeleccionados || []).forEach((c) => {
            if (!c.estadoCocina || c.estadoCocina === 'pendiente') {
                c.estadoCocina = 'pedido';
            }
        });
    });
    comanda.programadaPorReserva = false;
    comanda.prioridadOrden = Date.now();
    comanda.origenCreacion = comanda.origenCreacion || 'reserva';
    if (platosModificados > 0) comanda.markModified('platos');
    await comanda.save();
    logger.info(logLabel, {
        comandaId: comanda._id,
        comandaNumber: comanda.comandaNumber,
        platosModificados
    });
    await aplicarAsignacionAutomaticaReserva(comanda._id);
    if (global.emitComandaActualizada) {
        await global.emitComandaActualizada(comanda._id);
    }
    return comanda;
};

const activarReservaProgramada = async (reservaId, opts = {}) => {
    const origen = opts.origen || 'job';
    try {
        const ahora = moment.tz('America/Lima').toDate();
        const reserva = await Reserva.findOneAndUpdate(
            { _id: reservaId, estado: 'pendiente' },
            { estado: 'activa', actualizadoEn: ahora },
            { new: true }
        ).populate('mesa', 'nummesa estado area');

        if (!reserva) {
            const actual = await Reserva.findById(reservaId).populate('mesa', 'nummesa estado area');
            if (!actual) {
                logger.warn('activarReservaProgramada: reserva no encontrada', { reservaId });
                return { activada: false, motivo: 'no_encontrada' };
            }
            if (actual.estado === 'pendiente_aprobar') {
                logger.info('activarReservaProgramada: esperando aprobación PPA, no se empuja a KDS', {
                    reservaId, origen
                });
                return { activada: false, motivo: 'esperando_aprobacion', reserva: actual };
            }
            if (actual.estado === 'activa') {
                logger.info('activarReservaProgramada: reserva ya activa, se asegura la comanda en KDS', {
                    reservaId, origen
                });
                const comandasYa = await listarComandasDeReserva(actual);
                let comandaYa = null;
                for (const c of comandasYa) {
                    comandaYa = await asegurarComandaReservaEnKds(
                        c,
                        'Comanda programada asegurada en KDS (reserva ya activa)'
                    ) || comandaYa;
                }
                return { activada: true, yaActiva: true, reserva: actual, comanda: comandaYa };
            }
            logger.warn('activarReservaProgramada: estado no activable', {
                reservaId, estado: actual.estado, origen
            });
            return { activada: false, motivo: 'estado_no_pendiente', reserva: actual };
        }

        if (opts.motivo) {
            reserva.notas = `${reserva.notas || ''} [ACTIVACIÓN ANTICIPADA (${origen}): ${String(opts.motivo).trim()}]`.trim();
            await reserva.save();
        }

        logger.info('Activando reserva programada', {
            reservaId,
            origen,
            mesa: reserva.mesa?._id,
            fechaReserva: reserva.fechaReserva,
            fechaCocina: reserva.fechaCocina
        });

        const comandas = await listarComandasDeReserva(reserva);
        let comandaActualizada = null;
        if (!comandas.length) {
            logger.warn('activarReservaProgramada: reserva sin comandas', { reservaId });
        }
        for (const comanda of comandas) {
            comandaActualizada = await asegurarComandaReservaEnKds(comanda, 'Comanda programada activada')
                || comandaActualizada;
        }

        try {
            if (reserva.mesa && global.emitMesaActualizada) {
                await global.emitMesaActualizada(reserva.mesa._id || reserva.mesa);
            }
        } catch (e) {
            logger.error('Error al emitir mesa-actualizada en activación', { error: e.message, reservaId });
        }
        try {
            if (global.emitReservaActualizada) {
                await global.emitReservaActualizada(reservaId, {
                    estado: 'activa',
                    origen: origen === 'manual_anticipada' ? 'activacion_anticipada' : 'activacion_programada'
                });
            }
        } catch (e) {
            logger.error('Error al emitir reserva-actualizada en activación', { error: e.message, reservaId });
        }

        return { activada: true, reserva, comanda: comandaActualizada };
    } catch (error) {
        logger.error('Error en activarReservaProgramada', {
            error: error.message,
            stack: error.stack,
            reservaId,
            origen
        });
        throw error;
    }
};

module.exports = {
    activarReservaProgramada
};
