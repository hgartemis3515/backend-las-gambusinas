const express = require("express");
const router = express.Router();
const {
    listarAreas,
    obtenerAreaPorId,
    crearArea,
    actualizarArea,
    borrarArea
} = require("../repository/area.repository");

router.get("/areas", async (req, res) => {
    try {
        const data = await listarAreas();
        res.json(data);
    } catch (error) {
        console.error('Error al listar las áreas:', error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.get("/areas/:id", async (req, res) => {
    try {
        const idArea = req.params.id;
        const area = await obtenerAreaPorId(idArea);
        if (!area) {
            console.log("Área no encontrada");
            return res.status(404).json({ error: "Área no encontrada" });
        }
        console.log('Área encontrada:', area);
        res.json(area);
    } catch (error) {
        console.error("Error al obtener el área:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.post('/areas', async (req, res) => {
    try {
        const nuevaArea = req.body;
        const areasCreadas = await crearArea(nuevaArea);
        res.json(areasCreadas);
        console.log("Se creó una nueva área:", nuevaArea);
    } catch (error) {
        console.error("Error al crear el área:", error);
        const statusCode = error.message.includes('Ya existe') ? 409 : 500;
        res.status(statusCode).json({ error: error.message || "Error interno del servidor" });
    }
});

router.put('/areas/:id', async (req, res) => {
    try {
        const idArea = req.params.id;
        const newData = req.body;
        const areasActualizadas = await actualizarArea(idArea, newData);
        res.json(areasActualizadas);
        console.log("Se actualizó el área:", idArea);
    } catch (error) {
        console.error("Error al actualizar el área:", error);
        const statusCode = error.message.includes('Ya existe') ? 409 : 500;
        res.status(statusCode).json({ error: error.message || "Error interno del servidor" });
    }
});

router.delete('/areas/:id', async (req, res) => {
    try {
        const idArea = req.params.id;
        const areasActualizadas = await borrarArea(idArea);
        res.json(areasActualizadas);
        console.log("Se eliminó el área:", idArea);
    } catch (error) {
        console.error("Error al eliminar el área:", error);
        const statusCode = error.message.includes('No se puede eliminar') ? 400 : 500;
        res.status(statusCode).json({ error: error.message || "Error interno del servidor" });
    }
});

module.exports = router;

