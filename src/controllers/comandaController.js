const express = require('express');

const router = express.Router();

const mongoose = require('mongoose');

const { 
  listarComanda, 
  agregarComanda, 
  eliminarComanda, 
  eliminarLogicamente,
  editarConAuditoria,
  actualizarComanda, 
  cambiarStatusComanda, 
  cambiarEstadoComanda, 
  listarComandaPorFechaEntregado, 
  listarComandaPorFecha, 
  cambiarEstadoPlato, 
  revertirStatusComanda,
  getComandasParaPagar,
  recalcularEstadoMesa,
  recalcularEstadoComandaPorPlatos,
  ensurePlatosPopulated,
  marcarPlatoComoEntregado,
  anularPlato,
  anularComandaCompleta,
  aplicarDescuento
} = require('../repository/comanda.repository');

const { registrarAuditoria } = require('../middleware/auditoria');
const HistorialComandas = require('../database/models/historialComandas.model');
const comandaModel = require('../database/models/comanda.model');
const logger = require('../utils/logger');
const { handleError, createErrorResponse } = require('../utils/errorHandler');

router.get('/comanda', async (req, res) => {
    try {
        const data = await listarComanda();
        // Asegurar que siempre retornamos un array
        if (!Array.isArray(data)) {
            logger.warn('listarComanda no retornó un array', { type: typeof data, data });
            res.json([]);
        } else {
            res.json(data);
        }
    } catch (error) {
        logger.error('Error en GET /api/comanda', {
            message: error.message,
            stack: error.stack
        });
        handleError(error, res, logger);
    }
});

router.get('/comanda/fecha/:fecha', async (req, res) => {
    const { fecha } = req.params;
    try {
        const data = await listarComandaPorFecha (fecha);
        res.json(data);
    } catch (error) {
        logger.error('Error al obtener comandas por fecha', {
            fecha,
            error: error.message,
            stack: error.stack
        });
        handleError(error, res, logger);
    }
});

router.get('/comanda/fechastatus/:fecha', async (req, res) => {
    const { fecha } = req.params;
    try {
        const data = await listarComandaPorFechaEntregado(fecha);
        res.json(data);
    } catch (error) {
        logger.error('Error al obtener comandas por fecha y status', {
            fecha,
            error: error.message,
            stack: error.stack
        });
        handleError(error, res, logger);
    }
});

// ==================== FASE A1: ENDPOINT OPTIMIZADO PARA COCINA ====================
/**
 * GET /api/comanda/cocina/:fecha
 * Endpoint ultra-optimizado para app de cocina
 * - Usa índice compuesto idx_comanda_cocina_fecha
 * - Retorna solo campos necesarios para tablero Kanban
 * - Usa lean() y proyecciones
 * - Incluye tiempo de respuesta para monitoreo
 */
router.get('/comanda/cocina/:fecha', async (req, res) => {
    const { fecha } = req.params;
    const startTime = Date.now();
    
    try {
        // Usar la función optimizada con proyección
        const data = await listarComandaPorFechaEntregado(fecha, true);
        
        const elapsedMs = Date.now() - startTime;
        
        // Log para monitoreo de rendimiento
        logger.info('[FASE A1] Endpoint cocina optimizado', {
            fecha,
            cantidadComandas: data.length,
            tiempoRespuestaMs: elapsedMs
        });
        
        // Añadir header con tiempo de respuesta para monitoreo
        res.set('X-Response-Time', `${elapsedMs}ms`);
        res.json(data);
    } catch (error) {
        logger.error('Error en endpoint cocina optimizado', {
            fecha,
            error: error.message,
            stack: error.stack
        });
        handleError(error, res, logger);
    }
});

// ==================== FIN FASE A1 ====================

// GET /api/comanda/:id - Obtener comanda por ID
router.get('/comanda/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const mongoose = require('mongoose');
        
        // Validar que el ID sea un ObjectId válido
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de comanda inválido' });
        }
        
        const comanda = await comandaModel
            .findById(id)
            .populate('mozos', 'name DNI')
            .populate('mesas', 'nummesa estado area')
            .populate('cliente', 'nombre dni telefono tipo')
            .populate('platos.plato', 'nombre precio categoria')
            .lean();
        
        if (!comanda) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // Asegurar que los platos estén populados
        const comandasConPlatos = await ensurePlatosPopulated([comanda]);
        
        res.json(comandasConPlatos[0] || comanda);
    } catch (error) {
        logger.error('Error al obtener comanda por ID', {
            id,
            error: error.message,
            stack: error.stack
        });
        handleError(error, res, logger);
    }
});

router.post('/comanda', async (req, res) => {
    try {
        // Extraer información de auditoría desde headers o body
        const deviceId = req.body.deviceId || req.headers['x-device-id'] || null;
        const sourceApp = req.body.sourceApp || req.headers['x-source-app'] || 'api';
        
        // Agregar campos de auditoría al body si no están presentes
        if (!req.body.deviceId && deviceId) {
            req.body.deviceId = deviceId;
        }
        if (!req.body.sourceApp && sourceApp) {
            req.body.sourceApp = sourceApp;
        }
        if (!req.body.createdBy && req.body.mozos) {
            req.body.createdBy = req.body.mozos;
        }
        
        const data = await agregarComanda(req.body);
        res.json(data);
        logger.info('Comanda creada exitosamente', {
            comandaId: data.comanda?._id,
            comandaNumber: data.comanda?.comandaNumber,
            sourceApp
        });
        
        // Emitir evento Socket.io de nueva comanda
        if (global.emitNuevaComanda && data.comanda) {
            await global.emitNuevaComanda(data.comanda);
        }
    } catch (error) {
        logger.error('Error al crear comanda', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        handleError(error, res, logger);
    }
});

/**
 * ❌ DELETE → ✅ SOFT DELETE con auditoría
 * Endpoint reemplazado por PUT /comanda/:id/eliminar
 * Mantenido por compatibilidad pero ahora usa soft-delete
 */
router.delete('/comanda/:id', async (req, res) => {
    const { id } = req.params;
    const motivo = req.body?.motivo || 'Eliminación desde endpoint DELETE (legacy)';
    let usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    try {
        // Obtener snapshot antes de eliminar con datos completos
        const snapshotAntes = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mesas')
            .populate('mozos')
            .lean();
        
        if (!snapshotAntes) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // Si no hay usuarioId en el request, obtenerlo de la comanda (mozo que creó la comanda)
        if (!usuarioId && snapshotAntes.mozos) {
            usuarioId = snapshotAntes.mozos._id || snapshotAntes.mozos;
            console.log('✅ [DELETE /comanda/:id] UsuarioId obtenido de comanda.mozos:', usuarioId);
        }
        
        // Calcular total eliminado y platos eliminados
        let totalEliminado = 0;
        const platosEliminados = [];
        
        if (snapshotAntes.platos && Array.isArray(snapshotAntes.platos)) {
            snapshotAntes.platos.forEach((platoItem, index) => {
                if (!platoItem.eliminado) {
                    const plato = platoItem.plato || platoItem;
                    const cantidad = snapshotAntes.cantidades?.[index] || 1;
                    const precio = plato?.precio || 0;
                    const subtotal = precio * cantidad;
                    totalEliminado += subtotal;
                    
                    platosEliminados.push({
                        nombre: plato?.nombre || 'Plato desconocido',
                        cantidad: cantidad,
                        precio: precio,
                        subtotal: subtotal
                    });
                }
            });
        }
        
        const deletedComanda = await eliminarLogicamente(id, usuarioId, motivo);
        
        // ✅ La función eliminarLogicamente ya recalcula el estado de la mesa automáticamente
        // No necesitamos hacerlo aquí porque ya se hace en el repository
        
        if (deletedComanda) {
            // Registrar auditoría con datos completos
            req.auditoria = {
                accion: 'ELIMINAR_COMANDA_INDIVIDUAL',
                entidadId: id,
                entidadTipo: 'comanda',
                usuario: usuarioId,
                mesaId: snapshotAntes.mesas?._id || snapshotAntes.mesas,
                comandaId: id,
                motivo: motivo.trim(),
                platosEliminados: platosEliminados,
                totalEliminado: totalEliminado,
                comandaNumber: snapshotAntes.comandaNumber,
                ip: req.ip,
                deviceId: req.headers['device-id'] || req.headers['x-device-id']
            };
            
            // Guardar datos adicionales en metadata para consultas
            const metadataAdicional = {
                comandaNumber: snapshotAntes.comandaNumber,
                mesaId: snapshotAntes.mesas?._id || snapshotAntes.mesas,
                mesaNum: snapshotAntes.mesas?.nummesa || null,
                platosEliminados: platosEliminados,
                totalEliminado: totalEliminado,
                cantidadPlatos: platosEliminados.length
            };
            
            req.auditoria.metadata = { ...req.auditoria.metadata, ...metadataAdicional };
            
            await registrarAuditoria(req, snapshotAntes, deletedComanda, motivo);
            
            res.json({ 
                message: 'Comanda archivada con auditoría (soft-delete)',
                comanda: deletedComanda,
                totalEliminado: totalEliminado,
                platosEliminados: platosEliminados.length
            });
            
            // Emitir evento Socket.io de comanda eliminada
            if (global.emitComandaActualizada) {
                await global.emitComandaActualizada(id);
            }
        } else {
            res.status(404).json({ message: 'Comanda no encontrada' });
        }
    } catch (error) {
        console.error(error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ message: error.message || 'Error al eliminar la comanda' });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Soft-delete con motivo obligatorio
 */
router.put('/comanda/:id/eliminar', async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;
    let usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    // Validar que el motivo sea obligatorio
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({ 
            message: 'El motivo de eliminación es obligatorio' 
        });
    }
    
    try {
        // Obtener comanda para verificar y obtener mozo si no hay usuarioId
        const comandaCheck = await comandaModel.findById(id).populate('mozos').lean();
        if (!comandaCheck) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // Si no hay usuarioId en el request, obtenerlo de la comanda (mozo que creó la comanda)
        if (!usuarioId && comandaCheck.mozos) {
            usuarioId = comandaCheck.mozos._id || comandaCheck.mozos;
            console.log('✅ [PUT /comanda/:id/eliminar] UsuarioId obtenido de comanda.mozos:', usuarioId);
        }
        
        // Obtener snapshot antes de eliminar (ya tenemos comandaCheck, pero necesitamos snapshot completo para auditoría)
        const snapshotAntes = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mesas')
            .populate('mozos')
            .lean();
        if (!snapshotAntes) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        const comanda = await eliminarLogicamente(id, usuarioId, motivo);
        
        // Registrar auditoría
        req.auditoria = {
            accion: 'comanda_eliminada',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        await registrarAuditoria(req, snapshotAntes, comanda, motivo);
        
        // Emitir evento Socket.io
        const mesaId = comanda.mesas?._id || comanda.mesas;
        if (mesaId && global.io) {
            global.io.to(`mesa-${mesaId}`).emit('comanda-eliminada', comanda);
        }
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }
        
        res.json({ 
            message: 'Comanda archivada con auditoría',
            comanda: comanda
        });
    } catch (error) {
        console.error('❌ Error al eliminar comanda:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ message: error.message || 'Error al eliminar la comanda' });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Eliminar última comanda con auditoría completa
 * DELETE /comanda/:id/ultima
 */
router.delete('/comanda/:id/ultima', async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;
    let usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    // Validar que el motivo sea obligatorio
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({ 
            message: 'El motivo de eliminación es obligatorio' 
        });
    }
    
    try {
        // Obtener snapshot antes de eliminar
        const snapshotAntes = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mesas')
            .populate('mozos')
            .lean();
        
        if (!snapshotAntes) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // Si no hay usuarioId en el request, obtenerlo de la comanda (mozo que creó la comanda)
        if (!usuarioId && snapshotAntes.mozos) {
            usuarioId = snapshotAntes.mozos._id || snapshotAntes.mozos;
            console.log('✅ [DELETE /comanda/:id/ultima] UsuarioId obtenido de comanda.mozos:', usuarioId);
        }
        
        // Calcular total eliminado
        let totalEliminado = 0;
        const platosEliminados = [];
        
        if (snapshotAntes.platos && Array.isArray(snapshotAntes.platos)) {
            snapshotAntes.platos.forEach((platoItem, index) => {
                if (!platoItem.eliminado) {
                    const plato = platoItem.plato || platoItem;
                    const cantidad = snapshotAntes.cantidades?.[index] || 1;
                    const precio = plato?.precio || 0;
                    const subtotal = precio * cantidad;
                    totalEliminado += subtotal;
                    
                    platosEliminados.push({
                        nombre: plato?.nombre || 'Plato desconocido',
                        cantidad: cantidad,
                        precio: precio,
                        subtotal: subtotal
                    });
                }
            });
        }
        
        // Eliminar comanda
        const comanda = await eliminarLogicamente(id, usuarioId, motivo);
        
        // Registrar auditoría específica con metadata completa
        req.auditoria = {
            accion: 'ELIMINAR_ULTIMA_COMANDA',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            mesaId: snapshotAntes.mesas?._id || snapshotAntes.mesas,
            comandaId: id,
            motivo: motivo.trim(),
            platosEliminados: platosEliminados,
            totalEliminado: totalEliminado,
            comandaNumber: snapshotAntes.comandaNumber,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        
        // Guardar datos adicionales en metadata para consultas desde auditoriaController
        const metadataAdicional = {
            comandaNumber: snapshotAntes.comandaNumber,
            mesaId: snapshotAntes.mesas?._id || snapshotAntes.mesas,
            mesaNum: snapshotAntes.mesas?.nummesa || null,
            platosEliminados: platosEliminados,
            totalEliminado: totalEliminado,
            cantidadPlatos: platosEliminados.length,
            tipoEliminacion: 'ultima_comanda'
        };
        
        req.auditoria.metadata = { ...req.auditoria.metadata, ...metadataAdicional };
        
        await registrarAuditoria(req, snapshotAntes, comanda, motivo);
        
        // Emitir evento Socket.io a mozos (room por mesa)
        const mesaId = comanda.mesas?._id || comanda.mesas;
        if (mesaId && global.io) {
            global.io.to(`mesa-${mesaId}`).emit('comanda-eliminada', comanda);
        }
        
        // ✅ Emitir evento a app de cocina (room por fecha) para que desaparezca la tarjeta en tiempo real
        if (global.emitComandaEliminada) {
            await global.emitComandaEliminada(id);
        }
        
        res.json({ 
            message: 'Última comanda eliminada con auditoría completa',
            comanda: comanda,
            totalEliminado: totalEliminado,
            platosEliminados: platosEliminados.length
        });
    } catch (error) {
        console.error('❌ Error al eliminar última comanda:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ message: error.message || 'Error al eliminar la última comanda' });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Eliminar comanda individual con auditoría completa (desde modal)
 * DELETE /comanda/:id/individual
 */
router.delete('/comanda/:id/individual', async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;
    let usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    // Validar que el motivo sea obligatorio
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({ 
            message: 'El motivo de eliminación es obligatorio' 
        });
    }
    
    try {
        // Obtener snapshot antes de eliminar con datos completos
        const snapshotAntes = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mesas')
            .populate('mozos')
            .lean();
        
        if (!snapshotAntes) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // Si no hay usuarioId en el request, obtenerlo de la comanda (mozo que creó la comanda)
        if (!usuarioId && snapshotAntes.mozos) {
            usuarioId = snapshotAntes.mozos._id || snapshotAntes.mozos;
            console.log('✅ [DELETE /comanda/:id/individual] UsuarioId obtenido de comanda.mozos:', usuarioId);
        }
        
        // Calcular total eliminado y platos eliminados
        let totalEliminado = 0;
        const platosEliminados = [];
        
        if (snapshotAntes.platos && Array.isArray(snapshotAntes.platos)) {
            snapshotAntes.platos.forEach((platoItem, index) => {
                if (!platoItem.eliminado) {
                    const plato = platoItem.plato || platoItem;
                    const cantidad = snapshotAntes.cantidades?.[index] || 1;
                    const precio = plato?.precio || 0;
                    const subtotal = precio * cantidad;
                    totalEliminado += subtotal;
                    
                    platosEliminados.push({
                        nombre: plato?.nombre || 'Plato desconocido',
                        cantidad: cantidad,
                        precio: precio,
                        subtotal: subtotal
                    });
                }
            });
        }
        
        // Eliminar comanda
        const comanda = await eliminarLogicamente(id, usuarioId, motivo);
        
        // Registrar auditoría específica con metadata completa
        req.auditoria = {
            accion: 'ELIMINAR_COMANDA_INDIVIDUAL',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            mesaId: snapshotAntes.mesas?._id || snapshotAntes.mesas,
            comandaId: id,
            motivo: motivo.trim(),
            platosEliminados: platosEliminados,
            totalEliminado: totalEliminado,
            comandaNumber: snapshotAntes.comandaNumber,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        
        // Guardar datos adicionales en metadata para consultas desde auditoriaController
        const metadataAdicional = {
            comandaNumber: snapshotAntes.comandaNumber,
            mesaId: snapshotAntes.mesas?._id || snapshotAntes.mesas,
            mesaNum: snapshotAntes.mesas?.nummesa || null,
            platosEliminados: platosEliminados,
            totalEliminado: totalEliminado,
            cantidadPlatos: platosEliminados.length,
            tipoEliminacion: 'comanda_individual',
            estadoComanda: snapshotAntes.status
        };
        
        req.auditoria.metadata = { ...req.auditoria.metadata, ...metadataAdicional };
        
        await registrarAuditoria(req, snapshotAntes, comanda, motivo);
        
        // Emitir evento Socket.io a mozos (room por mesa)
        const mesaId = comanda.mesas?._id || comanda.mesas;
        if (mesaId && global.io) {
            global.io.to(`mesa-${mesaId}`).emit('comanda-eliminada', comanda);
        }
        
        // ✅ Emitir evento a app de cocina (room por fecha) para que desaparezca la tarjeta en tiempo real
        if (global.emitComandaEliminada) {
            await global.emitComandaEliminada(id);
        }
        
        res.json({ 
            message: 'Comanda eliminada con auditoría completa',
            comanda: comanda,
            totalEliminado: totalEliminado,
            platosEliminados: platosEliminados.length
        });
    } catch (error) {
        console.error('❌ Error al eliminar comanda individual:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ message: error.message || 'Error al eliminar la comanda' });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Eliminar todas las comandas de una mesa con auditoría completa
 * DELETE /comanda/mesa/:mesaId/todas
 */
router.delete('/comanda/mesa/:mesaId/todas', async (req, res) => {
    const { mesaId } = req.params;
    const { motivo } = req.body;
    let usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    // Validar que el motivo sea obligatorio
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({ 
            message: 'El motivo de eliminación es obligatorio' 
        });
    }
    
    try {
        // Obtener todas las comandas activas de la mesa
        const comandas = await comandaModel.find({
            mesas: mesaId,
            IsActive: true,
            status: { $nin: ['pagado', 'completado'] }
        })
        .populate('platos.plato')
        .populate('mesas')
        .populate('mozos')
        .lean();
        
        if (!comandas || comandas.length === 0) {
            return res.status(404).json({ message: 'No hay comandas activas para eliminar en esta mesa' });
        }
        
        // Si no hay usuarioId en el request, obtenerlo de la primera comanda (mozo que creó la comanda)
        if (!usuarioId && comandas.length > 0 && comandas[0].mozos) {
            usuarioId = comandas[0].mozos._id || comandas[0].mozos;
            console.log('✅ [DELETE /comanda/mesa/:mesaId/todas] UsuarioId obtenido de primera comanda.mozos:', usuarioId);
        }
        
        // Calcular totales y preparar datos de auditoría
        let totalGeneralEliminado = 0;
        const comandasEliminadas = [];
        const platosEliminados = [];
        
        comandas.forEach(comanda => {
            let totalComanda = 0;
            const platosComanda = [];
            
            if (comanda.platos && Array.isArray(comanda.platos)) {
                comanda.platos.forEach((platoItem, index) => {
                    if (!platoItem.eliminado) {
                        const plato = platoItem.plato || platoItem;
                        const cantidad = comanda.cantidades?.[index] || 1;
                        const precio = plato?.precio || 0;
                        const subtotal = precio * cantidad;
                        totalComanda += subtotal;
                        
                        platosComanda.push({
                            nombre: plato?.nombre || 'Plato desconocido',
                            cantidad: cantidad,
                            precio: precio,
                            subtotal: subtotal
                        });
                        
                        platosEliminados.push({
                            comandaId: comanda._id,
                            comandaNumber: comanda.comandaNumber,
                            nombre: plato?.nombre || 'Plato desconocido',
                            cantidad: cantidad,
                            precio: precio,
                            subtotal: subtotal
                        });
                    }
                });
            }
            
            totalGeneralEliminado += totalComanda;
            
            comandasEliminadas.push({
                comandaId: comanda._id,
                comandaNumber: comanda.comandaNumber,
                total: totalComanda,
                platos: platosComanda
            });
        });
        
        // Eliminar todas las comandas
        const eliminaciones = comandas.map(comanda => 
            eliminarLogicamente(comanda._id.toString(), usuarioId, motivo)
        );
        
        const comandasEliminadasResult = await Promise.all(eliminaciones);
        
        // ✅ RECALCULAR ESTADO DE LA MESA después de eliminar todas las comandas
        // (cada eliminarLogicamente ya recalcula, pero hacemos una llamada final para asegurar que quede en "libre")
        try {
          await recalcularEstadoMesa(mesaId);
          console.log(`✅ Estado de mesa ${mesaId} recalculado después de eliminar todas las comandas - Debe estar en "libre"`);
        } catch (error) {
          console.error(`⚠️ Error al recalcular estado de mesa después de eliminar todas las comandas:`, error.message);
          // No lanzar error para no interrumpir el flujo principal
        }
        
        // Registrar auditoría específica con metadata completa
        const mesaNum = comandas[0]?.mesas?.nummesa || null;
        req.auditoria = {
            accion: 'ELIMINAR_TODAS_COMANDAS',
            entidadId: mesaId,
            entidadTipo: 'mesa',
            usuario: usuarioId,
            mesaId: mesaId,
            comandasIds: comandas.map(c => c._id.toString()),
            motivo: motivo.trim(),
            comandasEliminadas: comandasEliminadas,
            platosEliminados: platosEliminados,
            totalEliminado: totalGeneralEliminado,
            cantidadComandas: comandas.length,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        
        // Guardar datos adicionales en metadata para consultas desde auditoriaController
        const metadataAdicional = {
            mesaId: mesaId,
            mesaNum: mesaNum,
            comandasIds: comandas.map(c => c._id.toString()),
            comandasNumbers: comandas.map(c => c.comandaNumber),
            comandasEliminadas: comandasEliminadas,
            platosEliminados: platosEliminados,
            totalEliminado: totalGeneralEliminado,
            cantidadComandas: comandas.length,
            cantidadPlatos: platosEliminados.length,
            tipoEliminacion: 'todas_comandas'
        };
        
        req.auditoria.metadata = { ...req.auditoria.metadata, ...metadataAdicional };
        
        // Registrar auditoría usando la primera comanda como snapshot
        await registrarAuditoria(req, comandas[0], { eliminadas: comandasEliminadasResult }, motivo);
        
        // Emitir eventos Socket.io a mozos (room por mesa)
        if (global.io) {
            global.io.to(`mesa-${mesaId}`).emit('comandas-eliminadas', {
                mesaId: mesaId,
                cantidad: comandas.length
            });
        }
        
        // ✅ Emitir eventos de eliminación a app de cocina para cada comanda eliminada
        comandas.forEach(comanda => {
            if (global.emitComandaEliminada) {
                global.emitComandaEliminada(comanda._id.toString());
            }
        });
        
        res.json({ 
            message: `Todas las comandas de la mesa eliminadas con auditoría completa`,
            cantidadComandas: comandas.length,
            totalEliminado: totalGeneralEliminado,
            comandasEliminadas: comandasEliminadas.map(c => ({
                comandaNumber: c.comandaNumber,
                total: c.total,
                platos: c.platos.length
            }))
        });
    } catch (error) {
        console.error('❌ Error al eliminar todas las comandas:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ message: error.message || 'Error al eliminar todas las comandas' });
    }
});

/**
 * 🔥 NUEVO ENDPOINT: Eliminar plato individual (marcar como eliminado)
 * Solo permite eliminar si la comanda está en estado "pedido" (status: "en_espera")
 */
router.put('/comanda/:id/eliminar-plato/:platoIndex', async (req, res) => {
    const { id, platoIndex } = req.params;
    const { razon } = req.body;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    // Debounce map para evitar duplicados
    const debounceKey = `eliminar_${id}_${platoIndex}`;
    if (global.debounceMap && global.debounceMap.has(debounceKey)) {
        return res.status(429).json({ message: 'Procesando eliminación, por favor espere...' });
    }
    if (!global.debounceMap) global.debounceMap = new Map();
    global.debounceMap.set(debounceKey, true);
    setTimeout(() => global.debounceMap.delete(debounceKey), 500);
    
    try {
        // 1. Validar comanda existe y estado "pedido" (en_espera)
        const comanda = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mesas');
        
        if (!comanda) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // Validar que la comanda esté en estado editable (en_espera = pedido)
        if (comanda.status !== 'en_espera') {
            return res.status(400).json({ 
                message: `No se puede eliminar platos. La comanda está en estado "${comanda.status}" y solo se pueden eliminar platos cuando está en estado "en_espera" (pedido).` 
            });
        }
        
        // 2. Validar índice de plato
        const index = parseInt(platoIndex);
        if (isNaN(index) || index < 0 || index >= comanda.platos.length) {
            return res.status(400).json({ message: 'Índice de plato inválido' });
        }
        
        const plato = comanda.platos[index];
        if (!plato) {
            return res.status(404).json({ message: 'Plato no encontrado en la comanda' });
        }
        
        // Validar que el plato no esté ya eliminado
        if (plato.eliminado) {
            return res.status(400).json({ message: 'Este plato ya fue eliminado' });
        }
        
        // 3. Marcar plato como ELIMINADO (soft delete) y guardar estado para posible eliminación automática de comanda
        const estadoPlato = (plato.estado || '').toLowerCase();
        plato.eliminado = true;
        plato.eliminadoPor = usuarioId;
        plato.eliminadoAt = new Date();
        plato.eliminadoRazon = razon || 'Eliminado por mozo';
        plato.estadoAlEliminar = plato.estado || null;
        plato.generoDesperdicio = estadoPlato === 'recoger';
        
        // 4. Registrar en historialPlatos
        if (!comanda.historialPlatos) {
            comanda.historialPlatos = [];
        }
        
        const platoModel = require('../database/models/plato.model');
        let nombrePlato = 'Plato desconocido';
        if (plato.plato) {
            if (typeof plato.plato === 'object' && plato.plato.nombre) {
                nombrePlato = plato.plato.nombre;
            } else {
                const platoCompleto = await platoModel.findById(plato.plato._id || plato.plato);
                if (platoCompleto) {
                    nombrePlato = platoCompleto.nombre;
                } else if (plato.platoId) {
                    const platoPorId = await platoModel.findOne({ id: plato.platoId });
                    if (platoPorId) {
                        nombrePlato = platoPorId.nombre;
                    }
                }
            }
        } else if (plato.platoId) {
            const platoPorId = await platoModel.findOne({ id: plato.platoId });
            if (platoPorId) {
                nombrePlato = platoPorId.nombre;
            }
        }
        
        comanda.historialPlatos.push({
            platoId: plato.platoId,
            nombreOriginal: nombrePlato,
            cantidadOriginal: comanda.cantidades[index] || 1,
            cantidadFinal: 0,
            estado: 'eliminado',
            timestamp: new Date(),
            usuario: usuarioId,
            motivo: razon || 'Plato eliminado de comanda'
        });
        
        // 5. Recalcular total comanda (solo platos activos) - si existe campo total
        // Nota: El total se calcula en el frontend, pero aquí podemos actualizar si existe
        
        comanda.version = (comanda.version || 1) + 1;
        await comanda.save();
        
        // 5.1 Si no quedan platos activos y todos los eliminados estaban en pedido/en_espera → eliminar comanda automáticamente
        const activosRestantes = comanda.platos.filter(p => p.eliminado !== true);
        if (activosRestantes.length === 0) {
            const estadoAlEliminar = (p) => (p.estadoAlEliminar || p.estado || '').toLowerCase();
            const todosEranPedido = comanda.platos.every(p => {
                const e = estadoAlEliminar(p);
                return e === 'pedido' || e === 'en_espera';
            });
            if (todosEranPedido) {
                comanda.IsActive = false;
                comanda.status = 'cancelado';
                comanda.fechaEliminacion = new Date();
                comanda.motivoEliminacion = 'Eliminación automática: todos los platos en pedido eliminados';
                comanda.eliminadaPor = usuarioId;
                await comanda.save();
                const mesaId = comanda.mesas?._id || comanda.mesas;
                if (mesaId) {
                    try {
                        await recalcularEstadoMesa(mesaId);
                    } catch (err) {
                        console.warn('[ELIMINAR PLATO] Error recalculando mesa:', err.message);
                    }
                }
                if (global.emitComandaEliminada) {
                    await global.emitComandaEliminada(id);
                }
                console.log(`Comanda #${comanda.comandaNumber} eliminada automáticamente porque todos sus platos en estado pedido fueron eliminados.`);
            }
        }
        
        // 6. Obtener comanda completa con populate para emitir
        const comandaCompleta = await comandaModel.findById(id)
            .populate({
                path: "mozos",
            })
            .populate({
                path: "mesas",
                populate: {
                    path: "area"
                }
            })
            .populate({
                path: "cliente"
            })
            .populate({
                path: "platos.plato",
                model: "platos"
            });
        
        // 7. Calcular auditoría (activos vs eliminados)
        const platosActivos = comandaCompleta.platos.filter(p => !p.eliminado).length;
        const platosEliminados = comandaCompleta.platos.filter(p => p.eliminado).length;
        
        // 8. BROADCAST a COCINA y MOZOS (solo comanda actualizada)
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(comandaCompleta._id);
        }
        
        // También emitir directamente con información de auditoría
        if (global.io) {
            const cocinaNamespace = global.io.of('/cocina');
            const mozosNamespace = global.io.of('/mozos');
            const fecha = require('moment-timezone')(comandaCompleta.createdAt).tz("America/Lima").format('YYYY-MM-DD');
            const roomName = `fecha-${fecha}`;
            const timestamp = require('moment-timezone')().tz('America/Lima').toISOString();
            
            const eventData = {
                comandaId: comandaCompleta._id,
                comanda: comandaCompleta,
                platoEliminado: {
                    index: index,
                    platoId: plato.platoId,
                    nombre: nombrePlato,
                    razon: razon || 'Eliminado por mozo',
                    eliminadoAt: plato.eliminadoAt
                },
                auditoria: {
                    activos: platosActivos,
                    eliminados: platosEliminados
                },
                socketId: 'server',
                timestamp: timestamp
            };
            
            // Emitir a cocina (room por fecha)
            cocinaNamespace.to(roomName).emit('comanda:plato-eliminado', eventData);
            
            // Emitir a mozos (todos)
            mozosNamespace.emit('comanda:plato-eliminado', eventData);
            
            // También emitir comanda-actualizada para sincronización completa
            cocinaNamespace.to(roomName).emit('comanda-actualizada', {
                comandaId: comandaCompleta._id,
                comanda: comandaCompleta,
                platosEliminados: comandaCompleta.historialPlatos?.filter(h => h.estado === 'eliminado') || [],
                auditoria: {
                    activos: platosActivos,
                    eliminados: platosEliminados
                },
                socketId: 'server',
                timestamp: timestamp
            });
            
            mozosNamespace.emit('comanda-actualizada', {
                comandaId: comandaCompleta._id,
                comanda: comandaCompleta,
                platosEliminados: comandaCompleta.historialPlatos?.filter(h => h.estado === 'eliminado') || [],
                auditoria: {
                    activos: platosActivos,
                    eliminados: platosEliminados
                },
                socketId: 'server',
                timestamp: timestamp
            });
        }
        
        // 9. Registrar auditoría
        req.auditoria = {
            accion: 'plato_eliminado',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        
        const snapshotAntes = {
            platos: [{
                platoId: plato.platoId,
                nombre: nombrePlato,
                cantidad: comanda.cantidades[index] || 1,
                estado: plato.estado,
                eliminado: false
            }]
        };
        
        const snapshotDespues = {
            platos: [{
                platoId: plato.platoId,
                nombre: nombrePlato,
                cantidad: comanda.cantidades[index] || 1,
                estado: plato.estado,
                eliminado: true,
                eliminadoRazon: razon || 'Eliminado por mozo',
                eliminadoAt: plato.eliminadoAt
            }]
        };
        
        await registrarAuditoria(req, snapshotAntes, snapshotDespues, razon || 'Plato eliminado');
        
        console.log(`✅ Plato eliminado de comanda #${comandaCompleta.comandaNumber}: ${nombrePlato} (Index: ${index})`);
        
        res.json({
            message: 'Plato marcado como eliminado',
            comanda: comandaCompleta,
            platoEliminado: {
                index: index,
                nombre: nombrePlato,
                razon: razon || 'Eliminado por mozo'
            },
            auditoria: {
                activos: platosActivos,
                eliminados: platosEliminados
            }
        });
        
    } catch (error) {
        console.error('❌ Error al eliminar plato:', error);
        res.status(500).json({ 
            message: 'Error al eliminar plato', 
            error: error.message 
        });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Editar platos con auditoría completa
 */
router.put('/comanda/:id/editar-platos', async (req, res) => {
    const { id } = req.params;
    const { platosNuevos, platosEliminados, motivo } = req.body;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    try {
        // Obtener snapshot antes de editar (con platos populados)
        const snapshotAntesRaw = await comandaModel.findById(id)
            .populate('platos.plato');
        if (!snapshotAntesRaw) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // Crear snapshot manual con nombres explícitos para auditoría
        const platoModel = require('../database/models/plato.model');
        const snapshotAntes = {
            _id: snapshotAntesRaw._id,
            comandaNumber: snapshotAntesRaw.comandaNumber,
            status: snapshotAntesRaw.status,
            platos: await Promise.all(snapshotAntesRaw.platos.map(async (p, idx) => {
                let nombrePlato = 'Plato desconocido';
                let precioPlato = 0;
                
                if (p.plato) {
                    if (typeof p.plato === 'object' && p.plato.nombre) {
                        nombrePlato = p.plato.nombre;
                        precioPlato = p.plato.precio || 0;
                    } else if (p.plato._id || p.plato) {
                        const platoCompleto = await platoModel.findById(p.plato._id || p.plato);
                        if (platoCompleto) {
                            nombrePlato = platoCompleto.nombre;
                            precioPlato = platoCompleto.precio || 0;
                        }
                    }
                } else if (p.platoId) {
                    // Buscar por platoId numérico
                    const platoCompleto = await platoModel.findOne({ id: p.platoId });
                    if (platoCompleto) {
                        nombrePlato = platoCompleto.nombre;
                        precioPlato = platoCompleto.precio || 0;
                    }
                }
                
                return {
                    platoId: p.platoId,
                    plato: p.plato?._id || p.plato,
                    nombre: nombrePlato,
                    precio: precioPlato,
                    cantidad: snapshotAntesRaw.cantidades?.[idx] || 1,
                    estado: p.estado
                };
            })),
            cantidades: [...(snapshotAntesRaw.cantidades || [])],
            observaciones: snapshotAntesRaw.observaciones
        };
        
        const comanda = await editarConAuditoria(
            id, 
            platosNuevos || [], 
            platosEliminados || [], 
            usuarioId,
            motivo || 'Edición de platos'
        );
        
        // Obtener comanda completa con populate para historial y auditoría
        // IMPORTANTE: Recargar desde BD para asegurar que tenemos la versión actualizada
        const comandaConPlatosRaw = await comandaModel.findById(id)
            .populate('platos.plato');
        
        console.log(`📋 Comanda actualizada - Platos en BD: ${comandaConPlatosRaw.platos.length}`);
        
        // Crear snapshot después con nombres explícitos para auditoría
        const comandaConPlatos = {
            _id: comandaConPlatosRaw._id,
            comandaNumber: comandaConPlatosRaw.comandaNumber,
            status: comandaConPlatosRaw.status,
            platos: await Promise.all(comandaConPlatosRaw.platos.map(async (p, idx) => {
                let nombrePlato = 'Plato desconocido';
                let precioPlato = 0;
                
                if (p.plato) {
                    if (typeof p.plato === 'object' && p.plato.nombre) {
                        nombrePlato = p.plato.nombre;
                        precioPlato = p.plato.precio || 0;
                    } else if (p.plato._id || p.plato) {
                        const platoCompleto = await platoModel.findById(p.plato._id || p.plato);
                        if (platoCompleto) {
                            nombrePlato = platoCompleto.nombre;
                            precioPlato = platoCompleto.precio || 0;
                        }
                    }
                } else if (p.platoId) {
                    // Buscar por platoId numérico
                    const platoCompleto = await platoModel.findOne({ id: p.platoId });
                    if (platoCompleto) {
                        nombrePlato = platoCompleto.nombre;
                        precioPlato = platoCompleto.precio || 0;
                    }
                }
                
                return {
                    platoId: p.platoId,
                    plato: p.plato?._id || p.plato,
                    nombre: nombrePlato,
                    precio: precioPlato,
                    cantidad: comandaConPlatosRaw.cantidades?.[idx] || 1,
                    estado: p.estado
                };
            })),
            cantidades: [...(comandaConPlatosRaw.cantidades || [])],
            observaciones: comandaConPlatosRaw.observaciones,
            historialPlatos: comandaConPlatosRaw.historialPlatos || []
        };
        
        // Guardar versión completa en historial
        await HistorialComandas.create({
            comandaId: id,
            version: comanda.version,
            status: comanda.status,
            platos: comandaConPlatos.platos.map((p, idx) => {
                let nombrePlato = 'Plato desconocido';
                let precioPlato = 0;
                
                if (p.plato) {
                    if (typeof p.plato === 'object' && p.plato.nombre) {
                        nombrePlato = p.plato.nombre;
                        precioPlato = p.plato.precio || 0;
                    }
                }
                
                return {
                    plato: p.plato?._id || p.plato,
                    platoId: p.platoId,
                    estado: p.estado,
                    cantidad: comandaConPlatos.cantidades[idx] || 1,
                    nombre: nombrePlato,
                    precio: precioPlato
                };
            }),
            cantidades: comandaConPlatos.cantidades,
            observaciones: comandaConPlatos.observaciones,
            usuario: usuarioId,
            accion: 'editada',
            motivo: motivo || 'Edición de platos'
        });
        
        // Registrar auditoría (usar comanda con platos populados)
        req.auditoria = {
            accion: 'comanda_editada',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        await registrarAuditoria(req, snapshotAntes, comandaConPlatos, motivo);
        
        // Obtener comanda completa con populate para emitir
        const comandaCompletaRaw = await comandaModel.findById(id)
            .populate({
                path: "mozos",
            })
            .populate({
                path: "mesas",
                populate: {
                    path: "area"
                }
            })
            .populate({
                path: "cliente"
            })
            .populate({
                path: "platos.plato",
                model: "platos"
            });
        
        // Asegurar que los nombres estén en historialPlatos
        if (comandaCompletaRaw.historialPlatos && comandaCompletaRaw.historialPlatos.length > 0) {
            for (let i = 0; i < comandaCompletaRaw.historialPlatos.length; i++) {
                const h = comandaCompletaRaw.historialPlatos[i];
                if (!h.nombreOriginal || h.nombreOriginal === 'Plato desconocido' || h.nombreOriginal === 'Sin nombre') {
                    // Buscar el plato por platoId
                    const plato = await platoModel.findOne({ id: h.platoId });
                    if (plato) {
                        comandaCompletaRaw.historialPlatos[i].nombreOriginal = plato.nombre;
                    }
                }
            }
        }
        
        // Usar comanda completa populada para emitir
        const comandaCompleta = comandaCompletaRaw;
        
        // Emitir evento Socket.io a cocina y mozos
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(comandaCompleta._id);
        }
        
        // También emitir directamente a los namespaces si están disponibles
        if (global.io) {
            const cocinaNamespace = global.io.of('/cocina');
            const mozosNamespace = global.io.of('/mozos');
            const fechaActual = new Date().toISOString().split('T')[0];
            const roomName = `fecha-${fechaActual}`;
            
            // Obtener platos eliminados del historial con nombres correctos
            const platosEliminadosHistorial = [];
            if (comandaCompleta.historialPlatos && comandaCompleta.historialPlatos.length > 0) {
                for (const h of comandaCompleta.historialPlatos) {
                    if (h.estado === 'eliminado') {
                        let nombrePlato = h.nombreOriginal;
                        // Si no tiene nombre, buscarlo
                        if (!nombrePlato || nombrePlato === 'Plato desconocido' || nombrePlato === 'Sin nombre') {
                            const plato = await platoModel.findOne({ id: h.platoId });
                            if (plato) {
                                nombrePlato = plato.nombre;
                            }
                        }
                        platosEliminadosHistorial.push({
                            ...h,
                            nombreOriginal: nombrePlato
                        });
                    }
                }
            }
            
            // Emitir a cocina (room por fecha) - Incluir información de platos eliminados
            cocinaNamespace.to(roomName).emit('comanda-actualizada', {
                comanda: comandaCompleta,
                platosEliminados: platosEliminadosHistorial,
                socketId: 'server',
                timestamp: new Date().toISOString()
            });
            
            // Emitir a mozos (todos) - Incluir información de platos eliminados
            mozosNamespace.emit('comanda-actualizada', {
                comanda: comandaCompleta,
                platosEliminados: platosEliminadosHistorial,
                socketId: 'server',
                timestamp: new Date().toISOString()
            });
            
            console.log(`📤 [AUDITORÍA] Evento comanda-actualizada emitido para comanda ${id} (platos editados)`);
        }
        
        res.json(comandaCompleta);
    } catch (error) {
        console.error('❌ Error al editar platos:', error.message);
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message || 'Error al editar la comanda' });
    }
});

router.put("/comanda/:id", async (req, res) => {
    const { id } = req.params;
    const newData = req.body;
    try {
      const updatedComanda = await actualizarComanda(id, newData);
      res.json(updatedComanda);
      console.log("Comanda actualizada exitosamente");
      
      // Emitir evento Socket.io de comanda actualizada
      if (global.emitComandaActualizada) {
        await global.emitComandaActualizada(id);
      }
    } catch (error) {
      console.error(error.message);
      res.status(400).json({ message: error.message });
    }
  });

router.put('/comanda/:id/status', async (req, res) => {
    const { id } = req.params;
    const { nuevoStatus, motivo } = req.body;
    
    // Extraer información del usuario y dispositivo desde headers o body
    const usuarioId = req.body.usuarioId || req.headers['x-user-id'] || null;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || null;
    const sourceApp = req.body.sourceApp || req.headers['x-source-app'] || 'api';
    
    try {
        // Obtener estado anterior para auditoría
        const comandaAntes = await comandaModel.findById(id);
        const estadoAnterior = comandaAntes?.status || 'en_espera';
        
        const options = {
            usuario: usuarioId,
            deviceId,
            sourceApp,
            motivo
        };
        
        const updatedComanda = await cambiarStatusComanda(id, nuevoStatus, options);
        res.json(updatedComanda);
        logger.info("Estado de la comanda actualizado exitosamente", {
            comandaId: id,
            nuevoStatus,
            usuarioId,
            sourceApp
        });
        
        // Registrar auditoría si es una reversión (vuelve a en_espera desde recoger/entregado)
        if (nuevoStatus === 'en_espera' && (estadoAnterior === 'recoger' || estadoAnterior === 'entregado')) {
            req.auditoria = {
                accion: 'reversion_comanda',
                entidadId: id,
                entidadTipo: 'comanda',
                usuario: usuarioId,
                ip: req.ip,
                motivo: motivo || 'Reversión de comanda'
            };
            
            const snapshotAntes = {
                comandaNumber: comandaAntes?.comandaNumber,
                estado: estadoAnterior
            };
            
            const snapshotDespues = {
                comandaNumber: comandaAntes?.comandaNumber,
                estado: nuevoStatus
            };
            
            await registrarAuditoria(req, snapshotAntes, snapshotDespues, motivo || 'Reversión de comanda');
            console.log('✅ Auditoría de reversión de comanda registrada');
        }
        
        // Emitir evento Socket.io de comanda actualizada
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }
    } catch (error) {
        handleError(error, res, logger);
    }
});

router.put('/comanda/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { nuevoEstado } = req.body;

    try {
        const updatedComanda = await cambiarEstadoComanda(id, nuevoEstado);
        res.json(updatedComanda);
        console.log("Estado de la comanda actualizado exitosamente");
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ message: error.message });
    }
});

// v5.5: PUT /api/comanda/:id/prioridad - Actualizar prioridad de comanda
router.put('/comanda/:id/prioridad', async (req, res) => {
    const { id } = req.params;
    const { prioridadOrden } = req.body;

    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de comanda inválido' });
        }

        const comanda = await comandaModel.findByIdAndUpdate(
            id,
            { prioridadOrden: prioridadOrden || 0, updatedAt: new Date() },
            { new: true }
        )
        .populate('mozos', 'name DNI')
        .populate('mesas', 'nummesa estado area')
        .populate('platos.plato', 'nombre precio categoria')
        .lean();

        if (!comanda) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }

        // Emitir evento Socket.io para que cocina actualice en tiempo real
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }

        res.json(comanda);
        logger.info(`Prioridad de comanda ${id} actualizada a ${prioridadOrden}`);
    } catch (error) {
        logger.error('Error al actualizar prioridad', { error: error.message, id });
        handleError(error, res, logger);
    }
});

router.put('/comanda/:id/plato/:platoId/estado', async (req, res) => {
    const { id, platoId } = req.params;
    const { nuevoEstado, motivo } = req.body;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;

    // Validar que nuevoEstado sea válido
    const estadosValidos = ['recoger', 'entregado', 'en_espera', 'pedido'];
    if (!nuevoEstado || !estadosValidos.includes(nuevoEstado)) {
        return res.status(400).json({ 
            error: `Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}`,
            recibido: nuevoEstado
        });
    }

    try {
        console.log(`🔄 [PUT /plato/:platoId/estado] Comanda ${id}, Plato ${platoId}, Nuevo estado: ${nuevoEstado}`);
        
        // Obtener estado anterior para auditoría
        const comandaAntes = await comandaModel.findById(id);
        if (!comandaAntes) {
            return res.status(404).json({ error: 'Comanda no encontrada', comandaId: id });
        }
        
        // Buscar plato para obtener estado anterior (usar misma lógica que el repository)
        const platoAntes = comandaAntes.platos?.find(p => {
            return (p._id?.toString() === platoId.toString()) ||
                   (p.platoId?.toString() === platoId.toString()) ||
                   (p.plato?.toString() === platoId.toString());
        });
        
        if (!platoAntes) {
            console.error(`❌ [PUT /plato/:platoId/estado] Plato ${platoId} no encontrado en comanda ${id}`);
            console.error(`   Platos disponibles:`, comandaAntes.platos?.map(p => ({
                _id: p._id?.toString(),
                platoId: p.platoId,
                estado: p.estado
            })));
            return res.status(404).json({ 
                error: 'Plato no encontrado en la comanda',
                platoId: platoId,
                comandaId: id
            });
        }
        
        const estadoAnterior = platoAntes.estado || 'en_espera';

        const updatedComanda = await cambiarEstadoPlato(id, platoId, nuevoEstado);
        
        console.log(`✅ [PUT /plato/:platoId/estado] Estado actualizado: ${estadoAnterior} → ${nuevoEstado}`);
        res.json({ 
            success: true, 
            message: 'Estado del plato actualizado exitosamente',
            platoId: platoId,
            estadoAnterior: estadoAnterior,
            nuevoEstado: nuevoEstado,
            comandaStatus: updatedComanda.status,
            comanda: updatedComanda
        });
        
        // Registrar auditoría si es una reversión (vuelve a en_espera desde recoger)
        if (nuevoEstado === 'en_espera' && (estadoAnterior === 'recoger' || estadoAnterior === 'entregado')) {
            req.auditoria = {
                accion: 'reversion_plato',
                entidadId: id,
                entidadTipo: 'comanda',
                usuario: usuarioId,
                ip: req.ip,
                motivo: motivo || 'Reversión de plato a preparación'
            };
            
            const snapshotAntes = {
                platoId: platoId,
                nombre: platoAntes?.plato?.nombre || platoAntes?.nombre || 'Plato',
                estado: estadoAnterior
            };
            
            const snapshotDespues = {
                platoId: platoId,
                nombre: platoAntes?.plato?.nombre || platoAntes?.nombre || 'Plato',
                estado: nuevoEstado
            };
            
            await registrarAuditoria(req, snapshotAntes, snapshotDespues, motivo || 'Reversión de plato a preparación');
            console.log('✅ Auditoría de reversión registrada');
        }
        
        // Emitir evento Socket.io de plato actualizado
        if (global.emitPlatoActualizado) {
            await global.emitPlatoActualizado(id, platoId, nuevoEstado);
        }
        
        // También emitir comanda actualizada para refrescar toda la comanda
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }
    } catch (error) {
        console.error('❌ [PUT /plato/:platoId/estado] Error:', error.message);
        
        // Determinar código de estado HTTP apropiado
        let statusCode = 400;
        if (error.message.includes('no encontrada') || error.message.includes('no encontrado')) {
            statusCode = 404;
        }
        
        res.status(statusCode).json({ 
            error: error.message,
            platoId: platoId,
            comandaId: id
        });
    }
});

/**
 * PUT /comanda/:id/actualizar-estados-platos
 * Actualiza los estados de múltiples platos en una comanda (para edición admin)
 */
router.put('/comanda/:id/actualizar-estados-platos', async (req, res) => {
    const { id } = req.params;
    const { platos } = req.body; // Array de { index, estado }
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || 'admin';

    if (!platos || !Array.isArray(platos) || platos.length === 0) {
        return res.status(400).json({ message: 'No hay platos para actualizar' });
    }

    try {
        const comanda = await comandaModel.findById(id);
        if (!comanda) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }

        const cambiosRealizados = [];
        const errores = [];

        platos.forEach(item => {
            const index = parseInt(item.index);
            const nuevoEstado = item.estado;

            if (isNaN(index) || index < 0 || index >= comanda.platos.length) {
                errores.push(`Índice ${index} inválido`);
                return;
            }

            const platoItem = comanda.platos[index];
            if (platoItem.eliminado) {
                errores.push(`Plato en índice ${index} está eliminado`);
                return;
            }

            // Actualizar estado del plato
            const estadoAnterior = platoItem.estado;
            platoItem.estado = nuevoEstado;
            cambiosRealizados.push({
                index,
                estadoAnterior,
                nuevoEstado
            });
        });

        if (errores.length > 0) {
            return res.status(400).json({ 
                message: 'Algunos platos no pudieron ser actualizados',
                detalles: errores
            });
        }

        // Recalcular estado de la comanda basado en los platos
        const resultadoRecalculo = await recalcularEstadoComandaPorPlatos(id);

        comanda.version = (comanda.version || 1) + 1;
        await comanda.save();

        // Emitir eventos socket
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }

        logger.info('Estados de platos actualizados', {
            comandaId: id,
            cambios: cambiosRealizados.length,
            usuarioId
        });

        res.json({
            success: true,
            comanda,
            cambios: cambiosRealizados,
            recalculo: resultadoRecalculo
        });

    } catch (error) {
        logger.error('Error al actualizar estados de platos', {
            comandaId: id,
            error: error.message
        });
        res.status(500).json({ message: error.message });
    }
});

// Nuevo endpoint: Marcar plato como entregado (solo desde estado "recoger")
router.put('/comanda/:comandaId/plato/:platoId/entregar', async (req, res) => {
    const { comandaId, platoId } = req.params;
    
    try {
        const comandaActualizada = await marcarPlatoComoEntregado(comandaId, platoId);
        res.json({ success: true, comanda: comandaActualizada });
        logger.info('Plato marcado como entregado', { comandaId, platoId });
    } catch (error) {
        logger.error('Error al marcar plato como entregado', {
            comandaId,
            platoId,
            error: error.message
        });
        res.status(400).json({ error: error.message });
    }
});

router.put('/comanda/:id/revertir/:nuevoStatus', async (req, res) => {
    const { id, nuevoStatus } = req.params;
    // Obtener usuarioId del request (puede venir de req.user si hay autenticación)
    const usuarioId = req.userId || req.body.usuarioId || 'sistema';
    
    try {
        const result = await revertirStatusComanda(id, nuevoStatus, usuarioId);
        res.json(result);
        console.log(`✅ Comanda ${id} revertida exitosamente a "${nuevoStatus}" - Mesa ${result.mesa?.nummesa || 'N/A'} → ${result.mesa?.estado || 'N/A'}`);
    } catch (error) {
        console.error('❌ Error al revertir comanda:', error.message);
        res.status(400).json({ error: error.message });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Obtener comandas listas para pagar de una mesa
 * GET /comanda/comandas-para-pagar/:mesaId
 * Filtra solo comandas activas con status 'preparado', 'recoger' o 'entregado' y platos no eliminados
 */
router.get('/comanda/comandas-para-pagar/:mesaId', async (req, res) => {
  try {
    const { mesaId } = req.params;
    const comandaIdsParam = req.query.comandaIds;
    const comandaIds = comandaIdsParam
      ? comandaIdsParam.split(',').map(id => id.trim()).filter(Boolean)
      : null;

    // Si el cliente pasa comandaIds (ej. desde detalle de una comanda), solo devolver esas comandas
    // para evitar mostrar comandas de pedidos anteriores en mesas reutilizadas.
    const comandas = await getComandasParaPagar(mesaId, comandaIds);
    
    // 🔥 CORREGIDO: Calcular total pendiente considerando descuentos
    // Si la comanda tiene descuento, usar totalCalculado (ya tiene el descuento aplicado)
    const totalPendiente = comandas.reduce((sum, c) => {
      // Si la comanda tiene descuento aplicado, usar totalCalculado (puede ser 0 para 100%)
      if (c.descuento > 0 && c.totalCalculado != null) {
        return sum + c.totalCalculado;
      }
      // Si no tiene descuento, calcular normalmente
      return sum + c.platos.reduce((s, p, i) => {
        if (!p.eliminado) {
          const cantidad = c.cantidades?.[i] || 1;
          const precio = p.plato?.precio || p.precio || 0;
          return s + (precio * cantidad);
        }
        return s;
      }, 0);
    }, 0);

    // Obtener información de la mesa desde la primera comanda
    const mesaInfo = comandas[0]?.mesas || null;

    res.json({
      mesa: { 
        _id: mesaId, 
        nummesa: mesaInfo?.nummesa || null 
      },
      comandas,
      totalPendiente,
      cantidadComandas: comandas.length
    });
  } catch (error) {
    logger.error('Error en GET /comanda/comandas-para-pagar/:mesaId', {
      mesaId: req.params.mesaId,
      error: error.message,
      stack: error.stack
    });
    handleError(error, res, logger);
  }
});

/**
 * PUT eliminar-platos: soft-delete. Permitir pedido/en_espera/recoger. RECHAZAR entregado.
 * PUT /comanda/:id/eliminar-platos
 * Permite eliminar múltiples platos de una comanda que estén en estado "entregado" o "recoger"
 */
router.put('/comanda/:id/eliminar-platos', async (req, res) => {
    const { id } = req.params;
    const { platosAEliminar, motivo, mozoId, forzarAdmin } = req.body;
    const usuarioId = req.userId || mozoId || req.body?.usuarioId || req.headers['x-user-id'] || null;

    // Validaciones
    if (!platosAEliminar || !Array.isArray(platosAEliminar) || platosAEliminar.length === 0) {
        return res.status(400).json({ message: 'Debe seleccionar al menos un plato para eliminar' });
    }

    if (!motivo || motivo.trim().length < 5) {
        return res.status(400).json({ message: 'El motivo de eliminación es obligatorio (mínimo 5 caracteres)' });
    }
    
    try {
        // 1. Obtener comanda para validación (con lean para lectura rápida)
        const comandaCheck = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mesas')
            .populate('mozos')
            .lean();
        
        if (!comandaCheck) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        // 2. Validar que los índices sean válidos
        const indicesValidos = platosAEliminar.filter(idx => {
            const index = parseInt(idx);
            return !isNaN(index) && index >= 0 && index < comandaCheck.platos.length;
        });
        
        if (indicesValidos.length === 0) {
            return res.status(400).json({ message: 'Índices de platos inválidos' });
        }
        
        // Validación: RECHAZAR solo platos en "entregado". Permitir pedido, en_espera, recoger.
        // Si forzarAdmin es true, permitir eliminar platos entregados (para panel admin)
        const platosInvalidos = [];
        const platosEntregadosAEliminar = [];
        indicesValidos.forEach(idx => {
            const index = parseInt(idx);
            const platoItem = comandaCheck.platos[index];
            if (!platoItem) {
                platosInvalidos.push(`Índice ${index} no existe`);
            } else if (platoItem.eliminado) {
                platosInvalidos.push(`Plato en índice ${index} ya fue eliminado`);
            } else {
                const estado = (platoItem.estado || '').toLowerCase();
                if (estado === 'entregado') {
                    if (forzarAdmin) {
                        // Admin puede eliminar platos entregados, lo registramos para auditoría
                        platosEntregadosAEliminar.push(index);
                    } else {
                        platosInvalidos.push('No se puede eliminar este plato porque ya fue entregado al cliente. Para devoluciones use el flujo de reembolsos.');
                    }
                }
            }
        });
        if (platosInvalidos.length > 0) {
            return res.status(400).json({ 
                message: 'Algunos platos no pueden ser eliminados',
                detalles: platosInvalidos
            });
        }
        
        // 4. Obtener snapshot antes de eliminar para auditoría y calcular total
        const platoModel = require('../database/models/plato.model');
        const platosEliminadosData = [];
        let totalEliminado = 0;
        
        indicesValidos.forEach(idx => {
            const index = parseInt(idx);
            const platoItem = comandaCheck.platos[index];
            const plato = platoItem.plato || platoItem;
            const cantidad = comandaCheck.cantidades?.[index] || 1;
            const precio = plato?.precio || 0;
            const subtotal = precio * cantidad;
            totalEliminado += subtotal;
            
            platosEliminadosData.push({
                index: index,
                platoId: platoItem.platoId,
                nombre: plato?.nombre || 'Plato desconocido',
                cantidad: cantidad,
                precioUnit: precio,
                subtotal: subtotal,
                estado: platoItem.estado
            });
        });
        
        // Enriquecer platosEliminadosData para auditoría y desperdicio
        platosEliminadosData.forEach(platoData => {
            platoData.eliminadoPor = usuarioId;
            platoData.eliminadoAt = new Date();
            platoData.razon = motivo.trim();
            const estadoLower = (platoData.estado || '').toLowerCase();
            platoData.generoDesperdicio = estadoLower === 'recoger' || estadoLower === 'entregado';
        });
        
        const comandaActualizar = await comandaModel.findById(id);
        if (!comandaActualizar) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        const idAntes = comandaActualizar._id.toString();
        const ahora = new Date();
        
        // SOFT DELETE: marcar platos como eliminados (no splice)
        indicesValidos.forEach(idx => {
            const index = parseInt(idx);
            const platoItem = comandaActualizar.platos[index];
            if (!platoItem || platoItem.eliminado) return;
            const estado = (platoItem.estado || '').toLowerCase();
            platoItem.eliminado = true;
            platoItem.eliminadoPor = usuarioId;
            platoItem.eliminadoAt = ahora;
            platoItem.eliminadoRazon = motivo.trim();
            platoItem.estadoAlEliminar = platoItem.estado || null;
            // Marcar como desperdicio si ya estaba en recoger o entregado
            platoItem.generoDesperdicio = estado === 'recoger' || estado === 'entregado';
        });
        
        if (comandaActualizar.historialPlatos && Array.isArray(comandaActualizar.historialPlatos)) {
            platosEliminadosData.forEach(platoData => {
                comandaActualizar.historialPlatos.push({
                    platoId: platoData.platoId,
                    nombreOriginal: platoData.nombre,
                    cantidadOriginal: platoData.cantidad,
                    cantidadFinal: 0,
                    estado: 'eliminado',
                    timestamp: ahora,
                    usuario: usuarioId,
                    motivo: motivo.trim()
                });
            });
        }
        
        const platosActivosRestantes = comandaActualizar.platos.filter(p => p.eliminado !== true);
        const todosPlatosEliminados = platosActivosRestantes.length === 0;
        // Solo considerar "eliminación automática de comanda" si todos los platos eliminados estaban en pedido/en_espera
        const todosEliminadosEranPedido = !platosEliminadosData.some(p => p.generoDesperdicio);
        
        if (todosPlatosEliminados) {
            comandaActualizar.IsActive = false;
            comandaActualizar.status = 'cancelado';
            comandaActualizar.fechaEliminacion = ahora;
            comandaActualizar.motivoEliminacion = todosEliminadosEranPedido
                ? 'Eliminación automática: todos los platos en pedido eliminados'
                : motivo.trim();
            comandaActualizar.eliminadaPor = usuarioId;
            if (todosEliminadosEranPedido) {
                console.log(`Comanda #${comandaActualizar.comandaNumber} eliminada automáticamente porque todos sus platos en estado pedido fueron eliminados. No quedan platos activos.`);
            }
        }
        
        const mesaId = comandaActualizar.mesas?._id || comandaActualizar.mesas;
        
        comandaActualizar.version = (comandaActualizar.version || 1) + 1;
        await comandaActualizar.save();
        
        if (todosPlatosEliminados && mesaId) {
            try {
                await recalcularEstadoMesa(mesaId);
                console.log(`[ELIMINAR PLATOS] Estado de mesa ${mesaId} recalculado tras eliminación automática de comanda.`);
            } catch (err) {
                console.warn('[ELIMINAR PLATOS] Error recalculando estado de mesa:', err.message);
            }
        }
        
        if (!todosPlatosEliminados) {
            await recalcularEstadoComandaPorPlatos(id);
        }
        
        const idDespues = comandaActualizar._id.toString();
        console.log(`[ELIMINAR PLATOS] ID después de save: ${idDespues}`);
        
        if (idAntes !== idDespues) {
            console.error(`❌ [ELIMINAR PLATOS] ERROR CRÍTICO: ID cambió después de save!`);
            console.error(`   Antes: ${idAntes}`);
            console.error(`   Después: ${idDespues}`);
            // No lanzar error, pero registrar para debugging
            // El ID no debería cambiar nunca en MongoDB
        } else {
            console.log(`✅ [ELIMINAR PLATOS] ID verificado correctamente (no cambió)`);
        }
        
        // 9. Obtener comanda completa actualizada para respuesta
        const comandaCompleta = await comandaModel.findById(id)
            .populate({
                path: "mozos",
            })
            .populate({
                path: "mesas",
                populate: {
                    path: "area"
                }
            })
            .populate({
                path: "cliente"
            })
            .populate({
                path: "platos.plato",
                model: "platos"
            });
        
        // 10. Determinar acción de auditoría según el estado de los platos eliminados
        const estadosPlatosEliminados = indicesValidos.map(idx => {
            const index = parseInt(idx);
            const platoItem = comandaCheck.platos[index];
            return platoItem?.estado?.toLowerCase() || "";
        });
        const tieneRecoger = estadosPlatosEliminados.some(e => e === "recoger");
        const accionAuditoria = tieneRecoger ? 'ELIMINAR_PLATO_RECOGER' : 'ELIMINAR_PLATO_COMANDA';
        
        // 11. Registrar auditoría
        req.auditoria = {
            accion: accionAuditoria,
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            mesaId: comandaCheck.mesas?._id || comandaCheck.mesas,
            comandaId: id,
            motivo: motivo.trim(),
            platosEliminados: platosEliminadosData,
            totalEliminado: totalEliminado,
            comandaNumber: comandaCheck.comandaNumber,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        
        const metadataAdicional = {
            comandaNumber: comandaCheck.comandaNumber,
            mesaId: comandaCheck.mesas?._id || comandaCheck.mesas,
            mesaNum: comandaCheck.mesas?.nummesa || null,
            platosEliminados: platosEliminadosData,
            totalEliminado: totalEliminado,
            cantidadPlatos: platosEliminadosData.length
        };
        
        req.auditoria.metadata = { ...req.auditoria.metadata, ...metadataAdicional };
        
        const snapshotAntes = {
            platos: indicesValidos.map(idx => {
                const index = parseInt(idx);
                const platoItem = comandaCheck.platos[index];
                const plato = platoItem.plato || platoItem;
                return {
                    index: index,
                    nombre: plato?.nombre || 'Plato desconocido',
                    cantidad: comandaCheck.cantidades?.[index] || 1,
                    estado: platoItem.estado,
                    eliminado: false
                };
            })
        };
        
        const snapshotDespues = {
            platos: indicesValidos.map(idx => {
                const index = parseInt(idx);
                const platoItem = comandaCheck.platos[index];
                const plato = platoItem.plato || platoItem;
                return {
                    index: index,
                    nombre: plato?.nombre || 'Plato desconocido',
                    cantidad: comandaCheck.cantidades?.[index] || 1,
                    estado: platoItem.estado,
                    eliminado: true,
                    eliminadoRazon: motivo.trim(),
                    eliminadoAt: new Date()
                };
            })
        };
        
        // Registrar auditoría (registrarAuditoria ya guarda en auditoriaAcciones, no duplicar)
        // Asegurar que los datos de platos eliminados estén en el formato correcto para el frontend
        req.auditoria.platosEliminados = platosEliminadosData;
        req.auditoria.totalEliminado = totalEliminado;
        req.auditoria.cantidadPlatos = platosEliminadosData.length;
        
        await registrarAuditoria(req, snapshotAntes, snapshotDespues, motivo.trim());
        
        // 12. Emitir eventos Socket.io
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(comandaCompleta._id);
        }
        
        if (global.io) {
            const cocinaNamespace = global.io.of('/cocina');
            const mozosNamespace = global.io.of('/mozos');
            const fecha = require('moment-timezone')(comandaCompleta.createdAt).tz("America/Lima").format('YYYY-MM-DD');
            const roomName = `fecha-${fecha}`;
            const timestamp = require('moment-timezone')().tz('America/Lima').toISOString();
            
            const eventData = {
                comandaId: comandaCompleta._id,
                comanda: comandaCompleta,
                platosEliminados: platosEliminadosData,
                motivo: motivo.trim(),
                mozoId: usuarioId,
                socketId: 'server',
                timestamp: timestamp
            };
            
            cocinaNamespace.to(roomName).emit('plato-actualizado', eventData);
            cocinaNamespace.to(roomName).emit('comanda-actualizada', eventData);
            mozosNamespace.emit('plato-actualizado', eventData);
            mozosNamespace.emit('comanda-actualizada', eventData);
            
            // Notificación urgente a cocina cuando se eliminaron platos ya listos (recoger) para que detengan preparación
            const platosConDesperdicio = platosEliminadosData.filter(p => p.generoDesperdicio);
            if (platosConDesperdicio.length > 0) {
                cocinaNamespace.to(roomName).emit('plato-cancelado-urgente', {
                    comandaId: comandaCompleta._id,
                    comandaNumber: comandaCompleta.comandaNumber,
                    platos: platosConDesperdicio.map(p => ({ nombre: p.nombre, motivo: motivo.trim() })),
                    motivo: motivo.trim(),
                    timestamp,
                    urgencia: true
                });
            }
        }
        
        if (todosPlatosEliminados && todosEliminadosEranPedido && global.emitComandaEliminada) {
            await global.emitComandaEliminada(id);
        }
        
        console.log(`✅ Platos eliminados (soft) de comanda #${comandaCompleta.comandaNumber}: ${indicesValidos.length} plato(s)`);
        console.log(`[ELIMINAR PLATOS] Response preparado:`, {
            comandaId: comandaCompleta._id.toString(),
            mismoID: idAntes === comandaCompleta._id.toString(),
            comandaEliminadaCompleta: todosPlatosEliminados,
            platosEliminados: indicesValidos.length,
            platosRestantes: comandaCompleta.platos.length
        });
        
        const platosRestantesCount = (comandaCompleta.platos || []).filter(p => p.eliminado !== true).length;
        res.json({
            message: 'Platos eliminados exitosamente',
            comanda: comandaCompleta,
            platosEliminados: platosEliminadosData,
            totalEliminado: totalEliminado,
            comandaEliminadaCompleta: todosPlatosEliminados || false,
            platosRestantes: platosRestantesCount,
            idVerificado: idAntes === comandaCompleta._id.toString()
        });
        
    } catch (error) {
        console.error('❌ Error al eliminar platos de comanda:', error);
        logger.error('Error en PUT /comanda/:id/eliminar-platos', {
            id,
            error: error.message,
            stack: error.stack
        });
        handleError(error, res, logger);
    }
});

/**
 * ✅ NUEVO ENDPOINT: Anular plato individual desde cocina
 * PUT /api/comanda/:id/anular-plato/:platoIndex
 */
router.put('/comanda/:id/anular-plato/:platoIndex', async (req, res) => {
    const { id, platoIndex } = req.params;
    const { motivo, observaciones, forzarAdmin } = req.body;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    const sourceApp = req.body.sourceApp || req.headers['x-source-app'] || 'cocina';
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || null;

    // Validar que el motivo sea obligatorio
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({ 
            message: 'El motivo de anulación es obligatorio' 
        });
    }

    // Motivos válidos
    const motivosValidos = ['producto_roto', 'insumo_agotado', 'error_preparacion', 'cliente_cancelo', 'otro'];
    if (!motivosValidos.includes(motivo)) {
        return res.status(400).json({ 
            message: `Motivo inválido. Debe ser uno de: ${motivosValidos.join(', ')}` 
        });
    }

    try {
        const resultado = await anularPlato(
            id, 
            platoIndex, 
            motivo, 
            observaciones || '', 
            usuarioId, 
            sourceApp
        );

        // Registrar auditoría
        req.auditoria = {
            accion: 'PLATO_ANULADO_COCINA',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            mesaId: resultado.comanda.mesas?._id || resultado.comanda.mesas,
            comandaId: id,
            motivo: motivo + (observaciones ? ` - ${observaciones}` : ''),
            platoAnulado: resultado.platoAnulado,
            comandaNumber: resultado.comanda.comandaNumber,
            ip: req.ip,
            deviceId: deviceId,
            metadata: {
                tipoAnulacion: motivo,
                estadoAlAnular: resultado.platoAnulado.estadoAlAnular,
                sourceApp
            }
        };

        const snapshotAntes = {
            platoId: resultado.platoAnulado.platoId,
            nombre: resultado.platoAnulado.nombre,
            estado: resultado.platoAnulado.estadoAlAnular,
            anulado: false
        };

        const snapshotDespues = {
            platoId: resultado.platoAnulado.platoId,
            nombre: resultado.platoAnulado.nombre,
            estado: resultado.platoAnulado.estadoAlAnular,
            anulado: true,
            anuladoRazon: motivo,
            tipoAnulacion: motivo
        };

        await registrarAuditoria(req, snapshotAntes, snapshotDespues, motivo);

        // Emitir evento Socket.io
        if (global.emitPlatoAnulado) {
            await global.emitPlatoAnulado(id, resultado.platoAnulado);
        }

        // También emitir comanda-actualizada para sincronización general
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }

        logger.info(`✅ Plato anulado desde ${sourceApp}`, {
            comandaNumber: resultado.comanda.comandaNumber,
            platoNombre: resultado.platoAnulado.nombre,
            motivo,
            usuarioId
        });

        res.json({
            message: 'Plato anulado exitosamente',
            ...resultado
        });

    } catch (error) {
        logger.error('Error en PUT /comanda/:id/anular-plato/:platoIndex', {
            id,
            platoIndex,
            error: error.message,
            stack: error.stack
        });
        
        // Si es intento de anular comanda pagada, registrar en auditoría
        if (error.message.includes('ya pagada')) {
            req.auditoria = {
                accion: 'INTENTO_ANULACION_COMANDA_PAGADA',
                entidadId: id,
                entidadTipo: 'comanda',
                usuario: usuarioId,
                motivo: `Intento fallido: ${error.message}`,
                ip: req.ip,
                deviceId
            };
            await registrarAuditoria(req, null, null, 'Intento de anulación en comanda pagada');
        }
        
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Anular toda la comanda desde cocina
 * PUT /api/comanda/:id/anular-todo
 */
router.put('/comanda/:id/anular-todo', async (req, res) => {
    const { id } = req.params;
    const { motivo, observaciones } = req.body;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    const sourceApp = req.body.sourceApp || req.headers['x-source-app'] || 'cocina';
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || null;

    // Validar que el motivo sea obligatorio
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({ 
            message: 'El motivo de anulación es obligatorio' 
        });
    }

    // Motivos válidos
    const motivosValidos = ['producto_roto', 'insumo_agotado', 'error_preparacion', 'cliente_cancelo', 'otro'];
    if (!motivosValidos.includes(motivo)) {
        return res.status(400).json({ 
            message: `Motivo inválido. Debe ser uno de: ${motivosValidos.join(', ')}` 
        });
    }

    try {
        const resultado = await anularComandaCompleta(
            id, 
            motivo, 
            observaciones || '', 
            usuarioId, 
            sourceApp
        );

        // Registrar auditoría
        req.auditoria = {
            accion: 'COMANDA_ANULADA_COCINA',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            mesaId: resultado.mesaId,
            comandaId: id,
            motivo: motivo + (observaciones ? ` - ${observaciones}` : ''),
            platosAnulados: resultado.platosAnulados,
            totalAnulado: resultado.totalAnulado,
            comandaNumber: resultado.comandaNumber,
            ip: req.ip,
            deviceId: deviceId,
            metadata: {
                tipoAnulacion: motivo,
                cantidadPlatos: resultado.platosAnulados.length,
                totalAnulado: resultado.totalAnulado,
                sourceApp
            }
        };

        await registrarAuditoria(req, { comandaNumber: resultado.comandaNumber }, resultado, motivo);

        // Emitir evento Socket.io
        if (global.emitComandaAnulada) {
            await global.emitComandaAnulada(id, resultado.motivoGeneral);
        }

        // También emitir comanda-actualizada para sincronización general
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }

        logger.info(`✅ Comanda anulada completamente desde ${sourceApp}`, {
            comandaNumber: resultado.comandaNumber,
            cantidadPlatos: resultado.platosAnulados.length,
            totalAnulado: resultado.totalAnulado,
            motivo,
            usuarioId
        });

        res.json({
            message: 'Comanda anulada completamente',
            ...resultado
        });

    } catch (error) {
        logger.error('Error en PUT /comanda/:id/anular-todo', {
            id,
            error: error.message,
            stack: error.stack
        });
        
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Aplicar descuento a una comanda
 * PUT /api/comanda/:id/descuento
 * Solo usuarios con rol 'admin' o 'supervisor' pueden aplicar descuentos
 * Body: { descuento: number (0-100), motivo: string, usuarioId: string, usuarioRol: string }
 */
router.put('/comanda/:id/descuento', async (req, res) => {
    const { id } = req.params;
    const { descuento, motivo, usuarioId, usuarioRol } = req.body;
    const sourceApp = req.body.sourceApp || req.headers['x-source-app'] || 'api';
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || null;

    try {
        // Validar que el ID sea válido
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de comanda inválido' });
        }

        // Obtener snapshot antes del descuento para auditoría
        const comandaAntes = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mozos')
            .populate('mesas')
            .lean();

        if (!comandaAntes) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }

        // Calcular total antes del descuento
        let totalAntes = 0;
        for (let i = 0; i < comandaAntes.platos.length; i++) {
            const platoItem = comandaAntes.platos[i];
            if (platoItem.eliminado || platoItem.anulado) continue;
            const cantidad = comandaAntes.cantidades?.[i] || 1;
            const precio = platoItem.plato?.precio || 0;
            totalAntes += precio * cantidad;
        }

        // Aplicar descuento
        const resultado = await aplicarDescuento(id, descuento, motivo, usuarioId, usuarioRol);

        // Registrar auditoría
        req.auditoria = {
            accion: 'DESCUENTO_COMANDA',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            mesaId: resultado.comanda.mesas?._id || resultado.comanda.mesas,
            comandaId: id,
            motivo: motivo || 'Sin motivo especificado',
            descuento: descuento,
            comandaNumber: resultado.comanda.comandaNumber,
            ip: req.ip,
            deviceId: deviceId,
            metadata: {
                descuentoPorcentaje: descuento,
                motivoDescuento: motivo,
                totalAntes: totalAntes,
                totalDespues: resultado.descuentoAplicado.totalCalculado,
                montoAhorro: resultado.descuentoAplicado.montoDescuento,
                aplicadoPor: usuarioId,
                rolUsuario: usuarioRol,
                sourceApp
            }
        };

        const snapshotAntes = {
            comandaNumber: comandaAntes.comandaNumber,
            total: totalAntes,
            descuento: comandaAntes.descuento || 0
        };

        const snapshotDespues = {
            comandaNumber: resultado.comanda.comandaNumber,
            total: resultado.descuentoAplicado.totalCalculado,
            descuento: descuento,
            motivoDescuento: motivo,
            montoDescuento: resultado.descuentoAplicado.montoDescuento
        };

        await registrarAuditoria(req, snapshotAntes, snapshotDespues, motivo || 'Descuento aplicado');

        // Emitir evento Socket.io
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }

        logger.info(`✅ Descuento aplicado a comanda`, {
            comandaId: id,
            comandaNumber: resultado.comanda.comandaNumber,
            descuento: descuento,
            motivo: motivo?.substring(0, 50),
            usuarioId,
            usuarioRol,
            totalAntes,
            totalDespues: resultado.descuentoAplicado.totalCalculado
        });

        res.json({
            message: 'Descuento aplicado exitosamente',
            comanda: resultado.comanda,
            descuentoAplicado: resultado.descuentoAplicado
        });

    } catch (error) {
        logger.error('Error en PUT /comanda/:id/descuento', {
            id,
            error: error.message,
            stack: error.stack
        });
        
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ 
            message: error.message,
            error: 'ERROR_DESCUENTO'
        });
    }
});

/**
 * ✅ NUEVO ENDPOINT: Eliminar descuento de una comanda
 * DELETE /api/comanda/:id/descuento
 * Solo usuarios con rol 'admin' o 'supervisor' pueden eliminar descuentos
 * Body: { usuarioId: string, usuarioRol: string, motivoEliminacion: string }
 */
router.delete('/comanda/:id/descuento', async (req, res) => {
    const { id } = req.params;
    const { usuarioId, usuarioRol, motivoEliminacion } = req.body;
    const sourceApp = req.body.sourceApp || req.headers['x-source-app'] || 'api';
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || null;

    try {
        // Validar que el ID sea válido
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID de comanda inválido' });
        }

        // Validar rol
        const rolesPermitidos = ['admin', 'supervisor'];
        if (!rolesPermitidos.includes(usuarioRol)) {
            return res.status(403).json({ 
                message: `No autorizado. Solo usuarios con rol 'admin' o 'supervisor' pueden eliminar descuentos.` 
            });
        }

        // Obtener comanda
        const comanda = await comandaModel.findById(id)
            .populate('platos.plato')
            .populate('mozos')
            .populate('mesas');

        if (!comanda) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }

        // Verificar que tenga descuento
        if (!comanda.descuento || comanda.descuento === 0) {
            return res.status(400).json({ message: 'Esta comanda no tiene descuento aplicado' });
        }

        // Validar que la comanda no esté pagada
        if (comanda.status === 'pagado') {
            return res.status(400).json({ message: 'No se puede eliminar descuento de una comanda ya pagada' });
        }

        // Guardar valores para auditoría
        const descuentoAnterior = comanda.descuento;
        const motivoAnterior = comanda.motivoDescuento;
        const montoDescuentoAnterior = comanda.montoDescuento;

        // Calcular nuevo total sin descuento
        let subtotalActual = 0;
        for (let i = 0; i < comanda.platos.length; i++) {
            const platoItem = comanda.platos[i];
            if (platoItem.eliminado || platoItem.anulado) continue;
            const cantidad = comanda.cantidades?.[i] || 1;
            const precio = platoItem.plato?.precio || platoItem.precio || 0;
            subtotalActual += precio * cantidad;
        }

        const igvPorcentaje = 0.18;
        const nuevoTotal = subtotalActual * (1 + igvPorcentaje);

        // Eliminar descuento
        comanda.descuento = 0;
        comanda.motivoDescuento = null;
        comanda.descuentoAplicadoPor = null;
        comanda.descuentoAplicadoAt = null;
        comanda.montoDescuento = 0;
        comanda.totalSinDescuento = nuevoTotal;
        comanda.totalCalculado = nuevoTotal;
        comanda.precioTotal = subtotalActual;
        comanda.version = (comanda.version || 1) + 1;
        comanda.updatedAt = require('moment-timezone')().tz("America/Lima").toDate();

        await comanda.save();

        // Registrar auditoría
        req.auditoria = {
            accion: 'ELIMINAR_DESCUENTO_COMANDA',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            mesaId: comanda.mesas?._id || comanda.mesas,
            comandaId: id,
            comandaNumber: comanda.comandaNumber,
            motivo: motivoEliminacion || 'Descuento eliminado',
            ip: req.ip,
            deviceId: deviceId,
            metadata: {
                descuentoEliminado: descuentoAnterior,
                motivoDescuentoAnterior: motivoAnterior,
                montoDescuentoAnterior: montoDescuentoAnterior,
                nuevoTotal: nuevoTotal,
                aplicadoPor: usuarioId,
                rolUsuario: usuarioRol,
                sourceApp
            }
        };

        const snapshotAntes = {
            comandaNumber: comanda.comandaNumber,
            descuentoEliminado: descuentoAnterior,
            motivoDescuento: motivoAnterior,
            montoDescuento: montoDescuentoAnterior
        };

        const snapshotDespues = {
            comandaNumber: comanda.comandaNumber,
            descuento: 0,
            nuevoTotal: nuevoTotal
        };

        await registrarAuditoria(req, snapshotAntes, snapshotDespues, motivoEliminacion || 'Descuento eliminado');

        // Emitir evento Socket.io
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }

        logger.info(`✅ Descuento eliminado de comanda`, {
            comandaId: id,
            comandaNumber: comanda.comandaNumber,
            descuentoAnterior,
            nuevoTotal,
            usuarioId,
            usuarioRol
        });

        res.json({
            message: 'Descuento eliminado exitosamente',
            comanda: comanda.toObject(),
            descuentoEliminado: {
                porcentaje: descuentoAnterior,
                motivo: motivoAnterior,
                monto: montoDescuentoAnterior
            }
        });

    } catch (error) {
        logger.error('Error en DELETE /comanda/:id/descuento', {
            id,
            error: error.message,
            stack: error.stack
        });
        
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ 
            message: error.message,
            error: 'ERROR_ELIMINAR_DESCUENTO'
        });
    }
});

module.exports = router;