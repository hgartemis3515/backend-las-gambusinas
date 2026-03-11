const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const pedidoRepository = require('../repository/pedido.repository');
const comandaRepository = require('../repository/comanda.repository');
const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');
const { registrarAuditoria } = require('../middleware/auditoria');

// ==================== ENDPOINTS DE PEDIDOS ====================

/**
 * GET /api/pedidos
 * Lista todos los pedidos activos
 */
router.get('/pedidos', async (req, res) => {
    try {
        const { estado, mesa, fecha } = req.query;
        
        const filtros = {};
        if (estado) filtros.estado = estado;
        if (mesa) filtros.mesa = mesa;
        
        let pedidos = await pedidoRepository.listarPedidos(filtros);
        
        // Filtrar por fecha si se proporciona
        if (fecha) {
            const moment = require('moment-timezone');
            const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
            const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
            
            pedidos = pedidos.filter(p => {
                const pedidoFecha = new Date(p.createdAt);
                return pedidoFecha >= fechaInicio && pedidoFecha <= fechaFin;
            });
        }
        
        res.json(pedidos);
    } catch (error) {
        logger.error('Error en GET /api/pedidos:', error);
        handleError(error, res, logger);
    }
});

/**
 * GET /api/pedidos/:id
 * Obtiene un pedido por ID con todas sus comandas
 */
router.get('/pedidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de pedido inválido' });
        }
        
        const pedido = await pedidoRepository.obtenerPedidoPorId(id);
        res.json(pedido);
    } catch (error) {
        logger.error('Error en GET /api/pedidos/:id:', error);
        handleError(error, res, logger);
    }
});

/**
 * GET /api/pedidos/mesa/:mesaId
 * Obtiene el pedido abierto de una mesa específica
 */
router.get('/pedidos/mesa/:mesaId', async (req, res) => {
    try {
        const { mesaId } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(mesaId)) {
            return res.status(400).json({ message: 'ID de mesa inválido' });
        }
        
        const pedido = await mongoose.model('Pedido').findOne({
            mesa: mesaId,
            estado: 'abierto',
            isActive: true
        })
            .populate('mesa', 'nummesa estado area')
            .populate('mozo', 'name')
            .populate('comandas')
            .lean();
        
        if (!pedido) {
            return res.json({ pedido: null, message: 'No hay pedido abierto para esta mesa' });
        }
        
        res.json(pedido);
    } catch (error) {
        logger.error('Error en GET /api/pedidos/mesa/:mesaId:', error);
        handleError(error, res, logger);
    }
});

/**
 * PUT /api/pedidos/:id/descuento
 * Aplica un descuento a nivel de pedido
 */
router.put('/pedidos/:id/descuento', async (req, res) => {
    try {
        const { id } = req.params;
        const { descuento, motivo, usuarioId, usuarioRol } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de pedido inválido' });
        }
        
        // Validar permisos (solo admin/supervisor)
        if (!['admin', 'supervisor'].includes(usuarioRol)) {
            return res.status(403).json({ message: 'No tiene permisos para aplicar descuentos' });
        }
        
        const pedidoActualizado = await pedidoRepository.aplicarDescuentoAPedido(id, descuento, motivo, usuarioId);
        
        // Registrar auditoría
        req.auditoria = {
            accion: 'APLICAR_DESCUENTO_PEDIDO',
            entidadId: id,
            entidadTipo: 'pedido',
            usuario: usuarioId,
            motivo: motivo,
            metadata: {
                descuento: descuento,
                montoDescuento: pedidoActualizado.montoDescuento,
                totalAnterior: pedidoActualizado.totalSinDescuento,
                totalNuevo: pedidoActualizado.totalFinal
            }
        };
        
        res.json({
            message: `Descuento del ${descuento}% aplicado correctamente`,
            pedido: pedidoActualizado,
            descuentoAplicado: {
                porcentaje: descuento,
                monto: pedidoActualizado.montoDescuento,
                totalSinDescuento: pedidoActualizado.totalSinDescuento,
                totalConDescuento: pedidoActualizado.totalFinal
            }
        });
    } catch (error) {
        logger.error('Error en PUT /api/pedidos/:id/descuento:', error);
        handleError(error, res, logger);
    }
});

/**
 * DELETE /api/pedidos/:id/descuento
 * Elimina el descuento de un pedido
 */
router.delete('/pedidos/:id/descuento', async (req, res) => {
    try {
        const { id } = req.params;
        const { usuarioId, usuarioRol } = req.body;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de pedido inválido' });
        }
        
        // Validar permisos
        if (!['admin', 'supervisor'].includes(usuarioRol)) {
            return res.status(403).json({ message: 'No tiene permisos para eliminar descuentos' });
        }
        
        const pedidoActualizado = await pedidoRepository.eliminarDescuentoDePedido(id);
        
        res.json({
            message: 'Descuento eliminado correctamente',
            pedido: pedidoActualizado
        });
    } catch (error) {
        logger.error('Error en DELETE /api/pedidos/:id/descuento:', error);
        handleError(error, res, logger);
    }
});

/**
 * PUT /api/pedidos/:id/cerrar
 * Cierra un pedido (lo marca para pago)
 */
router.put('/pedidos/:id/cerrar', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de pedido inválido' });
        }
        
        const pedidoCerrado = await pedidoRepository.cerrarPedido(id);
        
        res.json({
            message: 'Pedido cerrado correctamente',
            pedido: pedidoCerrado
        });
    } catch (error) {
        logger.error('Error en PUT /api/pedidos/:id/cerrar:', error);
        handleError(error, res, logger);
    }
});

/**
 * POST /api/pedidos/:id/recalcular
 * Recalcula los totales de un pedido
 */
router.post('/pedidos/:id/recalcular', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de pedido inválido' });
        }
        
        const pedidoActualizado = await pedidoRepository.recalcularTotalesPedido(id);
        
        res.json({
            message: 'Totales recalculados correctamente',
            pedido: pedidoActualizado
        });
    } catch (error) {
        logger.error('Error en POST /api/pedidos/:id/recalcular:', error);
        handleError(error, res, logger);
    }
});

// ==================== ENDPOINT DE COMANDAS AGRUPADAS ====================

/**
 * GET /api/comandas/agrupadas
 * Obtiene comandas agrupadas por pedido con resumen para el dashboard
 */
router.get('/comandas/agrupadas', async (req, res) => {
    try {
        const { fecha, estado } = req.query;
        
        const filtros = {};
        
        // Filtrar por fecha si se proporciona
        if (fecha) {
            const moment = require('moment-timezone');
            const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
            const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();
            filtros.createdAt = { $gte: fechaInicio, $lte: fechaFin };
        }
        
        // Filtrar por estado de comanda si se proporciona
        if (estado) {
            filtros.status = estado;
        }
        
        const resultado = await pedidoRepository.obtenerComandasAgrupadas(filtros);
        
        res.json(resultado);
    } catch (error) {
        logger.error('Error en GET /api/comandas/agrupadas:', error);
        handleError(error, res, logger);
    }
});

/**
 * GET /api/pedidos/resumen/dashboard
 * Obtiene resumen de pedidos para el dashboard
 */
router.get('/pedidos/resumen/dashboard', async (req, res) => {
    try {
        const { fecha } = req.query;
        
        const pedidos = await pedidoRepository.obtenerResumenPedidos(fecha);
        
        // Calcular estadísticas generales
        const estadisticas = {
            totalPedidos: pedidos.length,
            pedidosAbiertos: pedidos.filter(p => p.estado === 'abierto').length,
            pedidosCerrados: pedidos.filter(p => p.estado === 'cerrado').length,
            pedidosPagados: pedidos.filter(p => p.estado === 'pagado').length,
            totalVentas: pedidos.reduce((sum, p) => sum + (p.totalFinal || 0), 0),
            totalDescuentos: pedidos.reduce((sum, p) => sum + (p.montoDescuento || 0), 0)
        };
        
        res.json({
            pedidos,
            estadisticas
        });
    } catch (error) {
        logger.error('Error en GET /api/pedidos/resumen/dashboard:', error);
        handleError(error, res, logger);
    }
});

module.exports = router;
