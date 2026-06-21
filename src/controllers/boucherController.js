const express = require('express');
const router = express.Router();

const { 
    listarBouchers, 
    listarBouchersPorFecha, 
    obtenerBoucherPorId, 
    eliminarBoucher,
    obtenerBoucherPorMesa,
    listarBouchersActivosPorMesa,
} = require('../repository/boucher.repository');
const { procesarPagoBoucher, esPagoParcial } = require('../services/boucherPagoService');
const { obtenerCicloServicioMesa } = require('../services/mesaCicloServicio.service');

// Obtener todos los bouchers
router.get('/boucher', async (req, res) => {
    try {
        const data = await listarBouchers();
        res.json(data);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener los bouchers' });
    }
});

// Obtener bouchers por fecha
router.get('/boucher/fecha/:fecha', async (req, res) => {
    const { fecha } = req.params;
    try {
        const data = await listarBouchersPorFecha(fecha);
        res.json(data);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener los bouchers por fecha' });
    }
});

/**
 * Lista bouchers individuales de pagos parciales en una mesa (sin consolidar).
 * GET /boucher/mesa/:mesaId/parciales?comandaIds=id1,id2
 * (Ruta específica ANTES de /boucher/:id)
 */
router.get('/boucher/mesa/:mesaId/parciales', async (req, res) => {
    const { mesaId } = req.params;
    try {
        const comandaIds = req.query.comandaIds
            ? String(req.query.comandaIds).split(',').map((s) => s.trim()).filter(Boolean)
            : undefined;
        const ciclo = await obtenerCicloServicioMesa(mesaId);
        const bouchers = await listarBouchersActivosPorMesa(mesaId, { comandaIds });
        res.json({
            success: true,
            mesaId,
            pedidoId: ciclo.pedidoId,
            cicloTipo: ciclo.tipo,
            cantidad: bouchers.length,
            bouchers,
        });
    } catch (error) {
        console.error('❌ [GET /boucher/mesa/:mesaId/parciales]', error);
        res.status(500).json({
            message: 'Error al listar bouchers parciales de la mesa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});

/**
 * Obtener boucher consolidado de una mesa (une todos los pagos parciales del ciclo).
 * GET /boucher/by-mesa/:mesaId
 */
router.get('/boucher/by-mesa/:mesaId', async (req, res) => {
    const { mesaId } = req.params;
    try {
        const comandaIds = req.query.comandaIds
            ? String(req.query.comandaIds).split(',').map((s) => s.trim()).filter(Boolean)
            : undefined;
        console.log(`📥 [GET /boucher/by-mesa/:mesaId] Solicitud para mesa: ${mesaId}`);
        const boucher = await obtenerBoucherPorMesa(mesaId, { comandaIds });
        
        if (!boucher) {
            console.log(`❌ [GET /boucher/by-mesa/:mesaId] No se encontró boucher para mesa ${mesaId}`);
            return res.status(404).json({ 
                message: 'No hay boucher pagado para esta mesa' 
            });
        }
        
        console.log(`✅ [GET /boucher/by-mesa/:mesaId] Boucher encontrado y retornado: ${boucher._id}`);
        res.json(boucher);
    } catch (error) {
        console.error('❌ [GET /boucher/by-mesa/:mesaId] Error al obtener boucher por mesa:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            message: 'Error al obtener el boucher de la mesa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Obtener el último boucher pagado de una mesa (alias)
 * GET /boucher-ultimo/:mesaId
 */
router.get('/boucher-ultimo/:mesaId', async (req, res) => {
    const { mesaId } = req.params;
    try {
        const comandaIds = req.query.comandaIds
            ? String(req.query.comandaIds).split(',').map((s) => s.trim()).filter(Boolean)
            : undefined;
        console.log(`📥 [GET /boucher-ultimo/:mesaId] Solicitud para mesa: ${mesaId}`);
        const boucher = await obtenerBoucherPorMesa(mesaId, { comandaIds });
        
        if (!boucher) {
            console.log(`❌ [GET /boucher-ultimo/:mesaId] No se encontró boucher para mesa ${mesaId}`);
            return res.status(404).json({ 
                message: 'No hay boucher pagado para esta mesa' 
            });
        }
        
        console.log(`✅ [GET /boucher-ultimo/:mesaId] Boucher encontrado y retornado: ${boucher._id}`);
        res.json(boucher);
    } catch (error) {
        console.error('❌ [GET /boucher-ultimo/:mesaId] Error al obtener boucher por mesa:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            message: 'Error al obtener el boucher de la mesa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Obtener un boucher por ID (después de rutas específicas /mesa, /by-mesa, /fecha)
router.get('/boucher/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const boucher = await obtenerBoucherPorId(id);
        res.json(boucher);
    } catch (error) {
        console.error(error.message);
        if (error.message === 'Boucher no encontrado') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Error al obtener el boucher' });
        }
    }
});

/**
 * Crear boucher — pago total o parcial.
 *
 * Pago total (comportamiento legacy):
 *   { mesaId, mozoId, clienteId?, comandasIds[], observaciones? }
 *
 * Pago parcial por platos:
 *   { mesaId, mozoId, clienteId?, platosSeleccionados: [{ comandaId, platoIndex|platoSubdocId, cantidad? }], observaciones? }
 *
 * Respuesta: { boucher, resumen: { totalPendiente, mesaPagadaCompletamente, comandas, mesa } }
 * Compatibilidad: si el cliente espera el boucher en la raíz, también se incluye spread del boucher.
 */
router.post('/boucher', async (req, res) => {
    try {
        const {
            mesaId,
            mozoId,
            clienteId,
            comandasIds,
            platosSeleccionados,
            observaciones,
            metodoPago,
            montoRecibido,
            vuelto,
            moneda,
            tipoCambioUsd,
        } = req.body;
        const parcial = esPagoParcial(platosSeleccionados);

        if (!mesaId || !mozoId) {
            return res.status(400).json({
                message: 'Datos incompletos: se requiere mesaId y mozoId',
            });
        }

        if (!parcial && (!comandasIds || !Array.isArray(comandasIds) || comandasIds.length === 0)) {
            return res.status(400).json({
                message: 'Datos incompletos: se requiere comandasIds (array no vacío) o platosSeleccionados para pago parcial',
            });
        }

        const resultado = await procesarPagoBoucher({
            mesaId,
            mozoId,
            clienteId,
            comandasIds,
            platosSeleccionados,
            observaciones,
            metodoPago,
            montoRecibido,
            vuelto,
            moneda,
            tipoCambioUsd,
        });

        const { boucher, resumen, ticketAprobacion } = resultado;

        if (global.emitComandaActualizada && resumen.comandas) {
            const idsPagados = new Set(
                (boucher.comandas || []).map((id) => id.toString())
            );
            for (const comandaId of idsPagados) {
                // BUG_PAGOS_PARCIALES_APROBACION_COCINA (Fase 2/3):
                // Tras un pago (parcial o total), la comanda queda en 'pendiente_aprobar'
                // (platos cobrados en 'pendiente' esperando aprobación de cocina).
                // Emitir el status real del resumen; antes se forzaba 'entregado' cuando
                // mesaPagadaCompletamente, lo que ocultaba el estado pendiente_aprobar.
                const comandaResumen = resumen.comandas.find((c) => c._id.toString() === comandaId);
                const estadoNuevo = comandaResumen?.status || 'pendiente_aprobar';
                await global
                    .emitComandaActualizada(comandaId, 'pendiente_aprobar', estadoNuevo)
                    .catch((err) => console.error(`⚠️ emitComandaActualizada ${comandaId}:`, err.message));
            }
        }

        if (global.emitMesaActualizada && resumen.mesa) {
            await global
                .emitMesaActualizada(mesaId, resumen.mesa.estado)
                .catch((err) => console.error('⚠️ emitMesaActualizada:', err.message));
        }

        // PLAN_PLANTILLA_COMANDAS: si se creó un ticket de aprobación (pago normal completo),
        // notificar a cocina (bandeja unificada) y a mozos (refresco de mesa en pendiente_aprobar).
        if (ticketAprobacion && global.emitTicketAprobacionNuevo) {
            try {
                await global.emitTicketAprobacionNuevo(ticketAprobacion);
            } catch (emitErr) {
                console.error('⚠️ emitTicketAprobacionNuevo:', emitErr.message);
            }
        }

        res.json({
            ...boucher.toObject ? boucher.toObject() : boucher,
            boucher,
            resumen,
            // Incluido para que PagosScreen sepa que debe imprimir comanda (no voucher)
            // y que la mesa está en pendiente_aprobar.
            ticketAprobacion: ticketAprobacion
                ? (ticketAprobacion.toObject ? ticketAprobacion.toObject() : ticketAprobacion)
                : null,
            mesaEstado: resumen.mesa?.estado || null,
        });

        console.log(
            `✅ Boucher ${parcial ? 'parcial' : 'total'} creado — pendiente mesa: S/. ${resumen.totalPendiente}${ticketAprobacion ? ` — TicketAprobacion #${ticketAprobacion.ticketNumber}` : ''}`
        );
    } catch (error) {
        console.error(error.message);
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message || 'Error al crear el boucher' });
    }
});

// Eliminar un boucher (soft delete)
router.delete('/boucher/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const boucher = await eliminarBoucher(id);
        res.json({ message: 'Boucher eliminado exitosamente', boucher });
    } catch (error) {
        console.error(error.message);
        if (error.message === 'Boucher no encontrado') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: 'Error al eliminar el boucher' });
        }
    }
});

module.exports = router;
