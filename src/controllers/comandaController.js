const express = require('express');

const router = express.Router();

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
  revertirStatusComanda 
} = require('../repository/comanda.repository');

const { registrarAuditoria } = require('../middleware/auditoria');
const HistorialComandas = require('../database/models/historialComandas.model');
const comandaModel = require('../database/models/comanda.model');

router.get('/comanda', async (req, res) => {
    try {
        const data = await listarComanda();
        // Asegurar que siempre retornamos un array
        if (!Array.isArray(data)) {
            console.warn('⚠️ listarComanda no retornó un array:', typeof data);
            console.warn('Datos recibidos:', data);
            res.json([]);
        } else {
            res.json(data);
        }
    } catch (error) {
        console.error('❌ Error en GET /api/comanda:', error.message);
        console.error('Stack trace:', error.stack);
        // Retornar array vacío en lugar de objeto de error para evitar problemas en el frontend
        // Pero también loggear el error completo para debugging
        res.status(500).json([]);
    }
});

router.get('/comanda/fecha/:fecha', async (req, res) => {
    const { fecha } = req.params;
    try {
        const data = await listarComandaPorFecha (fecha);
        res.json(data);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener las comandas por fecha' });
    }
});

router.get('/comanda/fechastatus/:fecha', async (req, res) => {
    const { fecha } = req.params;
    try {
        const data = await listarComandaPorFechaEntregado(fecha);
        res.json(data);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener las comandas por fecha' });
    }
});


router.post('/comanda', async (req, res) => {
    try {
        const data = await agregarComanda(req.body);
        res.json(data);
        console.log('Reserva exitosa');
        
        // Emitir evento Socket.io de nueva comanda
        if (global.emitNuevaComanda && data.comanda) {
            await global.emitNuevaComanda(data.comanda);
        }
    } catch (error) {
        console.error(error.message);
        // Si el error tiene statusCode, usarlo; sino, usar 400 por defecto
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message });
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
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    try {
        // Obtener snapshot antes de eliminar
        const snapshotAntes = await comandaModel.findById(id);
        if (!snapshotAntes) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        const deletedComanda = await eliminarLogicamente(id, usuarioId, motivo);
        
        if (deletedComanda) {
            // Registrar auditoría
            req.auditoria = {
                accion: 'comanda_eliminada',
                entidadId: id,
                entidadTipo: 'comanda',
                usuario: usuarioId,
                ip: req.ip,
                deviceId: req.headers['device-id'] || req.headers['x-device-id']
            };
            await registrarAuditoria(req, snapshotAntes, deletedComanda, motivo);
            
            res.json({ 
                message: 'Comanda archivada con auditoría (soft-delete)',
                comanda: deletedComanda
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
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    // Validar que el motivo sea obligatorio
    if (!motivo || motivo.trim() === '') {
        return res.status(400).json({ 
            message: 'El motivo de eliminación es obligatorio' 
        });
    }
    
    try {
        // Obtener snapshot antes de eliminar
        const snapshotAntes = await comandaModel.findById(id);
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
 * ✅ NUEVO ENDPOINT: Editar platos con auditoría completa
 */
router.put('/comanda/:id/editar-platos', async (req, res) => {
    const { id } = req.params;
    const { platosNuevos, platosEliminados, motivo } = req.body;
    const usuarioId = req.userId || req.body?.usuarioId || req.headers['x-user-id'] || null;
    
    try {
        // Obtener snapshot antes de editar
        const snapshotAntes = await comandaModel.findById(id);
        if (!snapshotAntes) {
            return res.status(404).json({ message: 'Comanda no encontrada' });
        }
        
        const comanda = await editarConAuditoria(
            id, 
            platosNuevos || [], 
            platosEliminados || [], 
            usuarioId,
            motivo || 'Edición de platos'
        );
        
        // Guardar versión completa en historial
        await HistorialComandas.create({
            comandaId: id,
            version: comanda.version,
            status: comanda.status,
            platos: comanda.platos.map((p, idx) => ({
                plato: p.plato,
                platoId: p.platoId,
                estado: p.estado,
                cantidad: comanda.cantidades[idx] || 1,
                nombre: p.plato?.nombre || 'Plato desconocido',
                precio: p.plato?.precio || 0
            })),
            cantidades: comanda.cantidades,
            observaciones: comanda.observaciones,
            usuario: usuarioId,
            accion: 'editada',
            motivo: motivo || 'Edición de platos'
        });
        
        // Registrar auditoría
        req.auditoria = {
            accion: 'comanda_editada',
            entidadId: id,
            entidadTipo: 'comanda',
            usuario: usuarioId,
            ip: req.ip,
            deviceId: req.headers['device-id'] || req.headers['x-device-id']
        };
        await registrarAuditoria(req, snapshotAntes, comanda, motivo);
        
        // Obtener comanda completa con populate para emitir
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
            
            // Emitir a cocina (room por fecha)
            cocinaNamespace.to(roomName).emit('comanda-actualizada', {
                comanda: comandaCompleta,
                socketId: 'server',
                timestamp: new Date().toISOString()
            });
            
            // Emitir a mozos (todos)
            mozosNamespace.emit('comanda-actualizada', {
                comanda: comandaCompleta,
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
    const { nuevoStatus } = req.body;
    
    try {
        const updatedComanda = await cambiarStatusComanda(id, nuevoStatus);
        res.json(updatedComanda);
        console.log("Estado de la comanda actualizado exitosamente");
        
        // Emitir evento Socket.io de comanda actualizada
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ message: error.message });
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

router.put('/comanda/:id/plato/:platoId/estado', async (req, res) => {
    const { id, platoId } = req.params;
    const { nuevoEstado } = req.body;

    try {
        const updatedComanda = await cambiarEstadoPlato(id, platoId, nuevoEstado);
        res.json(updatedComanda);
        console.log('Estado del plato en la comanda actualizado exitosamente');
        
        // Emitir evento Socket.io de plato actualizado
        if (global.emitPlatoActualizado) {
            await global.emitPlatoActualizado(id, platoId, nuevoEstado);
        }
        
        // También emitir comanda actualizada para refrescar toda la comanda
        if (global.emitComandaActualizada) {
            await global.emitComandaActualizada(id);
        }
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ message: error.message });
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

module.exports = router;