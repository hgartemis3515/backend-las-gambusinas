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
