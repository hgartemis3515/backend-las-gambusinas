const Reserva = require('../database/models/reserva.model');
const mesasModel = require('../database/models/mesas.model');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// ========== FUNCIONES CRUD BASICAS ==========

/**
 * Crear una nueva reserva
 * @param {Object} data - Datos de la reserva
 * @returns {Object} Reserva creada
 */
const crearReserva = async (data) => {
    try {
        logger.info('Iniciando creación de reserva', { mesa: data.mesa, fechaReserva: data.fechaReserva });
        
        // 1. Verificar que la mesa existe y esta libre
        const mesa = await mesasModel.findById(data.mesa);
        if (!mesa) {
            logger.warn('Mesa no encontrada', { mesaId: data.mesa });
            throw new Error('Mesa no encontrada');
        }
        
        logger.debug('Mesa encontrada', { mesaId: mesa._id, estado: mesa.estado });
        
        if (mesa.estado !== 'libre') {
            throw new Error(`La mesa no esta disponible. Estado actual: ${mesa.estado}`);
        }
        
        // 2. Verificar que no haya otra reserva activa para la misma mesa en el mismo horario
        const reservaExistente = await Reserva.findOne({
            mesa: data.mesa,
            estado: { $in: ['pendiente', 'activa'] },
            fechaReserva: {
                $gte: moment(data.fechaReserva).subtract(2, 'hours').toDate(),
                $lte: moment(data.fechaReserva).add(2, 'hours').toDate()
            }
        });
        
        if (reservaExistente) {
            throw new Error('Ya existe una reserva activa para esta mesa en un horario cercano');
        }
        
        // 3. Crear la reserva
        logger.debug('Creando reserva en BD', { data });
        const nuevaReserva = await Reserva.create(data);
        logger.info('Reserva creada en BD', { reservaId: nuevaReserva._id });
        
        // 4. Cambiar estado de la mesa a 'reservado'
        mesa.estado = 'reservado';
        await mesa.save();
        logger.debug('Mesa actualizada a reservado', { mesaId: mesa._id });
        
        logger.info('Reserva creada exitosamente', {
            reservaId: nuevaReserva._id,
            mesaId: data.mesa,
            fechaReserva: data.fechaReserva
        });
        
        // Retornar con populate
        return await obtenerReservaPorId(nuevaReserva._id);
        
    } catch (error) {
        logger.error('Error al crear reserva', { error: error.message, stack: error.stack, data });
        throw error;
    }
};

/**
 * Listar reservas con filtros opcionales
 * @param {Object} filtros - Filtros: estado, fechaDesde, fechaHasta, mesa, mozo
 * @returns {Array} Lista de reservas
 */
const listarReservas = async (filtros = {}) => {
    try {
        const query = {};
        
        // Filtro por estado
        if (filtros.estado) {
            query.estado = filtros.estado;
        }
        
        // Filtro por mesa
        if (filtros.mesa) {
            query.mesa = mongoose.Types.ObjectId.isValid(filtros.mesa) 
                ? new mongoose.Types.ObjectId(filtros.mesa)
                : filtros.mesa;
        }
        
        // Filtro por mozo
        if (filtros.mozo) {
            query.mozo = mongoose.Types.ObjectId.isValid(filtros.mozo)
                ? new mongoose.Types.ObjectId(filtros.mozo)
                : filtros.mozo;
        }
        
        // Filtro por rango de fechas
        if (filtros.fechaDesde || filtros.fechaHasta) {
            query.fechaReserva = {};
            if (filtros.fechaDesde) {
                query.fechaReserva.$gte = moment(filtros.fechaDesde).startOf('day').toDate();
            }
            if (filtros.fechaHasta) {
                query.fechaReserva.$lte = moment(filtros.fechaHasta).endOf('day').toDate();
            }
        }
        
        const reservas = await Reserva.find(query)
            .populate('mesa', 'nummesa estado area')
            .populate('mozo', 'name rol')
            .populate('platos.plato', 'nombre precio categoria')
            .populate('creadoPor', 'name')
            .sort({ fechaReserva: 1 })
            .lean();
        
        return reservas;
        
    } catch (error) {
        logger.error('Error al listar reservas', { error: error.message, filtros });
        throw error;
    }
};

/**
 * Obtener reserva por ID
 * @param {String} id - ID de la reserva
 * @returns {Object} Reserva encontrada
 */
const obtenerReservaPorId = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error('ID de reserva invalido');
        }
        
        const reserva = await Reserva.findById(id)
            .populate({
                path: 'mesa',
                select: 'nummesa estado area',
                populate: { path: 'area', select: 'nombre' }
            })
            .populate('mozo', 'name rol')
            .populate('platos.plato', 'nombre precio categoria')
            .populate('comandaGenerada', 'comandaNumber status')
            .populate('creadoPor', 'name')
            .lean();
        
        if (!reserva) {
            throw new Error('Reserva no encontrada');
        }
        
        return reserva;
        
    } catch (error) {
        logger.error('Error al obtener reserva', { error: error.message, id });
        throw error;
    }
};

/**
 * Actualizar reserva
 * @param {String} id - ID de la reserva
 * @param {Object} data - Datos a actualizar
 * @returns {Object} Reserva actualizada
 */
const actualizarReserva = async (id, data) => {
    try {
        const reserva = await Reserva.findById(id);
        
        if (!reserva) {
            throw new Error('Reserva no encontrada');
        }
        
        // No permitir modificar reservas completadas o rechazadas
        if (['completada', 'rechazada'].includes(reserva.estado)) {
            throw new Error(`No se puede modificar una reserva en estado ${reserva.estado}`);
        }
        
        // Campos actualizables
        const camposActualizables = [
            'clienteNombre', 'clienteTelefono', 'numPersonas', 
            'fechaReserva', 'tiempoEspera', 'platos', 
            'metodoPago', 'notas', 'mozo', 'estado'
        ];
        
        camposActualizables.forEach(campo => {
            if (data[campo] !== undefined) {
                reserva[campo] = data[campo];
            }
        });
        
        await reserva.save();
        
        logger.info('Reserva actualizada', { reservaId: id, cambios: Object.keys(data) });
        
        return await obtenerReservaPorId(id);
        
    } catch (error) {
        logger.error('Error al actualizar reserva', { error: error.message, id, data });
        throw error;
    }
};

/**
 * Cancelar reserva
 * @param {String} id - ID de la reserva
 * @param {String} motivo - Motivo de cancelacion (opcional)
 * @returns {Object} Resultado de la operacion
 */
const cancelarReserva = async (id, motivo = null) => {
    try {
        const reserva = await Reserva.findById(id);
        
        if (!reserva) {
            throw new Error('Reserva no encontrada');
        }
        
        if (reserva.estado === 'completada') {
            throw new Error('No se puede cancelar una reserva completada');
        }
        
        // Cambiar estado de la reserva
        reserva.estado = 'cancelada';
        if (motivo) {
            reserva.notas = (reserva.notas || '') + ` [CANCELADA: ${motivo}]`;
        }
        await reserva.save();
        
        // Liberar la mesa
        await mesasModel.findByIdAndUpdate(
            reserva.mesa,
            { estado: 'libre' }
        );
        
        logger.info('Reserva cancelada', { reservaId: id, motivo });
        
        return { success: true, message: 'Reserva cancelada exitosamente' };
        
    } catch (error) {
        logger.error('Error al cancelar reserva', { error: error.message, id });
        throw error;
    }
};

// ========== FUNCIONES ESPECIFICAS ==========

/**
 * Obtener reserva activa por mesa
 * @param {String} mesaId - ID de la mesa
 * @returns {Object|null} Reserva activa o null
 */
const obtenerReservaActivaPorMesa = async (mesaId) => {
    try {
        const reserva = await Reserva.findOne({
            mesa: mesaId,
            estado: { $in: ['pendiente', 'activa'] }
        })
        .populate('mozo', 'name _id')
        .lean();
        
        return reserva;
        
    } catch (error) {
        logger.error('Error al obtener reserva activa por mesa', { error: error.message, mesaId });
        throw error;
    }
};

/**
 * Marcar reserva como activa (cuando el mozo autorizado crea comanda)
 * @param {String} id - ID de la reserva
 * @param {String} comandaId - ID de la comanda generada
 * @returns {Object} Reserva actualizada
 */
const marcarReservaComoActiva = async (id, comandaId = null) => {
    try {
        const reserva = await Reserva.findById(id);
        
        if (!reserva) {
            throw new Error('Reserva no encontrada');
        }
        
        if (reserva.estado !== 'pendiente') {
            throw new Error(`La reserva no esta en estado pendiente (estado actual: ${reserva.estado})`);
        }
        
        reserva.estado = 'activa';
        if (comandaId) {
            reserva.comandaGenerada = comandaId;
        }
        
        await reserva.save();
        
        logger.info('Reserva marcada como activa', { reservaId: id, comandaId });
        
        return await obtenerReservaPorId(id);
        
    } catch (error) {
        logger.error('Error al marcar reserva como activa', { error: error.message, id });
        throw error;
    }
};

/**
 * Marcar reserva como completada
 * @param {String} id - ID de la reserva
 * @returns {Object} Reserva actualizada
 */
const marcarReservaComoCompletada = async (id) => {
    try {
        const reserva = await Reserva.findByIdAndUpdate(
            id,
            { estado: 'completada' },
            { new: true }
        );
        
        if (!reserva) {
            throw new Error('Reserva no encontrada');
        }
        
        logger.info('Reserva marcada como completada', { reservaId: id });
        
        return reserva;
        
    } catch (error) {
        logger.error('Error al marcar reserva como completada', { error: error.message, id });
        throw error;
    }
};

/**
 * Marcar reserva como rechazada (por expiracion)
 * @param {String} id - ID de la reserva
 * @returns {Object} Resultado de la operacion
 */
const marcarReservaComoRechazada = async (id) => {
    try {
        const reserva = await Reserva.findById(id);
        
        if (!reserva) {
            throw new Error('Reserva no encontrada');
        }
        
        // Cambiar estado de la reserva
        reserva.estado = 'rechazada';
        reserva.notas = (reserva.notas || '') + ' [RECHAZADA: Expiro tiempo de espera]';
        await reserva.save();
        
        // Liberar la mesa
        await mesasModel.findByIdAndUpdate(
            reserva.mesa,
            { estado: 'libre' }
        );
        
        logger.info('Reserva rechazada por expiracion', { reservaId: id });
        
        return { success: true, message: 'Reserva rechazada exitosamente' };
        
    } catch (error) {
        logger.error('Error al marcar reserva como rechazada', { error: error.message, id });
        throw error;
    }
};

/**
 * Obtener reservas pendientes que necesitan rehidratacion de timeouts
 * @returns {Array} Lista de reservas pendientes
 */
const obtenerReservasPendientesExpiracion = async () => {
    try {
        const ahora = moment().tz('America/Lima').toDate();
        
        const reservas = await Reserva.find({
            estado: 'pendiente'
        })
        .populate('mesa', 'nummesa estado')
        .populate('mozo', 'name _id')
        .lean();
        
        // Filtrar las que aun no han expirado
        return reservas.map(r => {
            const fechaExpiracion = moment(r.fechaReserva)
                .add(r.tiempoEspera, 'minutes')
                .toDate();
            return {
                ...r,
                fechaExpiracion,
                yaExpiro: fechaExpiracion <= ahora
            };
        });
        
    } catch (error) {
        logger.error('Error al obtener reservas pendientes', { error: error.message });
        throw error;
    }
};

/**
 * Obtener reservas proximas a expirar (para alertas)
 * @param {Number} minutosAntes - Minutos antes de la expiracion
 * @returns {Array} Lista de reservas proximas a expirar
 */
const obtenerReservasProximasAExpirar = async (minutosAntes = 5) => {
    try {
        const ahora = moment().tz('America/Lima');
        
        const reservas = await Reserva.find({
            estado: 'pendiente'
        })
        .populate('mesa', 'nummesa')
        .populate('mozo', 'name _id')
        .lean();
        
        return reservas.filter(r => {
            const fechaExpiracion = moment(r.fechaReserva).add(r.tiempoEspera, 'minutes');
            const minutosRestantes = fechaExpiracion.diff(ahora, 'minutes');
            return minutosRestantes > 0 && minutosRestantes <= minutosAntes;
        });
        
    } catch (error) {
        logger.error('Error al obtener reservas proximas a expirar', { error: error.message });
        throw error;
    }
};

/**
 * Obtener mesas disponibles para reservar
 * @returns {Array} Lista de mesas con estado 'libre'
 */
const obtenerMesasDisponibles = async () => {
    try {
        const mesas = await mesasModel.find({ estado: 'libre', isActive: true })
            .populate('area', 'nombre')
            .sort({ nummesa: 1 })
            .lean();
        
        return mesas;
        
    } catch (error) {
        logger.error('Error al obtener mesas disponibles', { error: error.message });
        throw error;
    }
};

module.exports = {
    // CRUD basico
    crearReserva,
    listarReservas,
    obtenerReservaPorId,
    actualizarReserva,
    cancelarReserva,
    
    // Funciones especificas
    obtenerReservaActivaPorMesa,
    marcarReservaComoActiva,
    marcarReservaComoCompletada,
    marcarReservaComoRechazada,
    obtenerReservasPendientesExpiracion,
    obtenerReservasProximasAExpirar,
    obtenerMesasDisponibles
};
