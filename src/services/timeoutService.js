/**
 * Servicio de gestion de timeouts para reservas
 * 
 * Este servicio maneja:
 * - Programacion de timeouts para expiracion de reservas
 * - Rehidratacion de timeouts al reiniciar el servidor
 * - Alertas cuando una reserva esta proxima a expirar
 * - Cancelacion de timeouts cuando una reserva es atendida/cancelada
 * 
 * IMPORTANTE: Los timeouts se almacenan en memoria. Si el servidor se reinicia,
 * se deben rehidratar desde la base de datos.
 */

const moment = require('moment-timezone');
const logger = require('../utils/logger');

// Importar repositorios de forma diferida para evitar dependencias circulares
let reservaRepository = null;
let mesasRepository = null;
let reservaActivacionService = null;

const getReservaRepository = () => {
    if (!reservaRepository) {
        reservaRepository = require('../repository/reserva.repository');
    }
    return reservaRepository;
};

const getReservaActivacionService = () => {
    if (!reservaActivacionService) {
        reservaActivacionService = require('./reservaActivacionService');
    }
    return reservaActivacionService;
};

// Mapa de timeouts activos: reservaId -> { timeoutExpiracion, timeoutAlerta, timeoutActivacion, timeoutAlertaActivacion }
const reservaTimeouts = new Map();

const SWEEP_ACTIVACION_MS = 30_000;
let sweepInterval = null;

// Intervalo para alertas de expiracion proxima (en minutos)
const MINUTOS_ALERTA_EXPIRACION = 5;

// Namespace para Socket.io (se configura al iniciar)
let adminNamespace = null;

/**
 * Configurar el namespace de Socket.io para emitir eventos
 * @param {Object} adminNs - Namespace admin de Socket.io
 */
const configurarSocketNamespace = (adminNs) => {
    adminNamespace = adminNs;
    logger.info('TimeoutService configurado con namespace Socket.io');
};

/**
 * Calcular la fecha de expiracion de una reserva
 * @param {Date} fechaReserva - Fecha y hora de la reserva
 * @param {Number} tiempoEspera - Tiempo de espera en minutos
 * @returns {Date} Fecha de expiracion
 */
const calcularFechaExpiracion = (fechaReserva, tiempoEspera) => {
    return moment(fechaReserva).add(tiempoEspera, 'minutes').toDate();
};

/**
 * Calcular el delay en milisegundos hasta una fecha futura
 * @param {Date} fechaFutura - Fecha objetivo
 * @returns {Number} Milisegundos de delay (0 si ya paso)
 */
const calcularDelay = (fechaFutura) => {
    const ahora = Date.now();
    const objetivo = new Date(fechaFutura).getTime();
    return Math.max(0, objetivo - ahora);
};

/**
 * Emitir evento de Socket.io
 * @param {String} eventName - Nombre del evento
 * @param {Object} data - Datos del evento
 */
const emitirEvento = (eventName, data) => {
    if (adminNamespace && adminNamespace.sockets && adminNamespace.sockets.size > 0) {
        adminNamespace.emit(eventName, {
            ...data,
            timestamp: moment().tz('America/Lima').toISOString()
        });
        logger.debug(`Evento Socket emitido: ${eventName}`, { reservaId: data.reservaId });
    }
};

/**
 * Manejar la expiracion de una reserva
 * @param {String} reservaId - ID de la reserva
 */
const manejarExpiracion = async (reservaId) => {
    try {
        logger.info('Procesando expiracion de reserva', { reservaId });
        
        // Marcar como rechazada y liberar mesa
        await getReservaRepository().marcarReservaComoRechazada(reservaId);
        
        // Emitir evento de mesa actualizada
        if (global.emitMesaActualizada) {
            const reserva = await getReservaRepository().obtenerReservaPorId(reservaId);
            if (reserva && reserva.mesa) {
                await global.emitMesaActualizada(reserva.mesa._id || reserva.mesa);
            }
        }
        
        // Emitir evento de reserva expirada
        emitirEvento('reserva-expirada', { reservaId });
        
        // Limpiar del mapa de timeouts
        reservaTimeouts.delete(reservaId);
        
        logger.info('Reserva expirada y procesada', { reservaId });
        
    } catch (error) {
        logger.error('Error al manejar expiracion de reserva', { 
            error: error.message, 
            reservaId 
        });
    }
};

/**
 * Manejar alerta de expiracion proxima
 * @param {String} reservaId - ID de la reserva
 */
const manejarAlertaProxima = async (reservaId) => {
    try {
        logger.info('Enviando alerta de expiracion proxima', { reservaId });

        const reserva = await getReservaRepository().obtenerReservaPorId(reservaId);

        if (reserva && (reserva.estado === 'pendiente' || reserva.estado === 'pendiente_aprobar')) {
            emitirEvento('reserva-alerta-expiracion', {
                reservaId,
                mesa: reserva.mesa?.nummesa,
                cliente: reserva.clienteNombre,
                minutosRestantes: MINUTOS_ALERTA_EXPIRACION
            });
        }

    } catch (error) {
        logger.error('Error al manejar alerta de expiracion proxima', {
            error: error.message,
            reservaId
        });
    }
};

// ========== PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: activación por fechaCocina (T−20) ==========

/**
 * Manejar el bloqueo diferido de la mesa: a T−minutosBloqueoMesaAntes de la atención,
 * la mesa pasa a 'reservado' (si no lo estaba ya). Solo aplica si la reserva se creó
 * con bloquearMesaAlCrear=false. El job de activación de cocina no toca el estado de
 * la mesa (lo gestiona este timeout por separado).
 */
const manejarBloqueoMesa = async (reservaId) => {
    try {
        const reserva = await getReservaRepository().obtenerReservaPorId(reservaId);
        if (!reserva) return;
        if (reserva.estado !== 'pendiente' && reserva.estado !== 'pendiente_aprobar') return;
        const mesasModel = require('../database/models/mesas.model');
        const mesa = await mesasModel.findById(reserva.mesa?._id || reserva.mesa);
        if (mesa && mesa.estado === 'libre') {
            mesa.estado = 'reservado';
            await mesa.save();
            logger.info('Bloqueo diferido de mesa aplicado', { reservaId, mesaId: mesa._id });
            if (global.emitMesaActualizada) {
                await global.emitMesaActualizada(mesa._id);
            }
        }
    } catch (error) {
        logger.error('Error en manejarBloqueoMesa', { error: error.message, reservaId });
    }
};

/**
 * Programar el bloqueo diferido de la mesa a (fechaReserva - minutosBloqueoMesaAntes).
 * @param {String} reservaId
 * @param {Date} fechaReserva
 * @param {Number} minutosBloqueoMesaAntes
 */
const programarBloqueoMesa = (reservaId, fechaReserva, minutosBloqueoMesaAntes = 45) => {
    try {
        if (!fechaReserva || !minutosBloqueoMesaAntes) return { programado: false };
        const fechaBloqueo = moment(fechaReserva).subtract(minutosBloqueoMesaAntes, 'minutes').toDate();
        const delay = calcularDelay(fechaBloqueo);
        const entry = reservaTimeouts.get(reservaId.toString()) || {};
        if (delay > 0) {
            entry.timeoutBloqueoMesa = setTimeout(() => {
                manejarBloqueoMesa(reservaId);
            }, delay);
            logger.debug('Bloqueo diferido de mesa programado', {
                reservaId, fechaBloqueo: fechaBloqueo.toISOString(), delayMs: delay
            });
        } else {
            // Ya pasó el momento de bloqueo: bloquear ya si la atención aún es futura
            const ahora = moment().tz('America/Lima');
            const atencion = moment.tz(fechaReserva, 'America/Lima');
            if (atencion.isAfter(ahora)) {
                setImmediate(() => manejarBloqueoMesa(reservaId));
            }
        }
        reservaTimeouts.set(reservaId.toString(), entry);
        return { programado: true, fechaBloqueo, delayMs: delay };
    } catch (error) {
        logger.error('Error al programar bloqueo de mesa', { error: error.message, reservaId });
        return { programado: false, error: error.message };
    }
};

/**
 * Manejar la activación automática de una reserva programada.
 * Delega la transición de estados a reservaActivacionService.
 */
const manejarActivacion = async (reservaId) => {
    try {
        logger.info('Disparo de activación de reserva programada', { reservaId });
        await getReservaActivacionService().activarReservaProgramada(reservaId, { origen: 'job' });
        // La expiración de no-show se programa aparte (programarExpiracion) y
        // no se cancela aquí: el cliente puede llegar después de la activación.
    } catch (error) {
        logger.error('Error en manejarActivacion', { error: error.message, reservaId });
    }
};

/**
 * Manejar alerta previa a la activación de cocina (T−minutosAlertaPreviaCocina).
 */
const manejarAlertaActivacion = async (reservaId) => {
    try {
        const reserva = await getReservaRepository().obtenerReservaPorId(reservaId);
        if (reserva && reserva.estado === 'pendiente') {
            emitirEvento('reserva-alerta-activacion', {
                reservaId,
                mesa: reserva.mesa?.nummesa,
                cliente: reserva.clienteNombre,
                fechaCocina: reserva.fechaCocina,
                fechaReserva: reserva.fechaReserva
            });
            logger.info('Alerta pre-activación cocina enviada', { reservaId });
        }
    } catch (error) {
        logger.error('Error en manejarAlertaActivacion', { error: error.message, reservaId });
    }
};

/**
 * Programar la activación automática de una reserva a fechaCocina.
 * @param {String} reservaId
 * @param {Date} fechaCocina - fecha en que la cocina debe empezar a preparar
 * @param {Number} minutosAlertaPrevia - minutos antes para alertar (0 = sin alerta)
 */
const programarActivacion = (reservaId, fechaCocina, minutosAlertaPrevia = 0) => {
    try {
        if (!fechaCocina) {
            logger.warn('programarActivacion: fechaCocina nula, se omite', { reservaId });
            return { programado: false, motivo: 'sin_fechaCocina' };
        }

        // No cancelar expiración. Reemplazar solo el job de activación (evitar doble disparo).
        const entry = reservaTimeouts.get(reservaId.toString()) || {};
        if (entry.timeoutActivacion) {
            clearTimeout(entry.timeoutActivacion);
            entry.timeoutActivacion = null;
        }
        if (entry.timeoutAlertaActivacion) {
            clearTimeout(entry.timeoutAlertaActivacion);
            entry.timeoutAlertaActivacion = null;
        }

        const delayActivacion = calcularDelay(fechaCocina);

        if (delayActivacion > 0) {
            entry.timeoutActivacion = setTimeout(() => {
                manejarActivacion(reservaId);
            }, delayActivacion);
            logger.info('Activación de cocina programada', {
                reservaId,
                fechaCocina: new Date(fechaCocina).toISOString(),
                delayMs: delayActivacion,
                delayMinutos: Math.round(delayActivacion / 60000)
            });
        } else {
            // fechaCocina ya pasó: activar de inmediato (no perder la reserva)
            logger.warn('fechaCocina ya pasó, activando inmediatamente', { reservaId });
            setImmediate(() => manejarActivacion(reservaId));
        }

        // Alerta previa (T−N)
        if (minutosAlertaPrevia > 0) {
            const fechaAlerta = moment(fechaCocina).subtract(minutosAlertaPrevia, 'minutes').toDate();
            const delayAlerta = calcularDelay(fechaAlerta);
            if (delayAlerta > 0 && delayAlerta < delayActivacion) {
                entry.timeoutAlertaActivacion = setTimeout(() => {
                    manejarAlertaActivacion(reservaId);
                }, delayAlerta);
                logger.debug('Alerta pre-activación programada', {
                    reservaId,
                    fechaAlerta: fechaAlerta.toISOString(),
                    delayMs: delayAlerta
                });
            }
        }

        reservaTimeouts.set(reservaId.toString(), entry);
        return { programado: true, fechaCocina, delayMs: delayActivacion };
    } catch (error) {
        logger.error('Error al programar activación', { error: error.message, reservaId, fechaCocina });
        return { programado: false, error: error.message };
    }
};

// ========== FIN PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1 ==========

/**
 * Programar timeout para expiracion de reserva
 * @param {String} reservaId - ID de la reserva
 * @param {Date} fechaReserva - Fecha y hora de la reserva
 * @param {Number} tiempoEspera - Tiempo de espera en minutos
 * @returns {Object} Info de los timeouts programados
 */
const programarExpiracion = (reservaId, fechaReserva, tiempoEspera) => {
    try {
        const id = reservaId.toString();
        const entry = reservaTimeouts.get(id) || {};
        if (entry.timeoutExpiracion) {
            clearTimeout(entry.timeoutExpiracion);
            entry.timeoutExpiracion = null;
        }
        if (entry.timeoutAlerta) {
            clearTimeout(entry.timeoutAlerta);
            entry.timeoutAlerta = null;
        }

        const fechaExpiracion = calcularFechaExpiracion(fechaReserva, tiempoEspera);
        const delayExpiracion = calcularDelay(fechaExpiracion);

        const fechaAlerta = moment(fechaExpiracion).subtract(MINUTOS_ALERTA_EXPIRACION, 'minutes').toDate();
        const delayAlerta = calcularDelay(fechaAlerta);

        if (delayAlerta > 0 && delayAlerta < delayExpiracion) {
            entry.timeoutAlerta = setTimeout(() => {
                manejarAlertaProxima(reservaId);
            }, delayAlerta);

            logger.debug('Alerta de expiracion programada', {
                reservaId,
                fechaAlerta: fechaAlerta.toISOString(),
                delayMs: delayAlerta
            });
        }

        if (delayExpiracion > 0) {
            entry.timeoutExpiracion = setTimeout(() => {
                manejarExpiracion(reservaId);
            }, delayExpiracion);

            logger.info('Timeout de expiracion programado', {
                reservaId,
                fechaExpiracion: fechaExpiracion.toISOString(),
                delayMs: delayExpiracion,
                delayMinutos: Math.round(delayExpiracion / 60000)
            });
        } else {
            logger.warn('Reserva ya expirada, procesando inmediatamente', { reservaId });
            setImmediate(() => manejarExpiracion(reservaId));
        }

        reservaTimeouts.set(id, entry);

        return {
            programado: delayExpiracion > 0,
            fechaExpiracion,
            delayMs: delayExpiracion
        };

    } catch (error) {
        logger.error('Error al programar expiracion', {
            error: error.message,
            reservaId,
            fechaReserva,
            tiempoEspera
        });
        return { programado: false, error: error.message };
    }
};

/**
 * Cancelar timeout de una reserva
 * @param {String} reservaId - ID de la reserva
 */
const cancelarTimeout = (reservaId) => {
    const id = reservaId.toString();
    const timeouts = reservaTimeouts.get(id);

    if (timeouts) {
        if (timeouts.timeoutExpiracion) {
            clearTimeout(timeouts.timeoutExpiracion);
        }
        if (timeouts.timeoutAlerta) {
            clearTimeout(timeouts.timeoutAlerta);
        }
        // PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1
        if (timeouts.timeoutActivacion) {
            clearTimeout(timeouts.timeoutActivacion);
        }
        if (timeouts.timeoutAlertaActivacion) {
            clearTimeout(timeouts.timeoutAlertaActivacion);
        }
        if (timeouts.timeoutBloqueoMesa) {
            clearTimeout(timeouts.timeoutBloqueoMesa);
        }
        reservaTimeouts.delete(id);
        logger.debug('Timeouts cancelados', { reservaId: id });
    }
};

/** Cancela solo el job de activación KDS (no-show y bloqueo de mesa siguen). */
const cancelarActivacion = (reservaId) => {
    const id = reservaId.toString();
    const timeouts = reservaTimeouts.get(id);
    if (!timeouts) return;
    if (timeouts.timeoutActivacion) {
        clearTimeout(timeouts.timeoutActivacion);
        timeouts.timeoutActivacion = null;
    }
    if (timeouts.timeoutAlertaActivacion) {
        clearTimeout(timeouts.timeoutAlertaActivacion);
        timeouts.timeoutAlertaActivacion = null;
    }
    reservaTimeouts.set(id, timeouts);
    logger.debug('Activación de cocina cancelada', { reservaId: id });
};

/**
 * Rehidratar timeouts de todas las reservas pendientes
 * Debe llamarse al iniciar el servidor
 * @returns {Object} Resultado de la rehidratacion
 */
const rehidratarTimeouts = async () => {
    logger.info('Iniciando rehidratacion de timeouts de reservas...');

    const resultado = {
        procesadas: 0,
        expiradas: 0,
        reprogramadas: 0,
        activadasInmediato: 0,
        errores: 0
    };

    try {
        // PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: leer minutos de alerta previa de cocina + bloqueo mesa
        let minutosAlertaPrevia = 0;
        let minutosBloqueoMesa = 45;
        let bloquearMesaAlCrear = false;
        try {
            const configuracionSistemaModel = require('../database/models/configuracionSistema.model');
            const cfg = await configuracionSistemaModel.findById('configuracion_unica').lean();
            minutosAlertaPrevia = cfg?.reservas?.minutosAlertaPreviaCocina ?? 10;
            minutosBloqueoMesa = cfg?.reservas?.minutosBloqueoMesaAntes ?? 45;
            bloquearMesaAlCrear = cfg?.reservas?.bloquearMesaAlCrear ?? false;
        } catch (e) {
            logger.warn('No se pudo leer config de reservas; usando defaults', { error: e.message });
        }

        const reservas = await getReservaRepository().obtenerReservasPendientesExpiracion();

        logger.info(`Encontradas ${reservas.length} reservas pendientes para rehidratar`);

        for (const reserva of reservas) {
            resultado.procesadas++;

            try {
                if (reserva.yaExpiro) {
                    // La reserva ya expiro, marcarla como rechazada
                    await manejarExpiracion(reserva._id);
                    resultado.expiradas++;
                } else {
                    // Reprogramar el timeout de expiración (no-show)
                    programarExpiracion(
                        reserva._id,
                        reserva.fechaReserva,
                        reserva.tiempoEspera
                    );

                    // Solo reservas ya aprobadas (pendiente) programan/disparan KDS.
                    if (reserva.fechaCocina && reserva.estado === 'pendiente') {
                        const fechaCocina = new Date(reserva.fechaCocina);
                        const ahora = Date.now();
                        if (fechaCocina.getTime() <= ahora) {
                            logger.warn('fechaCocina en el pasado al rehidratar; activando inmediatamente', {
                                reservaId: reserva._id,
                                fechaCocina: fechaCocina.toISOString()
                            });
                            setImmediate(() => manejarActivacion(reserva._id));
                            resultado.activadasInmediato++;
                        } else {
                            programarActivacion(reserva._id, fechaCocina, minutosAlertaPrevia);
                        }
                    }

                    // PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: reprogramar bloqueo diferido de mesa
                    if (reserva.fechaReserva && !bloquearMesaAlCrear) {
                        programarBloqueoMesa(reserva._id, reserva.fechaReserva, minutosBloqueoMesa);
                    }

                    resultado.reprogramadas++;
                }
            } catch (error) {
                resultado.errores++;
                logger.error('Error al rehidratar reserva', {
                    error: error.message,
                    reservaId: reserva._id
                });
            }
        }

        logger.info('Rehidratacion de timeouts completada', resultado);

        iniciarBarridoActivaciones();

        return resultado;

    } catch (error) {
        logger.error('Error en rehidratacion de timeouts', { error: error.message });
        resultado.error = error.message;
        return resultado;
    }
};

const barrerActivacionesVencidas = async () => {
    try {
        const Reserva = require('../database/models/reserva.model');
        const vencidas = await Reserva.find({
            estado: 'pendiente',
            fechaCocina: { $ne: null, $lte: new Date() },
            comandaGenerada: { $ne: null }
        }).select('_id fechaCocina estado').lean();
        if (!vencidas.length) return;
        logger.info('Barrido T−20: reservas con fechaCocina vencida', { cantidad: vencidas.length });
        for (const r of vencidas) {
            await manejarActivacion(r._id);
        }
    } catch (error) {
        logger.error('Error en barrido de activaciones T−20', { error: error.message });
    }
};

const iniciarBarridoActivaciones = () => {
    if (sweepInterval) return;
    sweepInterval = setInterval(barrerActivacionesVencidas, SWEEP_ACTIVACION_MS);
    setImmediate(barrerActivacionesVencidas);
    logger.info('Barrido T−20 de reservas iniciado', { cadaMs: SWEEP_ACTIVACION_MS });
};

/**
 * Obtener estadisticas del servicio de timeouts
 * @returns {Object} Estadisticas
 */
const obtenerEstadisticas = () => {
    return {
        timeoutsActivos: reservaTimeouts.size,
        reservaIds: Array.from(reservaTimeouts.keys())
    };
};

/**
 * Limpiar todos los timeouts (para cierre graceful)
 */
const limpiarTodos = () => {
    logger.info('Limpiando todos los timeouts de reservas...');

    for (const [reservaId, timeouts] of reservaTimeouts) {
        if (timeouts.timeoutExpiracion) {
            clearTimeout(timeouts.timeoutExpiracion);
        }
        if (timeouts.timeoutAlerta) {
            clearTimeout(timeouts.timeoutAlerta);
        }
        if (timeouts.timeoutActivacion) {
            clearTimeout(timeouts.timeoutActivacion);
        }
        if (timeouts.timeoutAlertaActivacion) {
            clearTimeout(timeouts.timeoutAlertaActivacion);
        }
        if (timeouts.timeoutBloqueoMesa) {
            clearTimeout(timeouts.timeoutBloqueoMesa);
        }
    }

    reservaTimeouts.clear();
    if (sweepInterval) {
        clearInterval(sweepInterval);
        sweepInterval = null;
    }
    logger.info('Todos los timeouts limpiados');
};

module.exports = {
    configurarSocketNamespace,
    calcularFechaExpiracion,
    programarExpiracion,
    programarActivacion,
    programarBloqueoMesa,
    cancelarTimeout,
    cancelarActivacion,
    rehidratarTimeouts,
    obtenerEstadisticas,
    limpiarTodos
};
