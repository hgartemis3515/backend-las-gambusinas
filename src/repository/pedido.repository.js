const pedidoModel = require('../database/models/pedido.model');
const comandaModel = require('../database/models/comanda.model');
const mesasModel = require('../database/models/mesas.model');
const mozosModel = require('../database/models/mozos.model');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const calculosPrecios = require('../utils/calculosPrecios');

// ==================== FUNCIONES CRUD ====================

/**
 * Lista todos los pedidos activos
 * @param {Object} filtros - Filtros opcionales (estado, mesa, etc.)
 * @returns {Promise<Array>} Lista de pedidos
 */
const listarPedidos = async (filtros = {}) => {
    try {
        const query = { isActive: true, ...filtros };
        
        const pedidos = await pedidoModel.find(query)
            .populate('mesa', 'nummesa estado area')
            .populate('mozo', 'name')
            .populate('cliente', 'nombre dni')
            .sort({ createdAt: -1 })
            .lean();
        
        logger.info(`[listarPedidos] ${pedidos.length} pedidos encontrados`);
        return pedidos;
    } catch (error) {
        logger.error('Error al listar pedidos:', error);
        throw error;
    }
};

/**
 * Obtiene un pedido por ID con todas sus comandas
 * @param {string} pedidoId - ID del pedido
 * @returns {Promise<Object>} Pedido con comandas pobladas
 */
const obtenerPedidoPorId = async (pedidoId) => {
    try {
        const pedido = await pedidoModel.findById(pedidoId)
            .populate('mesa', 'nummesa estado area')
            .populate('mozo', 'name')
            .populate('cliente', 'nombre dni')
            .populate({
                path: 'comandas',
                populate: {
                    path: 'platos.plato',
                    select: 'nombre precio categoria'
                }
            })
            .lean();
        
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }
        
        return pedido;
    } catch (error) {
        logger.error('Error al obtener pedido:', error);
        throw error;
    }
};

/**
 * Obtiene o crea un pedido abierto para una mesa
 * @param {string} mesaId - ID de la mesa
 * @param {string} mozoId - ID del mozo
 * @returns {Promise<Object>} Pedido existente o nuevo
 */
const obtenerOcrearPedidoAbierto = async (mesaId, mozoId) => {
    try {
        // Obtener datos de la mesa
        const mesa = await mesasModel.findById(mesaId);
        if (!mesa) {
            throw new Error('Mesa no encontrada');
        }
        
        // Obtener datos del mozo
        const mozo = await mozosModel.findById(mozoId);
        const nombreMozo = mozo?.name || 'Sin asignar';
        
        // Datos desnormalizados
        const datosMesa = {
            numMesa: mesa.nummesa,
            areaNombre: mesa.area?.nombre || null
        };
        
        // Buscar pedido abierto existente
        let pedido = await pedidoModel.findOne({
            mesa: mesaId,
            estado: 'abierto',
            isActive: true
        });
        
        if (pedido) {
            logger.info(`[obtenerOcrearPedidoAbierto] Pedido existente #${pedido.pedidoId} para mesa ${mesa.nummesa}`);
            return pedido;
        }
        
        // Crear nuevo pedido
        pedido = await pedidoModel.create({
            mesa: mesaId,
            numMesa: mesa.nummesa,
            areaNombre: datosMesa.areaNombre,
            mozo: mozoId,
            nombreMozo: nombreMozo,
            estado: 'abierto'
        });
        
        logger.info(`[obtenerOcrearPedidoAbierto] Nuevo pedido #${pedido.pedidoId} creado para mesa ${mesa.nummesa}`);
        
        return pedido;
    } catch (error) {
        logger.error('Error al obtener/crear pedido:', error);
        throw error;
    }
};

/**
 * Agrega una comanda a un pedido
 * @param {string} pedidoId - ID del pedido
 * @param {string} comandaId - ID de la comanda
 * @param {number} comandaNumber - Número de comanda
 * @returns {Promise<Object>} Pedido actualizado
 */
const agregarComandaAPedido = async (pedidoId, comandaId, comandaNumber) => {
    try {
        const pedido = await pedidoModel.findById(pedidoId);
        
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }
        
        // Agregar comanda si no existe
        if (!pedido.comandas.includes(comandaId)) {
            pedido.comandas.push(comandaId);
            pedido.comandasNumbers.push(comandaNumber);
            await pedido.save();
            
            logger.info(`[agregarComandaAPedido] Comanda #${comandaNumber} agregada al pedido #${pedido.pedidoId}`);
        }
        
        return pedido;
    } catch (error) {
        logger.error('Error al agregar comanda a pedido:', error);
        throw error;
    }
};

/**
 * Cierra un pedido (lo marca para pago)
 * @param {string} pedidoId - ID del pedido
 * @returns {Promise<Object>} Pedido cerrado
 */
const cerrarPedido = async (pedidoId) => {
    try {
        const pedido = await pedidoModel.findById(pedidoId);
        
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }
        
        if (pedido.estado !== 'abierto') {
            throw new Error(`No se puede cerrar un pedido en estado "${pedido.estado}"`);
        }
        
        // Recalcular totales antes de cerrar
        await pedido.calcularTotales();
        
        pedido.estado = 'cerrado';
        pedido.fechaCierre = moment.tz("America/Lima").toDate();
        await pedido.save();
        
        logger.info(`[cerrarPedido] Pedido #${pedido.pedidoId} cerrado`);
        
        return pedido;
    } catch (error) {
        logger.error('Error al cerrar pedido:', error);
        throw error;
    }
};

/**
 * Marca un pedido como pagado y lo asocia a un boucher
 * @param {string} pedidoId - ID del pedido
 * @param {string} boucherId - ID del boucher generado
 * @returns {Promise<Object>} Pedido pagado
 */
const marcarPedidoComoPagado = async (pedidoId, boucherId) => {
    try {
        const pedido = await pedidoModel.findById(pedidoId);
        
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }
        
        pedido.estado = 'pagado';
        pedido.fechaPago = moment.tz("America/Lima").toDate();
        pedido.boucher = boucherId;
        await pedido.save();
        
        logger.info(`[marcarPedidoComoPagado] Pedido #${pedido.pedidoId} pagado, boucher: ${boucherId}`);
        
        return pedido;
    } catch (error) {
        logger.error('Error al marcar pedido como pagado:', error);
        throw error;
    }
};

// ==================== DESCUENTOS ====================

/**
 * Aplica un descuento a nivel de pedido
 * @param {string} pedidoId - ID del pedido
 * @param {number} descuento - Porcentaje de descuento (0-100)
 * @param {string} motivo - Motivo del descuento
 * @param {string} aplicadoPor - ID del usuario que aplica el descuento
 * @returns {Promise<Object>} Pedido con descuento aplicado
 */
const aplicarDescuentoAPedido = async (pedidoId, descuento, motivo, aplicadoPor) => {
    try {
        // Validaciones
        if (descuento < 0 || descuento > 100) {
            throw new Error('El descuento debe estar entre 0 y 100%');
        }
        
        if (descuento > 0 && (!motivo || motivo.trim().length < 3)) {
            throw new Error('El motivo del descuento es obligatorio (mínimo 3 caracteres)');
        }
        
        const pedido = await pedidoModel.findById(pedidoId);
        
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }
        
        if (pedido.estado === 'pagado') {
            throw new Error('No se puede modificar un pedido ya pagado');
        }
        
        // Recalcular totales primero
        await pedido.calcularTotales();
        
        // Aplicar descuento
        pedido.descuento = descuento;
        pedido.motivoDescuento = motivo?.trim() || null;
        pedido.descuentoAplicadoPor = aplicadoPor || null;
        pedido.descuentoAplicadoAt = moment.tz("America/Lima").toDate();
        
        // Calcular monto de descuento
        pedido.aplicarCalculoDescuento();
        
        await pedido.save();
        
        logger.info(`[aplicarDescuentoAPedido] Descuento ${descuento}% aplicado al pedido #${pedido.pedidoId}`);
        
        return pedido;
    } catch (error) {
        logger.error('Error al aplicar descuento:', error);
        throw error;
    }
};

/**
 * Elimina el descuento de un pedido
 * @param {string} pedidoId - ID del pedido
 * @returns {Promise<Object>} Pedido sin descuento
 */
const eliminarDescuentoDePedido = async (pedidoId) => {
    try {
        const pedido = await pedidoModel.findById(pedidoId);
        
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }
        
        if (pedido.estado === 'pagado') {
            throw new Error('No se puede modificar un pedido ya pagado');
        }
        
        pedido.descuento = 0;
        pedido.motivoDescuento = null;
        pedido.descuentoAplicadoPor = null;
        pedido.descuentoAplicadoAt = null;
        pedido.montoDescuento = 0;
        
        // Recalcular totales
        await pedido.calcularTotales();
        
        logger.info(`[eliminarDescuentoDePedido] Descuento eliminado del pedido #${pedido.pedidoId}`);
        
        return pedido;
    } catch (error) {
        logger.error('Error al eliminar descuento:', error);
        throw error;
    }
};

// ==================== AGREGACIÓN PARA DASHBOARD ====================

/**
 * Obtiene comandas agrupadas por pedido con resumen
 * @param {Object} filtros - Filtros opcionales
 * @returns {Promise<Object>} Objeto con pedidos agrupados y comandas sin grupo
 */
const obtenerComandasAgrupadas = async (filtros = {}) => {
    try {
        const query = { IsActive: true, ...filtros };
        
        // Pipeline de agregación para agrupar comandas por pedidoId
        const pipeline = [
            // Filtrar comandas activas
            { $match: query },
            
            // Ordenar por fecha
            { $sort: { createdAt: -1 } },
            
            // Agrupar por campo pedido (referencia al modelo Pedido)
            {
                $group: {
                    _id: '$pedido',
                    pedidoId: { $first: '$pedido' },
                    pedidoNumber: { $first: '$pedidoNumber' },
                    mesaId: { $first: '$mesas' },
                    mesaNumero: { $first: '$mesaNumero' },
                    areaNombre: { $first: '$areaNombre' },
                    mozoId: { $first: '$mozos' },
                    mozoNombre: { $first: '$mozoNombre' },
                    clienteNombre: { $first: '$clienteNombre' },
                    comandas: { $push: '$$ROOT' },
                    cantidadComandas: { $sum: 1 },
                    subtotalGrupo: { $sum: '$precioTotal' },
                    primeraComanda: { $min: '$createdAt' },
                    ultimaComanda: { $max: '$createdAt' }
                }
            },
            
            // Lookup para obtener datos del pedido si existe
            {
                $lookup: {
                    from: 'pedidos',
                    localField: 'pedidoId',
                    foreignField: '_id',
                    as: 'pedidoInfo'
                }
            },
            
            // Unwind pedidoInfo
            {
                $unwind: {
                    path: '$pedidoInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            
            // Proyectar campos finales
            {
                $project: {
                    _id: 1,
                    pedidoId: 1,
                    pedidoNumber: 1,
                    mesaId: 1,
                    mesaNumero: 1,
                    areaNombre: 1,
                    mozoId: 1,
                    mozoNombre: 1,
                    clienteNombre: 1,
                    comandas: 1,
                    cantidadComandas: 1,
                    subtotalGrupo: 1,
                    primeraComanda: 1,
                    ultimaComanda: 1,
                    // Del pedido
                    estado: { $ifNull: ['$pedidoInfo.estado', 'sin_pedido'] },
                    descuento: { $ifNull: ['$pedidoInfo.descuento', 0] },
                    motivoDescuento: { $ifNull: ['$pedidoInfo.motivoDescuento', null] },
                    montoDescuento: { $ifNull: ['$pedidoInfo.montoDescuento', 0] },
                    totalConDescuento: { $ifNull: ['$pedidoInfo.totalConDescuento', '$subtotalGrupo'] },
                    totalFinal: { $ifNull: ['$pedidoInfo.totalFinal', '$subtotalGrupo'] }
                }
            },
            
            // Ordenar por fecha de primera comanda
            { $sort: { primeraComanda: -1 } }
        ];
        
        const grupos = await comandaModel.aggregate(pipeline);
        
        // Separar grupos con pedido de los sin pedido
        const gruposConPedido = grupos.filter(g => g.pedidoId != null);
        const comandasSinGrupo = grupos.filter(g => g.pedidoId == null);
        
        // Si hay grupos sin pedido, las comandas individuales van en sinGrupo
        let comandasSinPedido = [];
        if (comandasSinGrupo.length > 0) {
            // Aplanar las comandas de los grupos sin pedido
            comandasSinPedido = comandasSinGrupo.flatMap(g => g.comandas);
        }
        
        logger.info(`[obtenerComandasAgrupadas] ${gruposConPedido.length} grupos con pedido, ${comandasSinPedido.length} comandas sin pedido`);
        
        return {
            grupos: gruposConPedido,
            comandasSinPedido: comandasSinPedido
        };
    } catch (error) {
        logger.error('Error al obtener comandas agrupadas:', error);
        throw error;
    }
};

/**
 * Obtiene resumen de pedidos para el dashboard
 * @param {string} fecha - Fecha para filtrar (opcional)
 * @returns {Promise<Array>} Lista de pedidos con resumen
 */
const obtenerResumenPedidos = async (fecha = null) => {
    try {
        const query = { isActive: true };
        
        if (fecha) {
            const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
            const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
            query.createdAt = { $gte: fechaInicio, $lte: fechaFin };
        }
        
        const pedidos = await pedidoModel.find(query)
            .populate('mesa', 'nummesa estado')
            .populate('mozo', 'name')
            .select('-comandas')
            .sort({ createdAt: -1 })
            .lean();
        
        return pedidos;
    } catch (error) {
        logger.error('Error al obtener resumen de pedidos:', error);
        throw error;
    }
};

/**
 * Recalcula los totales de un pedido
 * @param {string} pedidoId - ID del pedido
 * @returns {Promise<Object>} Pedido con totales actualizados
 */
const recalcularTotalesPedido = async (pedidoId) => {
    try {
        const pedido = await pedidoModel.findById(pedidoId);
        
        if (!pedido) {
            throw new Error('Pedido no encontrado');
        }
        
        await pedido.calcularTotales();
        await pedido.save();
        
        logger.info(`[recalcularTotalesPedido] Totales actualizados para pedido #${pedido.pedidoId}`);
        
        return pedido;
    } catch (error) {
        logger.error('Error al recalcular totales:', error);
        throw error;
    }
};

// ==================== EXPORT ====================

module.exports = {
    listarPedidos,
    obtenerPedidoPorId,
    obtenerOcrearPedidoAbierto,
    agregarComandaAPedido,
    cerrarPedido,
    marcarPedidoComoPagado,
    aplicarDescuentoAPedido,
    eliminarDescuentoDePedido,
    obtenerComandasAgrupadas,
    obtenerResumenPedidos,
    recalcularTotalesPedido
};
