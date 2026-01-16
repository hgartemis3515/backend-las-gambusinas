const express = require('express');

const router = express.Router();

const { listarComanda, agregarComanda, eliminarComanda, actualizarComanda, cambiarStatusComanda, cambiarEstadoComanda, listarComandaPorFechaEntregado, listarComandaPorFecha, cambiarEstadoPlato } = require('../repository/comanda.repository');

router.get('/comanda', async (req, res) => {
    try {
        const data = await listarComanda();
        res.json(data);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Error al obtener las comandas' });
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
    } catch (error) {
        console.error(error.message);
        // Si el error tiene statusCode, usarlo; sino, usar 400 por defecto
        const statusCode = error.statusCode || 400;
        res.status(statusCode).json({ message: error.message });
    }
});

router.delete('/comanda/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const deletedComanda = await eliminarComanda(id);
        if (deletedComanda) {
            res.json({ message: 'Comanda eliminada exitosamente' });
        } else {
            res.status(404).json({ message: 'Comanda no encontrada' });
        }
    } catch (error) {
        console.error(error.message);
        // Si el error tiene statusCode, usarlo; sino, usar 500 por defecto
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ message: error.message || 'Error al eliminar la comanda' });
    }
});

router.put("/comanda/:id", async (req, res) => {
    const { id } = req.params;
    const newData = req.body;
    try {
      const updatedComanda = await actualizarComanda(id, newData);
      res.json(updatedComanda);
      console.log("Comanda actualizada exitosamente");
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
    } catch (error) {
        console.error(error.message);
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;