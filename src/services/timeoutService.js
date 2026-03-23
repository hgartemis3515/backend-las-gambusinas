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

const getReservaRepository = () => {
    if (!reservaRepository) {
        reservaRepository = require('../repository/reserva.repository');
    }
    return reservaRepository;
};

// Mapa de timeouts activos: reservaId -> { timeoutExpiracion, timeoutAlerta }
const reservaTimeouts = new Map();

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
        
        if (reserva && reserva.estado === 'pendiente') {
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

/**
 * Programar timeout para expiracion de reserva
 * @param {String} reservaId - ID de la reserva
 * @param {Date} fechaReserva - Fecha y hora de la reserva
 * @param {Number} tiempoEspera - Tiempo de espera en minutos
 * @returns {Object} Info de los timeouts programados
 */
const programarExpiracion = (reservaId, fechaReserva, tiempoEspera) => {
    try {
        // Cancelar timeout existente si hay
        cancelarTimeout(reservaId);
        
        const fechaExpiracion = calcularFechaExpiracion(fechaReserva, tiempoEspera);
        const delayExpiracion = calcularDelay(fechaExpiracion);
        
        // Fecha de alerta (5 minutos antes de expirar)
        const fechaAlerta = moment(fechaExpiracion).subtract(MINUTOS_ALERTA_EXPIRACION, 'minutes').toDate();
        const delayAlerta = calcularDelay(fechaAlerta);
        
        const timeouts = { timeoutExpiracion: null, timeoutAlerta: null };
        
        // Programar alerta si aun no ha pasado
        if (delayAlerta > 0 && delayAlerta < delayExpiracion) {
            timeouts.timeoutAlerta = setTimeout(() => {
                manejarAlertaProxima(reservaId);
            }, delayAlerta);
            
            logger.debug('Alerta de expiracion programada', { 
                reservaId, 
                fechaAlerta: fechaAlerta.toISOString(),
                delayMs: delayAlerta 
            });
        }
        
        // Programar expiracion
        if (delayExpiracion > 0) {
            timeouts.timeoutExpiracion = setTimeout(() => {
                manejarExpiracion(reservaId);
            }, delayExpiracion);
            
            logger.info('Timeout de expiracion programado', { 
                reservaId, 
                fechaExpiracion: fechaExpiracion.toISOString(),
                delayMs: delayExpiracion,
                delayMinutos: Math.round(delayExpiracion / 60000)
            });
        } else {
            // La reserva ya expiro, procesar inmediatamente
            logger.warn('Reserva ya expirada, procesando inmediatamente', { reservaId });
            setImmediate(() => manejarExpiracion(reservaId));
        }
        
        // Guardar en mapa
        reservaTimeouts.set(reservaId.toString(), timeouts);
        
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
        reservaTimeouts.delete(id);
        logger.debug('Timeouts cancelados', { reservaId: id });
    }
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
        errores: 0
    };
    
    try {
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
                    // Reprogramar el timeout
                    programarExpiracion(
                        reserva._id,
                        reserva.fechaReserva,
                        reserva.tiempoEspera
                    );
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
        
        return resultado;
        
    } catch (error) {
        logger.error('Error en rehidratacion de timeouts', { error: error.message });
        resultado.error = error.message;
        return resultado;
    }
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
    }
    
    reservaTimeouts.clear();
    logger.info('Todos los timeouts limpiados');
};

module.exports = {
    configurarSocketNamespace,
    calcularFechaExpiracion,
    programarExpiracion,
    cancelarTimeout,
    rehidratarTimeouts,
    obtenerEstadisticas,
    limpiarTodos
};
