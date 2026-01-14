const express = require("express");
const router = express.Router();
const {
    listarPlatos,
    obtenerPlatoPorId,
    crearPlato,
    actualizarPlato,
    borrarPlato,
    findByCategoria,
    importarPlatosDesdeJSON
} = require("../repository/plato.repository");

router.get("/platos", async (req, res) => {
    try {
        const data = await listarPlatos();
        res.json(data);
    } catch (error) {
        console.error('Error al listar los platos:', error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.get("/platos/:id", async (req, res) => {
    try {
        const idPlato = req.params.id;
        const plato = await obtenerPlatoPorId(idPlato);
        if (!plato) {
            console.log("Plato no encontrado");
            return res.status(404).json({ error: "Plato no encontrado" });
        }
        console.log('Plato encontrado:', plato);
        res.json(plato);
    } catch (error) {
        console.error("Error al obtener el plato:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.get("/platos/categoria/:categoria", async (req, res) => {
    try {
        const categoria = req.params.categoria;
        const platos = await findByCategoria(categoria);
        res.json(platos);
    } catch (error) {
        console.error('Error al buscar platos por categoría:', error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.post('/platos', async (req, res) => {
    try {
        const nuevoPlato = req.body;
        const platoCreado = await crearPlato(nuevoPlato);
        res.json(platoCreado);
        console.log("Se creó un nuevo plato:", platoCreado);
    } catch (error) {
        console.error("Error al crear el plato:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.put('/platos/:id', async (req, res) => {
    try {
        const idPlato = req.params.id;
        const newData = req.body;
        const platoActualizado = await actualizarPlato(idPlato, newData);
        res.json(platoActualizado);
        console.log("Se actualizó el plato:", platoActualizado);
    } catch (error) {
        console.error("Error al actualizar el plato:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.delete('/platos/:id', async (req, res) => {
    try {
        const idPlato = req.params.id;
        const platoEliminado = await borrarPlato(idPlato);
        res.json(platoEliminado);
        console.log("Se eliminó el plato:", platoEliminado);
    } catch (error) {
        console.error("Error al eliminar el plato:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// Endpoint para importar platos desde JSON
router.post('/platos/importar', async (req, res) => {
    try {
        const resultado = await importarPlatosDesdeJSON();
        res.json({
            success: true,
            message: `Importación completada: ${resultado.imported} nuevos, ${resultado.updated} actualizados`,
            ...resultado
        });
    } catch (error) {
        console.error("Error al importar platos:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;
