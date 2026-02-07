/**
 * MENSAJES CONTROLLER
 * Endpoints para sistema de mensajería
 */

const express = require('express');
const router = express.Router();

// Simulación de mensajes (hasta implementar BD)
let mensajes = [
    {
        _id: '1',
        remitente: 'Juan (Mozo)',
        mensaje: 'Plato sin stock disponible - Ceviche',
        fecha: new Date(),
        leido: false,
        avatar: '1.jpg',
        tipo: 'stock'
    },
    {
        _id: '2',
        remitente: 'Cocina',
        mensaje: 'Comanda #57 lista para servir',
        fecha: new Date(Date.now() - 300000),
        leido: false,
        avatar: '2.jpg',
        tipo: 'comanda'
    }
];

/**
 * GET /api/mensajes-no-leidos
 * Obtener mensajes no leídos
 */
router.get('/mensajes-no-leidos', (req, res) => {
    try {
        // Ordenar por fecha (más recientes primero)
        const ordenados = mensajes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.json(ordenados);
    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;

