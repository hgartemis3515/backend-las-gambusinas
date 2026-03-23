const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');

const reservaRepository = require('../repository/reserva.repository');
const timeoutService = require('../services/timeoutService');

// ==================== ENDPOINTS CRUD ====================

/**
 * GET /api/reservas
 * Listar reservas con filtros opcionales
 * Query params: estado, fechaDesde, fechaHasta, mesa, mozo
 */
router.get('/reservas', async (req, res) => {
    try {
        const filtros = {
            estado: req.query.estado || null,
            fechaDesde: req.query.fechaDesde || null,
            fechaHasta: req.query.fechaHasta || null,
            mesa: req.query.mesa || null,
            mozo: req.query.mozo || null
        };
        
        const reservas = await reservaRepository.listarReservas(filtros);
        
        // Agregar campos calculados para cada reserva
        const reservasConCalculos = reservas.map(r => {
            const fechaExpiracion = moment(r.fechaReserva).add(r.tiempoEspera, 'minutes');
            const ahora = moment();
            const msRestantes = Math.max(0, fechaExpiracion.diff(ahora));
            
            return {
                ...r,
                fechaExpiracion: fechaExpiracion.toISOString(),
                msRestantes,
                minutosRestantes: Math.round(msRestantes / 60000),
                haExpirado: msRestantes === 0 && r.estado === 'pendiente'
            };
        });
        
        res.json(reservasConCalculos);
        
    } catch (error) {
        logger.error('Error al listar reservas', { error: error.message, query: req.query });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/reservas/mesas-disponibles
 * Obtener lista de mesas disponibles para reservar
 */
router.get('/reservas/mesas-disponibles', async (req, res) => {
    try {
        const mesas = await reservaRepository.obtenerMesasDisponibles();
        res.json(mesas);
        
    } catch (error) {
        logger.error('Error al obtener mesas disponibles', { error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/reservas/proximas-a-expirar
 * Obtener reservas proximas a expirar (para alertas)
 */
router.get('/reservas/proximas-a-expirar', async (req, res) => {
    try {
        const minutos = parseInt(req.query.minutos) || 5;
        const reservas = await reservaRepository.obtenerReservasProximasAExpirar(minutos);
        res.json(reservas);
        
    } catch (error) {
        logger.error('Error al obtener reservas proximas a expirar', { error: error.message });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/reservas/:id
 * Obtener reserva por ID
 */
router.get('/reservas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de reserva invalido' });
        }
        
        const reserva = await reservaRepository.obtenerReservaPorId(id);
        
        if (!reserva) {
            return res.status(404).json({ error: 'Reserva no encontrada' });
        }
        
        // Agregar campos calculados
        const fechaExpiracion = moment(reserva.fechaReserva).add(reserva.tiempoEspera, 'minutes');
        const msRestantes = Math.max(0, fechaExpiracion.diff(moment()));
        
        res.json({
            ...reserva,
            fechaExpiracion: fechaExpiracion.toISOString(),
            msRestantes,
            minutosRestantes: Math.round(msRestantes / 60000)
        });
        
    } catch (error) {
        logger.error('Error al obtener reserva', { error: error.message, id: req.params.id });
        handleError(error, res, logger);
    }
});

/**
 * GET /api/reservas/mesa/:mesaId/activa
 * Obtener reserva activa por mesa (para validacion de mozo autorizado)
 */
router.get('/reservas/mesa/:mesaId/activa', async (req, res) => {
    try {
        const { mesaId } = req.params;
        
        const reserva = await reservaRepository.obtenerReservaActivaPorMesa(mesaId);
        
        if (!reserva) {
            return res.json({ tieneReservaActiva: false });
        }
        
        res.json({
            tieneReservaActiva: true,
            reserva
        });
        
    } catch (error) {
        logger.error('Error al obtener reserva activa por mesa', { 
            error: error.message, 
            mesaId: req.params.mesaId 
        });
        handleError(error, res, logger);
    }
});

/**
 * POST /api/reservas
 * Crear nueva reserva
 */
router.post('/reservas', async (req, res) => {
    try {
        const { 
            mesa, 
            mozo, 
            clienteNombre, 
            clienteTelefono, 
            numPersonas, 
            fechaReserva, 
            tiempoEspera, 
            platos, 
            metodoPago, 
            notas 
        } = req.body;
        
        // Validaciones
        if (!mesa) {
            return res.status(400).json({ error: 'La mesa es obligatoria' });
        }
        
        if (!numPersonas || numPersonas < 1) {
            return res.status(400).json({ error: 'El numero de personas debe ser al menos 1' });
        }
        
        if (!fechaReserva) {
            return res.status(400).json({ error: 'La fecha y hora de reserva es obligatoria' });
        }
        
        // Validar que la fecha sea futura (usando zona horaria de Lima)
        const fechaReservaMoment = moment.tz(fechaReserva, 'America/Lima');
        const ahora = moment().tz('America/Lima');
        if (fechaReservaMoment.isBefore(ahora)) {
            return res.status(400).json({ 
                error: 'La fecha de reserva debe ser futura',
                fechaEnviada: fechaReservaMoment.format('YYYY-MM-DD HH:mm'),
                fechaActual: ahora.format('YYYY-MM-DD HH:mm')
            });
        }
        
        // Preparar datos de la reserva
        const creadoPorValue = req.body.creadoPor || req.headers['x-user-id'] || null;
        
        // Validar y filtrar platos con ObjectId válidos
        const platosValidados = (platos || [])
            .filter(p => p.plato && mongoose.Types.ObjectId.isValid(p.plato))
            .map(p => ({
                plato: new mongoose.Types.ObjectId(p.plato),
                cantidad: parseInt(p.cantidad) || 1
            }));
        
        const dataReserva = {
            mesa: mongoose.Types.ObjectId.isValid(mesa) ? new mongoose.Types.ObjectId(mesa) : mesa,
            mozo: mozo && mongoose.Types.ObjectId.isValid(mozo) ? new mongoose.Types.ObjectId(mozo) : null,
            clienteNombre,
            clienteTelefono,
            numPersonas: parseInt(numPersonas),
            fechaReserva: fechaReservaMoment.toDate(),
            tiempoEspera: parseInt(tiempoEspera) || 10,
            platos: platosValidados,
            metodoPago,
            notas,
            creadoPor: creadoPorValue && mongoose.Types.ObjectId.isValid(creadoPorValue) 
                ? new mongoose.Types.ObjectId(creadoPorValue) 
                : null
        };
        
        // Crear reserva
        const nuevaReserva = await reservaRepository.crearReserva(dataReserva);
        
        // Programar timeout de expiracion
        timeoutService.programarExpiracion(
            nuevaReserva._id,
            nuevaReserva.fechaReserva,
            nuevaReserva.tiempoEspera
        );
        
        // Emitir evento Socket.io de mesa actualizada
        if (global.emitMesaActualizada) {
            await global.emitMesaActualizada(nuevaReserva.mesa._id || nuevaReserva.mesa);
        }
        
        // Emitir evento de nueva reserva al namespace admin
        if (global.io && global.io.of) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace && adminNamespace.sockets && adminNamespace.sockets.size > 0) {
                adminNamespace.emit('reserva-creada', {
                    reserva: nuevaReserva,
                    timestamp: moment().tz('America/Lima').toISOString()
                });
            }
        }
        
        logger.info('Reserva creada exitosamente', { 
            reservaId: nuevaReserva._id,
            mesaId: dataReserva.mesa,
            fechaReserva: dataReserva.fechaReserva
        });
        
        res.status(201).json(nuevaReserva);
        
    } catch (error) {
        logger.error('Error al crear reserva', { error: error.message, body: req.body, stack: error.stack });
        
        // Errores de validación de Mongoose
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ error: messages.join(', ') });
        }
        
        // Errores personalizados
        if (error.message.includes('no esta disponible') || error.message.includes('Ya existe') || error.message.includes('no encontrada')) {
            return res.status(400).json({ error: error.message });
        }
        
        // Error de cast (ObjectId inválido)
        if (error.name === 'CastError') {
            return res.status(400).json({ error: `Valor inválido para el campo ${error.path}: ${error.value}` });
        }
        
        // Error genérico - incluir más detalles en desarrollo
        const errorMessage = process.env.NODE_ENV === 'development' 
            ? `Error interno: ${error.message}` 
            : 'Error interno al crear la reserva';
        res.status(500).json({ error: errorMessage });
    }
});

/**
 * PUT /api/reservas/:id
 * Actualizar reserva existente
 */
router.put('/reservas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de reserva invalido' });
        }
        
        // Si se actualiza la fecha o tiempo de espera, reprogramar timeout
        const { fechaReserva, tiempoEspera } = req.body;
        
        const reservaActualizada = await reservaRepository.actualizarReserva(id, req.body);
        
        // Reprogramar timeout si cambio la fecha o tiempo
        if (fechaReserva || tiempoEspera) {
            timeoutService.programarExpiracion(
                id,
                reservaActualizada.fechaReserva,
                reservaActualizada.tiempoEspera
            );
        }
        
        // Emitir evento de reserva actualizada
        if (global.io && global.io.of) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('reserva-actualizada', {
                    reservaId: id,
                    reserva: reservaActualizada,
                    timestamp: moment().tz('America/Lima').toISOString()
                });
            }
        }
        
        logger.info('Reserva actualizada', { reservaId: id });
        
        res.json(reservaActualizada);
        
    } catch (error) {
        logger.error('Error al actualizar reserva', { 
            error: error.message, 
            id: req.params.id, 
            body: req.body 
        });
        
        if (error.message.includes('No se puede modificar')) {
            return res.status(400).json({ error: error.message });
        }
        
        handleError(error, res, logger);
    }
});

/**
 * DELETE /api/reservas/:id
 * Cancelar reserva
 */
router.delete('/reservas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de reserva invalido' });
        }
        
        // Obtener reserva antes de cancelar para saber la mesa
        const reserva = await reservaRepository.obtenerReservaPorId(id);
        
        if (!reserva) {
            return res.status(404).json({ error: 'Reserva no encontrada' });
        }
        
        // Cancelar timeout
        timeoutService.cancelarTimeout(id);
        
        // Cancelar reserva
        const resultado = await reservaRepository.cancelarReserva(id, motivo);
        
        // Emitir evento de mesa actualizada
        if (global.emitMesaActualizada && reserva.mesa) {
            await global.emitMesaActualizada(reserva.mesa._id || reserva.mesa);
        }
        
        // Emitir evento de reserva cancelada
        if (global.io && global.io.of) {
            const adminNamespace = global.io.of('/admin');
            if (adminNamespace) {
                adminNamespace.emit('reserva-cancelada', {
                    reservaId: id,
                    motivo,
                    timestamp: moment().tz('America/Lima').toISOString()
                });
            }
        }
        
        logger.info('Reserva cancelada', { reservaId: id, motivo });
        
        res.json(resultado);
        
    } catch (error) {
        logger.error('Error al cancelar reserva', { error: error.message, id: req.params.id });
        handleError(error, res, logger);
    }
});

/**
 * POST /api/reservas/:id/activar
 * Marcar reserva como activa (cuando el mozo autorizado inicia atencion)
 */
router.post('/reservas/:id/activar', async (req, res) => {
    try {
        const { id } = req.params;
        const { comandaId } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de reserva invalido' });
        }
        
        // Cancelar timeout
        timeoutService.cancelarTimeout(id);
        
        // Marcar como activa
        const reserva = await reservaRepository.marcarReservaComoActiva(id, comandaId);
        
        logger.info('Reserva marcada como activa', { reservaId: id, comandaId });
        
        res.json(reserva);
        
    } catch (error) {
        logger.error('Error al activar reserva', { error: error.message, id: req.params.id });
        handleError(error, res, logger);
    }
});

/**
 * POST /api/reservas/:id/completar
 * Marcar reserva como completada
 */
router.post('/reservas/:id/completar', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de reserva invalido' });
        }
        
        const reserva = await reservaRepository.marcarReservaComoCompletada(id);
        
        logger.info('Reserva marcada como completada', { reservaId: id });
        
        res.json(reserva);
        
    } catch (error) {
        logger.error('Error al completar reserva', { error: error.message, id: req.params.id });
        handleError(error, res, logger);
    }
});

module.exports = router;
