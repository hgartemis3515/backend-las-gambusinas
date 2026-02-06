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
  revertirStatusComanda,
  getComandasParaPagar
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
        
        // 3. Marcar plato como ELIMINADO (NO BORRAR)
        plato.eliminado = true;
        plato.eliminadoPor = usuarioId;
        plato.eliminadoAt = new Date();
        plato.eliminadoRazon = razon || 'Eliminado por mozo';
        
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
    const usuario = req.body.usuarioId || req.headers['x-user-id'] || null;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || null;
    const sourceApp = req.body.sourceApp || req.headers['x-source-app'] || 'api';
    
    try {
        const options = {
            usuario,
            deviceId,
            sourceApp,
            motivo
        };
        
        const updatedComanda = await cambiarStatusComanda(id, nuevoStatus, options);
        res.json(updatedComanda);
        logger.info("Estado de la comanda actualizado exitosamente", {
            comandaId: id,
            nuevoStatus,
            usuario,
            sourceApp
        });
        
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

/**
 * ✅ NUEVO ENDPOINT: Obtener comandas listas para pagar de una mesa
 * GET /comanda/comandas-para-pagar/:mesaId
 * Filtra solo comandas activas con status 'preparado', 'recoger' o 'entregado' y platos no eliminados
 */
router.get('/comanda/comandas-para-pagar/:mesaId', async (req, res) => {
  try {
    const { mesaId } = req.params;
    
    // FILTRADO EXACTO según diagrama
    const comandas = await getComandasParaPagar(mesaId);
    
    // Calcular total pendiente (solo platos no eliminados)
    const totalPendiente = comandas.reduce((sum, c) => {
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

module.exports = router;