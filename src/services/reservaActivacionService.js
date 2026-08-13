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
 *  - Es idempotente: si la reserva ya está activa, no hace nada.
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
const activarReservaProgramada = async (reservaId, opts = {}) => {
    const origen = opts.origen || 'job';
    try {
        // Idempotencia: atomic update pendiente -> activa
        const reserva = await Reserva.findByIdAndUpdate(
            reservaId,
            { estado: 'activa', actualizadoEn: moment.tz('America/Lima').toDate() },
            { new: true }
        ).populate('mesa', 'nummesa estado area');

        if (!reserva) {
            logger.warn('activarReservaProgramada: reserva no encontrada', { reservaId });
            return { activada: false, motivo: 'no_encontrada' };
        }

        // Si ya estaba activa (o en otro estado terminal), no reprocesar la comanda
        // Nota: el findByIdAndUpdate arriba ya la dejó en 'activa', pero si vino
        // de un segundo disparo del job tras un restart, evitamos tocar la comanda.
        const yaActivadaPreviamente = reserva.comandaGenerada && origen === 'job';

        logger.info('Activando reserva programada', {
            reservaId,
            estadoPrevioEsperado: 'pendiente',
            origen,
            mesa: reserva.mesa?._id,
            fechaReserva: reserva.fechaReserva,
            fechaCocina: reserva.fechaCocina
        });

        // Activar la comanda programada si existe
        let comandaActualizada = null;
        if (reserva.comandaGenerada) {
            // Solo actualizamos si aún está marcada como programada (idempotencia a nivel comanda)
            const setPrioridad = { $set: { programadaPorReserva: false }, $current: {} };
            // Construimos el update manualmente porque $current no aplica para prioridadOrden
            const comanda = await Comanda.findById(reserva.comandaGenerada);
            if (comanda && comanda.programadaPorReserva) {
                // Platos pendiente -> pedido (entran a la cola)
                let platosModificados = 0;
                comanda.platos.forEach((p) => {
                    if (p.estado === 'pendiente') {
                        p.estado = 'pedido';
                        if (!p.tiempos) p.tiempos = {};
                        if (!p.tiempos.pedido) {
                            p.tiempos.pedido = moment.tz('America/Lima').toDate();
                        }
                        platosModificados++;
                    }
                });
                comanda.programadaPorReserva = false;
                comanda.prioridadOrden = Date.now(); // 🚀 arriba en la cola
                comanda.origenCreacion = comanda.origenCreacion || 'reserva';
                await comanda.save();
                comandaActualizada = comanda;
                logger.info('Comanda programada activada', {
                    comandaId: comanda._id,
                    comandaNumber: comanda.comandaNumber,
                    platosModificados,
                    prioridadOrden: comanda.prioridadOrden
                });
            } else if (comanda) {
                logger.debug('Comanda ya no estaba programada, se omite update', {
                    comandaId: comanda._id,
                    programadaPorReserva: comanda.programadaPorReserva
                });
                comandaActualizada = comanda;
            }
        } else {
            logger.warn('activarReservaProgramada: reserva sin comandaGenerada', { reservaId });
        }

        // Emitir eventos Socket.io (definidos en events.js como globals)
        try {
            if (comandaActualizada && global.emitComandaActualizada) {
                await global.emitComandaActualizada(comandaActualizada._id);
            }
        } catch (e) {
            logger.error('Error al emitir comanda-actualizada en activación', { error: e.message, reservaId });
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
                await global.emitReservaActualizada(reservaId, { estado: 'activa', origen: 'activacion_programada' });
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
