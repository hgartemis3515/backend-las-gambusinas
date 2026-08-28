const Reserva = require('../database/models/reserva.model');
const mesasModel = require('../database/models/mesas.model');
const moment = require('moment-timezone');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const {
    enriquecerComplementosConPrecio,
    calcularPrecioUnitarioConComplementos,
    calcularResumenComplementos
} = require('../utils/precioComplementos');

// PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1: modelos diferidos para crear comanda programada
let ComandaModel = null;
let PlatoModel = null;
let TicketPagoAdelantadoModel = null;
let configuracionSistemaModel = null;

const getComandaModel = () => {
    if (!ComandaModel) ComandaModel = require('../database/models/comanda.model');
    return ComandaModel;
};
const getPlatoModel = () => {
    if (!PlatoModel) PlatoModel = require('../database/models/plato.model');
    return PlatoModel;
};
const getTicketPagoAdelantadoModel = () => {
    if (!TicketPagoAdelantadoModel) TicketPagoAdelantadoModel = require('../database/models/ticketPagoAdelantado.model');
    return TicketPagoAdelantadoModel;
};
const getConfiguracionSistemaModel = () => {
    if (!configuracionSistemaModel) configuracionSistemaModel = require('../database/models/configuracionSistema.model');
    return configuracionSistemaModel;
};

// Helper: leer config de reservas (con defaults seguros si no hay singleton)
const leerConfigReservas = async () => {
    try {
        const cfg = await getConfiguracionSistemaModel().findById('configuracion_unica').lean();
        return cfg?.reservas || {
            permitirReservas: true,
            permitirCrearDesdeMozos: true,
            minutosAntesCocina: 20,
            minutosAlertaPreviaCocina: 10,
            tiempoEsperaDefaultMin: 10,
            bloquearMesaAlCrear: false,
            minutosBloqueoMesaAntes: 45,
            horizonteReservaDias: 14,
            ventanaConflictoMinutos: 120,
            reservasDesdeMozosV2: true
        };
    } catch (e) {
        logger.warn('No se pudo leer config de reservas; usando defaults', { error: e.message });
        return {
            permitirReservas: true,
            permitirCrearDesdeMozos: true,
            minutosAntesCocina: 20,
            minutosAlertaPreviaCocina: 10,
            tiempoEsperaDefaultMin: 10,
            bloquearMesaAlCrear: false,
            minutosBloqueoMesaAntes: 45,
            horizonteReservaDias: 14,
            ventanaConflictoMinutos: 120,
            reservasDesdeMozosV2: true
        };
    }
};

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
            estado: { $in: ['pendiente_aprobar', 'pendiente', 'activa'] },
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
        
        if (filtros.estado) {
            const estados = String(filtros.estado).split(',').map((s) => s.trim()).filter(Boolean);
            query.estado = estados.length > 1 ? { $in: estados } : estados[0];
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

        return cancelarReservasSinComandaViva(reservas);
        
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

/**
 * Al eliminar la comanda de una reserva (dashboard o mozos), cancelar el
 * documento Reserva. Si no, la mesa queda "libre" pero mesas-disponibles-para
 * sigue ocultándola por colisión ±2h.
 */
const cancelarReservaPorComandaEliminada = async (comanda, motivo = null) => {
    if (!comanda) return null;
    const comandaId = comanda._id;
    let reserva = null;
    if (comanda.origenReserva && mongoose.Types.ObjectId.isValid(comanda.origenReserva)) {
        reserva = await Reserva.findById(comanda.origenReserva);
    }
    if (!reserva && comandaId) {
        reserva = await Reserva.findOne({
            comandaGenerada: comandaId,
            estado: { $in: ['pendiente_aprobar', 'pendiente', 'activa'] }
        });
    }
    if (!reserva) return null;
    if (['completada', 'cancelada', 'rechazada'].includes(reserva.estado)) return null;

    reserva.estado = 'cancelada';
    const nota = String(motivo || '').trim();
    reserva.notas = `${reserva.notas || ''} [CANCELADA: comanda eliminada${nota ? ` — ${nota}` : ''}]`.trim();
    await reserva.save();

    try {
        require('../services/timeoutService').cancelarTimeout(reserva._id);
    } catch (e) {
        logger.warn('No se pudieron cancelar jobs de reserva', { reservaId: reserva._id, error: e.message });
    }

    logger.info('Reserva cancelada al eliminar comanda', {
        reservaId: reserva._id,
        comandaId,
        mesaId: reserva.mesa
    });
    return reserva;
};

// ========== FUNCIONES ESPECIFICAS ==========

/**
 * Obtener reserva activa por mesa
 * @param {String} mesaId - ID de la mesa
 * @returns {Object|null} Reserva activa o null
 */
const obtenerReservaActivaPorMesa = async (mesaId) => {
    try {
        let reserva = await Reserva.findOne({
            mesa: mesaId,
            estado: { $in: ['pendiente_aprobar', 'pendiente', 'activa'] }
        })
        .populate('mozo', 'name _id')
        .lean();

        if (reserva) {
            const vigentes = await cancelarReservasSinComandaViva([reserva]);
            reserva = vigentes[0] || null;
        }

        if (reserva) {
            logger.info('Reserva activa encontrada', {
                reservaId: reserva._id,
                mesaId: mesaId,
                estado: reserva.estado,
                mozo: reserva.mozo ? {
                    _id: reserva.mozo._id,
                    name: reserva.mozo.name
                } : null
            });
        } else {
            logger.info('No se encontró reserva activa', { mesaId });
        }
        
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
            estado: { $in: ['pendiente', 'pendiente_aprobar'] }
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
            estado: { $in: ['pendiente', 'pendiente_aprobar'] }
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

// ==========================================================================
// PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1 — Reservas desde App Mozos
// ==========================================================================

const calcularTotalesPlato = (platoDoc, item) => {
    const precioBase = Number(platoDoc.precio) || 0;
    const raw = Array.isArray(item.complementosSeleccionados)
        ? item.complementosSeleccionados
        : Array.isArray(item.complementosElegidos)
            ? item.complementosElegidos
            : [];
    const afectanPrecio = platoDoc.complementosAfectanPrecio !== false;
    const complementosSeleccionados = enriquecerComplementosConPrecio(
        platoDoc.complementos || [],
        raw,
        { afectanPrecio }
    );
    const calc = calcularPrecioUnitarioConComplementos(
        precioBase,
        complementosSeleccionados,
        { afectanPrecio }
    );
    const resumen = calcularResumenComplementos(complementosSeleccionados, { afectanPrecio });
    const cantidad = parseInt(item.cantidad) || 1;
    return {
        precioBase,
        extraComplementos: calc.extraComplementos,
        precioUnitario: calc.precioUnitario,
        totalUnidadesComplementos: resumen.totalUnidades,
        complementosSeleccionados,
        cantidad,
        total: calc.precioUnitario * cantidad
    };
};

/**
 * Parsea la hora de atención en America/Lima.
 * ISO con Z/offset → instante UTC convertido a Lima.
 * Fecha local sin zona → se interpreta como hora de Lima (no la TZ del server).
 */
const parseFechaAtencionLima = (valor) => {
    if (valor == null || valor === '') return moment.invalid();
    if (moment.isMoment(valor)) return valor.clone().tz('America/Lima');
    if (valor instanceof Date) return moment(valor).tz('America/Lima');
    const s = String(valor).trim();
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
        return moment.utc(s).tz('America/Lima');
    }
    const local = moment.tz(s, ['YYYY-MM-DDTHH:mm:ss', 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm'], true, 'America/Lima');
    if (local.isValid()) return local;
    return moment.tz(s, 'America/Lima');
};

/**
 * PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1 — helpers puras (testeables sin DB).
 * Calcula la fecha de cocina (atención − minutosAntes). Si esa fecha ya pasó
 * (reserva muy cercana), retorna la fecha actual → activación inmediata.
 * @param {Date|moment|string} fechaReserva
 * @param {Number} minutosAntes  offset en minutos (default 20)
 * @param {Date|moment} ahora  referencia de "ahora" (inyectable para tests)
 * @returns {{ fechaCocina: moment, activacionInmediata: boolean }}
 */
const calcularFechaCocina = (fechaReserva, minutosAntes = 20, ahora = null) => {
    const offset = Number(minutosAntes) || 20;
    const ref = ahora ? moment(ahora) : moment().tz('America/Lima');
    const atencion = moment(fechaReserva);
    const base = atencion.clone().subtract(offset, 'minutes');
    const activacionInmediata = base.isSameOrBefore(ref);
    const fechaCocina = activacionInmediata ? ref.clone() : base;
    return { fechaCocina, activacionInmediata };
};

/**
 * Determina si una reserva es "inmediata": la atención ocurre antes de que
 * pudiera cumplirse el offset de cocina (atención − ahora <= minutosAntes).
 */
const esReservaInmediata = (fechaReserva, minutosAntes = 20, ahora = null) => {
    const offset = Number(minutosAntes) || 20;
    const ref = ahora ? moment(ahora) : moment().tz('America/Lima');
    const atencion = moment(fechaReserva);
    return atencion.diff(ref, 'minutes', true) <= offset;
};

const ESTADOS_RESERVA_VIGENTE = ['pendiente_aprobar', 'pendiente', 'activa'];

const cancelarReservasSinComandaViva = async (reservas) => {
    if (!Array.isArray(reservas) || reservas.length === 0) return [];
    const conComanda = reservas.filter((r) => r.comandaGenerada);
    if (conComanda.length === 0) return reservas;
    const ids = conComanda.map((r) => r.comandaGenerada);
    const vivas = await getComandaModel().find({
        _id: { $in: ids },
        IsActive: { $ne: false },
        eliminada: { $ne: true },
        status: { $nin: ['cancelado'] }
    }).select('_id').lean();
    const vivaSet = new Set(vivas.map((c) => c._id.toString()));
    const vigentes = [];
    const huerfanas = [];
    for (const r of reservas) {
        if (!r.comandaGenerada || vivaSet.has(r.comandaGenerada.toString())) {
            vigentes.push(r);
        } else {
            huerfanas.push(r);
        }
    }
    if (huerfanas.length > 0) {
        const idsH = huerfanas.map((r) => r._id);
        await Reserva.updateMany(
            { _id: { $in: idsH }, estado: { $in: ESTADOS_RESERVA_VIGENTE } },
            { $set: { estado: 'cancelada', notas: '[CANCELADA: comanda de reserva ya no está activa]' } }
        );
        try {
            const timeoutService = require('../services/timeoutService');
            idsH.forEach((id) => timeoutService.cancelarTimeout(id));
        } catch (e) {
            logger.warn('No se pudieron cancelar jobs de reservas huérfanas', { error: e.message });
        }
        logger.info('Reservas huérfanas canceladas (comanda eliminada)', {
            cantidad: huerfanas.length,
            ids: idsH.map((id) => id.toString())
        });
    }
    return vigentes;
};

const validarColisionReserva = async (mesaId, fechaReserva, ventanaMinutos = 120) => {
    const inicio = moment(fechaReserva).subtract(ventanaMinutos, 'minutes').toDate();
    const fin = moment(fechaReserva).add(ventanaMinutos, 'minutes').toDate();
    const candidatas = await Reserva.find({
        mesa: mesaId,
        estado: { $in: ESTADOS_RESERVA_VIGENTE },
        fechaReserva: { $gte: inicio, $lte: fin }
    }).select('_id mesa comandaGenerada').lean();
    const vigentes = await cancelarReservasSinComandaViva(candidatas);
    if (vigentes.length > 0) throw new Error('Ya existe una reserva activa para esta mesa en un horario cercano');
};

const obtenerMesasDisponiblesParaReserva = async (fechaReserva, ventanaMinutos = 120) => {
    try {
        const inicio = moment(fechaReserva).subtract(ventanaMinutos, 'minutes');
        const fin = moment(fechaReserva).add(ventanaMinutos, 'minutes');
        const mesasLibres = await mesasModel.find({ estado: 'libre', isActive: true })
            .populate('area', 'nombre')
            .sort({ nummesa: 1 })
            .lean();
        const candidatas = await Reserva.find({
            estado: { $in: ESTADOS_RESERVA_VIGENTE },
            fechaReserva: { $gte: inicio.toDate(), $lte: fin.toDate() }
        }).select('_id mesa comandaGenerada').lean();
        const vigentes = await cancelarReservasSinComandaViva(candidatas);
        const reservadasSet = new Set(vigentes.map((r) => r.mesa.toString()));
        return mesasLibres.filter((m) => !reservadasSet.has(m._id.toString()));
    } catch (error) {
        logger.error('Error al obtener mesas disponibles para reserva', { error: error.message });
        throw error;
    }
};

const obtenerReservasProgramadasCocina = async (opts = {}) => {
    try {
        const query = { estado: { $in: ['pendiente', 'pendiente_aprobar'] }, comandaGenerada: { $ne: null } };
        if (opts.cocineroId && mongoose.Types.ObjectId.isValid(opts.cocineroId)) {
            query.cocineroEncargado = new mongoose.Types.ObjectId(opts.cocineroId);
        }
        const reservas = await Reserva.find(query)
            .populate({ path: 'mesa', select: 'nummesa estado area', populate: { path: 'area', select: 'nombre' } })
            .populate('mozo', 'name')
            .populate('cocineroEncargado', 'name alias')
            .populate('platos.plato', 'nombre precio')
            .populate('comandaGenerada', 'comandaNumber status programadaPorReserva fechaCocinaProgramada prioridadOrden')
            .sort({ fechaCocina: 1 })
            .lean();
        return reservas;
    } catch (error) {
        logger.error('Error al obtener reservas programadas para cocina', { error: error.message });
        throw error;
    }
};

const crearReservaDesdeMozos = async (data) => {
    // Sin transacción: Mongo local es standalone (no replica set) y mongoose-sequence
    // (comandaNumber / ticketNumber) no participa en la sesión. Compensamos a mano.
    let reservaCreada = null;
    let comandaCreada = null;
    let ticketCreado = null;
    let mesaIdBloqueada = null;
    try {
        const config = await leerConfigReservas();
        if (!config.permitirReservas) throw new Error('Las reservas están deshabilitadas');
        if (!config.permitirCrearDesdeMozos) throw new Error('Crear reservas desde App Mozos está deshabilitado');
        if (!config.reservasDesdeMozosV2) throw new Error('El flujo de reservas v2 está deshabilitado (feature flag)');

        if (!data.mesa || !mongoose.Types.ObjectId.isValid(data.mesa)) throw new Error('Mesa inválida');
        if (!data.mozo || !mongoose.Types.ObjectId.isValid(data.mozo)) throw new Error('Mozo inválido');
        const clienteNombre = (data.clienteNombre || '').trim();
        if (clienteNombre.length < 2) throw new Error('El nombre del cliente es obligatorio (mínimo 2 caracteres)');
        if (!data.fechaReserva) throw new Error('La hora de atención es obligatoria');

        const fechaAtencion = parseFechaAtencionLima(data.fechaReserva);
        const ahora = moment().tz('America/Lima');
        if (!fechaAtencion.isValid()) throw new Error('Hora de atención inválida');
        if (!fechaAtencion.isAfter(ahora)) throw new Error('La hora de atención debe ser futura');
        const horizonte = Number(config.horizonteReservaDias) || 14;
        if (fechaAtencion.isAfter(ahora.clone().add(horizonte, 'days'))) {
            throw new Error(`La reserva excede el horizonte máximo de ${horizonte} días`);
        }
        if (!Array.isArray(data.platos) || data.platos.length === 0) throw new Error('Debe incluir al menos un plato');

        const mesa = await mesasModel.findById(data.mesa).populate('area', 'nombre').lean();
        if (!mesa) throw new Error('Mesa no encontrada');
        if (mesa.estado !== 'libre' && mesa.estado !== 'reservado') {
            throw new Error(`La mesa no está disponible (estado: ${mesa.estado})`);
        }
        await validarColisionReserva(data.mesa, fechaAtencion.toDate(), Number(config.ventanaConflictoMinutos) || 120);

        const offsetMin = Number(config.minutosAntesCocina) || 20;
        const { fechaCocina: fechaCocinaCalc, activacionInmediata } = calcularFechaCocina(fechaAtencion, offsetMin, ahora);
        const fechaCocina = fechaCocinaCalc;

        const platoIds = data.platos.map((p) => p.plato).filter((id) => id && mongoose.Types.ObjectId.isValid(id));
        if (platoIds.length !== data.platos.length) throw new Error('Uno o más platos no son válidos');
        const platosCatalogo = await getPlatoModel().find({ _id: { $in: platoIds } }).lean();
        const platoMap = new Map(platosCatalogo.map((p) => [p._id.toString(), p]));

        let totalPlatos = 0;
        const platosReserva = [];
        const platosComanda = [];

        data.platos.forEach((item) => {
            const platoDoc = platoMap.get(item.plato.toString());
            if (!platoDoc) throw new Error(`Plato no encontrado: ${item.plato}`);
            const calc = calcularTotalesPlato(platoDoc, item);
            totalPlatos += calc.total;
            const tipoServicio = item.tipoServicio === 'para_llevar' ? 'para_llevar' : 'mesa';
            const notaEspecial = typeof item.notaEspecial === 'string' ? item.notaEspecial : '';
            platosReserva.push({
                plato: platoDoc._id, cantidad: calc.cantidad, tipoServicio,
                complementosSeleccionados: calc.complementosSeleccionados, notaEspecial
            });
            platosComanda.push({
                plato: platoDoc._id, platoId: platoDoc.id || null, estado: 'pendiente', tiempos: {},
                complementosSeleccionados: calc.complementosSeleccionados,
                precioBase: calc.precioBase, extraComplementos: calc.extraComplementos,
                precioUnitario: calc.precioUnitario, totalUnidadesComplementos: calc.totalUnidadesComplementos,
                mostrarResumenComplementos: !!platoDoc.mostrarResumenComplementos,
                resumenComplementosImpresion: platoDoc.resumenComplementosImpresion || undefined,
                notaEspecial, tipoServicio, cantidad: calc.cantidad
            });
        });

        const tiempoEspera = Number(data.tiempoEspera) || config.tiempoEsperaDefaultMin || 10;
        const reserva = await Reserva.create({
            mesa: mesa._id, mozo: data.mozo, clienteNombre,
            clienteTelefono: data.clienteTelefono || null,
            numPersonas: parseInt(data.numPersonas) || 2,
            fechaReserva: fechaAtencion.toDate(), fechaCocina: fechaCocina.toDate(),
            tiempoEspera: [5, 10, 20].includes(tiempoEspera) ? tiempoEspera : 10,
            platos: platosReserva, metodoPago: data.metodoPago || null, notas: data.notas || null,
            creadoPor: data.mozo,
            cocineroEncargado: data.cocineroEncargado && mongoose.Types.ObjectId.isValid(data.cocineroEncargado)
                ? new mongoose.Types.ObjectId(data.cocineroEncargado) : null,
            estado: 'pendiente_aprobar'
        });
        reservaCreada = reserva;

        await mesasModel.updateOne({ _id: mesa._id }, { estado: 'pendiente_aprobar' });
        mesaIdBloqueada = mesa.estado === 'libre' ? mesa._id : null;

        const mozoDoc = await require('../database/models/mozos.model').findById(data.mozo).select('name rol').lean();
        const comandaPayload = {
            mozos: data.mozo, mesas: mesa._id,
            mozoNombre: mozoDoc?.name || null, mesaNumero: mesa.nummesa,
            areaNombre: mesa.area?.nombre || null, clienteNombre,
            platos: platosComanda, cantidades: platosComanda.map((p) => p.cantidad),
            observaciones: data.notas || '', status: 'en_espera', IsActive: true,
            origenCreacion: 'reserva', origenReserva: reserva._id,
            programadaPorReserva: true, fechaCocinaProgramada: fechaCocina.toDate(), prioridadOrden: 0
        };
        const comanda = await getComandaModel().create(comandaPayload);
        comandaCreada = comanda;

        reserva.comandaGenerada = comanda._id;
        await reserva.save();

        const ppa = data.pagoAdelantado || {};
        let montoPagado = Number(ppa.montoPagado) || 0;
        if (montoPagado < 0) montoPagado = 0;
        if (montoPagado > totalPlatos) throw new Error('El monto adelantado no puede superar el total de platos');
        const metodo = ppa.metodoPago || 'efectivo';
        const platosSnapshot = comanda.platos.map((p, i) => {
            const src = platosComanda[i] || {};
            const cat = platoMap.get((p.plato || src.plato).toString());
            const cantidad = Number(comanda.cantidades?.[i] || src.cantidad) || 1;
            const precio = Number(p.precioUnitario != null ? p.precioUnitario : src.precioUnitario) || 0;
            return {
                comandaId: comanda._id, comandaNumber: comanda.comandaNumber, platoLineaId: p._id,
                plato: p.plato, platoId: p.platoId, nombre: cat?.nombre || 'N/A',
                precio, cantidad, subtotal: precio * cantidad,
                tipoServicio: p.tipoServicio || src.tipoServicio || 'mesa',
                complementosSeleccionados: p.complementosSeleccionados || src.complementosSeleccionados || [],
                notaEspecial: p.notaEspecial || src.notaEspecial || '',
                estadoAlPagoAdelantado: 'pendiente'
            };
        });
        const ticketPPA = await getTicketPagoAdelantadoModel().create({
            estado: 'pendiente_aprobacion', comandas: [comanda._id], comandasNumbers: [comanda.comandaNumber],
            mesa: mesa._id, numMesa: mesa.nummesa, mozo: data.mozo, nombreMozo: mozoDoc?.name || 'N/A',
            platos: platosSnapshot, subtotal: totalPlatos, igv: 0, total: totalPlatos,
            montoCobrado: montoPagado,
            metodoPago: ['efectivo', 'digital', 'tarjeta'].includes(metodo) ? metodo : 'efectivo',
            clienteNombre, origen: 'reserva', reserva: reserva._id, createdBy: data.mozo,
            sourceApp: 'mozos',
            observaciones: montoPagado > 0 ? 'Pago adelantado de reserva (seña)' : 'Confirmación de reserva (sin adelanto)'
        });
        ticketCreado = ticketPPA;
        comanda.platos.forEach((p) => {
            p.pagoAdelantado = { requerido: true, ticketId: ticketPPA._id, estadoTicket: 'pendiente_aprobacion', cobrado: false, boucherId: null };
        });
        await comanda.save();
        reserva.pagoAdelantado = {
            activo: true, ticketId: ticketPPA._id, estadoTicket: 'pendiente_aprobacion',
            totalPlatos, montoPagado, montoPendiente: totalPlatos - montoPagado
        };
        await reserva.save();

        logger.info('Reserva desde mozos enviada a aprobación', {
            reservaId: reserva._id, comandaId: comanda._id, mesaId: mesa._id,
            fechaReserva: reserva.fechaReserva, montoPagado, ticketId: ticketPPA._id
        });
        programarJobsReservaConfirmada(reserva, config);
        return { reserva, comanda, ticketPPA, config, activacionInmediata, esperandoAprobacion: true };
    } catch (error) {
        logger.error('Error en crearReservaDesdeMozos', { error: error.message, stack: error.stack });
        try {
            if (ticketCreado?._id) await getTicketPagoAdelantadoModel().deleteOne({ _id: ticketCreado._id });
            if (comandaCreada?._id) await getComandaModel().deleteOne({ _id: comandaCreada._id });
            if (reservaCreada?._id) await Reserva.deleteOne({ _id: reservaCreada._id });
            if (mesaIdBloqueada) await mesasModel.updateOne({ _id: mesaIdBloqueada }, { estado: 'libre' });
        } catch (cleanupErr) {
            logger.error('Error al compensar reserva fallida', { error: cleanupErr.message });
        }
        throw error;
    }
};

const aplicarBloqueoMesaReserva = async (reserva, config) => {
    const ahora = moment().tz('America/Lima');
    const fechaAtencion = moment(reserva.fechaReserva);
    if (config.bloquearMesaAlCrear === true) {
        await mesasModel.updateOne({ _id: reserva.mesa }, { estado: 'reservado' });
        return 'reservado';
    }
    const minutosBloqueo = Number(config.minutosBloqueoMesaAntes) || 45;
    const fechaBloqueo = fechaAtencion.clone().subtract(minutosBloqueo, 'minutes');
    if (fechaBloqueo.isSameOrBefore(ahora)) {
        await mesasModel.updateOne({ _id: reserva.mesa }, { estado: 'reservado' });
        return 'reservado';
    }
    await mesasModel.updateOne({ _id: reserva.mesa }, { estado: 'libre' });
    return 'libre';
};

const programarJobsReservaConfirmada = (reserva, config) => {
    const timeoutService = require('../services/timeoutService');
    try {
        timeoutService.programarActivacion(
            reserva._id,
            reserva.fechaCocina,
            config.minutosAlertaPreviaCocina ?? 10
        );
    } catch (e) {
        logger.error('Error al programar activación de cocina', { error: e.message, reservaId: reserva._id });
    }
    try {
        timeoutService.programarExpiracion(reserva._id, reserva.fechaReserva, reserva.tiempoEspera);
    } catch (e) {
        logger.error('Error al programar expiración de reserva', { error: e.message, reservaId: reserva._id });
    }
    try {
        if (!(config.bloquearMesaAlCrear ?? false) && reserva.fechaReserva) {
            timeoutService.programarBloqueoMesa(
                reserva._id,
                reserva.fechaReserva,
                config.minutosBloqueoMesaAntes ?? 45
            );
        }
    } catch (e) {
        logger.error('Error al programar bloqueo diferido de mesa', { error: e.message, reservaId: reserva._id });
    }
};

const confirmarReservaTrasAprobacionPPA = async (reservaId) => {
    const reserva = await Reserva.findById(reservaId);
    if (!reserva) throw new Error('Reserva no encontrada');
    const config = await leerConfigReservas();
    if (reserva.estado !== 'pendiente_aprobar') {
        return { reserva, config, alreadyConfirmed: true, mesaEstado: null };
    }
    reserva.estado = 'pendiente';
    if (reserva.pagoAdelantado) {
        reserva.pagoAdelantado.estadoTicket = 'aprobado';
        reserva.markModified('pagoAdelantado');
    }
    await reserva.save();
    const mesaEstado = await aplicarBloqueoMesaReserva(reserva, config);
    programarJobsReservaConfirmada(reserva, config);
    if (reserva.comandaGenerada) {
        const comanda = await getComandaModel().findById(reserva.comandaGenerada);
        if (comanda) {
            comanda.platos.forEach((p) => {
                if (p.pagoAdelantado) p.pagoAdelantado.estadoTicket = 'aprobado';
            });
            comanda.markModified('platos');
            await comanda.save();
        }
    }
    logger.info('Reserva confirmada tras aprobación PPA', { reservaId: reserva._id, mesaEstado });
    return { reserva, config, alreadyConfirmed: false, mesaEstado };
};

const rechazarReservaTrasPPA = async (reservaId, motivo) => {
    const reserva = await Reserva.findById(reservaId);
    if (!reserva) return { mesaId: null, comandaId: null };
    if (reserva.estado === 'rechazada' || reserva.estado === 'cancelada') {
        return { mesaId: reserva.mesa, comandaId: reserva.comandaGenerada };
    }
    reserva.estado = 'rechazada';
    reserva.notas = `${reserva.notas || ''} [RECHAZADA PPA: ${motivo || ''}]`.trim();
    if (reserva.pagoAdelantado) {
        reserva.pagoAdelantado.estadoTicket = 'rechazado';
        reserva.markModified('pagoAdelantado');
    }
    await reserva.save();
    await mesasModel.updateOne({ _id: reserva.mesa }, { estado: 'libre' });
    if (reserva.comandaGenerada) {
        await getComandaModel().updateOne(
            { _id: reserva.comandaGenerada },
            { $set: { status: 'cancelado', IsActive: false, programadaPorReserva: false } }
        );
    }
    logger.info('Reserva rechazada por PPA', { reservaId: reserva._id, motivo });
    return { mesaId: reserva.mesa, comandaId: reserva.comandaGenerada };
};

module.exports = {
    // CRUD basico
    crearReserva,
    listarReservas,
    obtenerReservaPorId,
    actualizarReserva,
    cancelarReserva,
    cancelarReservaPorComandaEliminada,

    // Funciones especificas
    obtenerReservaActivaPorMesa,
    marcarReservaComoActiva,
    marcarReservaComoCompletada,
    marcarReservaComoRechazada,
    obtenerReservasPendientesExpiracion,
    obtenerReservasProximasAExpirar,
    obtenerMesasDisponibles,

    // PLAN_RESERVAS_MOZOS_CAJA_KDS v1.1
    crearReservaDesdeMozos,
    confirmarReservaTrasAprobacionPPA,
    rechazarReservaTrasPPA,
    obtenerReservasProgramadasCocina,
    obtenerMesasDisponiblesParaReserva,
    // Helpers puras (testeables sin DB)
    calcularTotalesPlato,
    calcularFechaCocina,
    esReservaInmediata,
    parseFechaAtencionLima
};
