const express = require('express');
const router = express.Router();

const { 
    listarBouchers, 
    listarBouchersPorFecha, 
    obtenerBoucherPorId, 
    crearBoucher, 
    eliminarBoucher 
} = require('../repository/boucher.repository');

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

// Obtener un boucher por ID
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

// Crear un nuevo boucher
router.post('/boucher', async (req, res) => {
    try {
        const data = await crearBoucher(req.body);
        res.json(data);
        console.log('✅ Boucher creado exitosamente');
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

