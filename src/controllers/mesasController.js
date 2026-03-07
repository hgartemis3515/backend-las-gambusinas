const express = require("express");
const router = express.Router();
const {
    listarMesas,
    obtenerMesaPorId,
    crearMesa,
    actualizarMesa,
    borrarMesa,
    actualizarEstadoMesa,
    liberarTodasLasMesas
} = require("../repository/mesas.repository");

// Importar modelo de comandas para el resumen
const comandaModel = require("../database/models/comanda.model");
const moment = require("moment-timezone");

// ==================== FASE A1: ENDPOINT OPTIMIZADO PARA MAPA DE MESAS ====================
/**
 * GET /api/mesas/resumen
 * Endpoint optimizado para el mapa de mesas de la app de mozos
 * - Retorna solo información necesaria para pintar el mapa
 * - Incluye conteo de comandas activas por mesa
 * - Usa lean() y agregación para eficiencia
 */
router.get("/mesas/resumen", async (req, res) => {
    const startTime = Date.now();
    
    try {
        const fechaActual = moment().tz("America/Lima").format("YYYY-MM-DD");
        const fechaInicio = moment().tz("America/Lima").startOf('day').toDate();
        const fechaFin = moment().tz("America/Lima").endOf('day').toDate();
        
        // Obtener mesas con lean()
        const mesas = await require("../database/models/mesas.model")
            .find({ isActive: true })
            .select('nummesa estado area mesasId')
            .populate('area', 'nombre')
            .lean();
        
        // Obtener conteo de comandas activas por mesa en una sola agregación
        const comandasPorMesa = await comandaModel.aggregate([
            {
                $match: {
                    createdAt: { $gte: fechaInicio, $lte: fechaFin },
                    IsActive: true,
                    status: { $nin: ['pagado', 'cancelado'] }
                }
            },
            {
                $group: {
                    _id: '$mesas',
                    totalComandas: { $sum: 1 },
                    totalPlatos: { $sum: { $size: '$platos' } },
                    precioTotal: { $sum: '$precioTotal' }
                }
            }
        ]);
        
        // Crear mapa de comandas por mesa
        const comandasMap = new Map();
        comandasPorMesa.forEach(c => {
            comandasMap.set(c._id?.toString(), {
                totalComandas: c.totalComandas,
                totalPlatos: c.totalPlatos,
                precioTotal: c.precioTotal
            });
        });
        
        // Combinar datos
        const resumenMesas = mesas.map(mesa => {
            const mesaId = mesa._id?.toString();
            const comandasInfo = comandasMap.get(mesaId) || {
                totalComandas: 0,
                totalPlatos: 0,
                precioTotal: 0
            };
            
            return {
                _id: mesa._id,
                mesasId: mesa.mesasId,
                nummesa: mesa.nummesa,
                estado: mesa.estado,
                area: mesa.area,
                // Información agregada de comandas
                comandasActivas: comandasInfo.totalComandas,
                platosPendientes: comandasInfo.totalPlatos,
                totalPendiente: comandasInfo.precioTotal
            };
        });
        
        const elapsedMs = Date.now() - startTime;
        
        // Log para monitoreo
        console.log(`✅ [FASE A1] Resumen mesas: ${resumenMesas.length} mesas en ${elapsedMs}ms`);
        
        res.set('X-Response-Time', `${elapsedMs}ms`);
        res.json(resumenMesas);
    } catch (error) {
        console.error('Error en resumen de mesas:', error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * GET /api/mesas/con-comandas
 * Retorna solo mesas que tienen comandas activas (para vista rápida)
 */
router.get("/mesas/con-comandas", async (req, res) => {
    const startTime = Date.now();
    
    try {
        const fechaInicio = moment().tz("America/Lima").startOf('day').toDate();
        const fechaFin = moment().tz("America/Lima").endOf('day').toDate();
        
        // Agregación para obtener mesas con comandas activas
        const mesasConComandas = await comandaModel.aggregate([
            {
                $match: {
                    createdAt: { $gte: fechaInicio, $lte: fechaFin },
                    IsActive: true,
                    status: { $nin: ['pagado', 'cancelado'] }
                }
            },
            {
                $group: {
                    _id: '$mesas',
                    comandas: { $push: '$comandaNumber' },
                    totalPendiente: { $sum: '$precioTotal' },
                    mozoId: { $first: '$mozos' },
                    mozoNombre: { $first: '$mozoNombre' }
                }
            },
            {
                $lookup: {
                    from: 'mesas',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'mesaInfo'
                }
            },
            {
                $unwind: { path: '$mesaInfo', preserveNullAndEmptyArrays: true }
            },
            {
                $project: {
                    mesaId: '$_id',
                    nummesa: '$mesaInfo.nummesa',
                    estado: '$mesaInfo.estado',
                    comandas: 1,
                    totalPendiente: 1,
                    mozoNombre: 1
                }
            },
            {
                $sort: { nummesa: 1 }
            }
        ]);
        
        const elapsedMs = Date.now() - startTime;
        
        console.log(`✅ [FASE A1] Mesas con comandas: ${mesasConComandas.length} en ${elapsedMs}ms`);
        
        res.set('X-Response-Time', `${elapsedMs}ms`);
        res.json(mesasConComandas);
    } catch (error) {
        console.error('Error en mesas con comandas:', error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
// ==================== FIN FASE A1 ====================

router.get("/mesas", async (req, res) => {
    try {
        const data = await listarMesas();
        res.json(data);
    } catch (error) {
        console.error('Error al listar las mesas:', error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.get("/mesas/:id", async (req, res) => {
    try {
        const idMesa = req.params.id;
        const mesa = await obtenerMesaPorId(idMesa);
        if (!mesa) {
            console.log("Mesa no encontrada");
            return res.status(404).json({ error: "Mesa no encontrada" });
        }
        console.log('Mesa encontrada:', mesa);
        res.json(mesa);
    } catch (error) {
        console.error("Error al obtener la mesa:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.post('/mesas', async (req, res) => {
    try {
        const nuevaMesa = req.body;
        const mesaCreada = await crearMesa(nuevaMesa);
        res.json(mesaCreada);
        console.log("Se creó una nueva mesa:", mesaCreada);
    } catch (error) {
        console.error("Error al crear la mesa:", error);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message || "Error interno del servidor" });
    }
});

// Endpoint para liberar todas las mesas a estado "libre" (Modo Libre Total)
// IMPORTANTE: Esta ruta debe ir ANTES de /mesas/:id para evitar conflictos
router.put('/mesas/liberar-todas', async (req, res) => {
    try {
        const resultado = await liberarTodasLasMesas();
        res.json({
            success: true,
            message: `Modo Libre Total activado: ${resultado.mesasActualizadas} mesas actualizadas a estado "libre"`,
            mesasActualizadas: resultado.mesasActualizadas,
            mesasAfectadas: resultado.mesasAfectadas,
            todaslasmesas: resultado.todaslasmesas
        });
        console.log(`Modo Libre Total activado: ${resultado.mesasActualizadas} mesas actualizadas`);
    } catch (error) {
        console.error("Error al activar Modo Libre Total:", error);
        res.status(500).json({ error: error.message || "Error interno del servidor" });
    }
});

router.put('/mesas/:id', async (req, res) => {
    try {
        const idMesa = req.params.id;
        const newData = req.body;
        const mesaActualizada = await actualizarMesa(idMesa, newData);
        res.json(mesaActualizada);
        console.log("Se actualizó la mesa:", idMesa);
        
        // Emitir evento Socket.io de mesa actualizada
        if (global.emitMesaActualizada) {
            await global.emitMesaActualizada(idMesa);
        }
    } catch (error) {
        console.error("Error al actualizar la mesa:", error);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message || "Error interno del servidor" });
    }
});

// Endpoint para actualizar solo el estado de una mesa
router.put('/mesas/:id/estado', async (req, res) => {
    try {
        const mesaId = req.params.id;
        const { estado } = req.body;
        const { esAdmin } = req.query; // Opcional: verificar si es admin desde query param o header
        
        if (!estado) {
            return res.status(400).json({ error: 'Debe proporcionarse un estado' });
        }

        const esAdminBool = esAdmin === 'true' || req.headers['x-admin'] === 'true';
        const resultado = await actualizarEstadoMesa(mesaId, estado, esAdminBool);
        res.json(resultado);
        console.log(`Estado de mesa ${mesaId} actualizado a ${estado}`);
        
        // Emitir evento Socket.io de mesa actualizada
        if (global.emitMesaActualizada) {
            await global.emitMesaActualizada(mesaId);
        }
    } catch (error) {
        console.error("Error al actualizar el estado de la mesa:", error);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message || "Error interno del servidor" });
    }
});

router.delete('/mesas/:id', async (req, res) => {
    try {
        const idMesa = req.params.id;
        const mesaEliminada = await borrarMesa(idMesa);
        res.json(mesaEliminada);
        console.log("Se eliminó la mesa:", mesaEliminada);
    } catch (error) {
        console.error("Error al eliminar la mesa:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;
