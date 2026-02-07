/**
 * NOTIFICACIONES CONTROLLER
 * Endpoints para sistema de notificaciones
 */

const express = require('express');
const router = express.Router();

// Simulación de notificaciones (hasta implementar BD)
let notificaciones = [
    {
        _id: '1',
        titulo: 'Mesa 5 preparada',
        mensaje: 'La mesa 5 está lista para servir',
        fecha: new Date(),
        leida: false,
        tipo: 'mesa'
    },
    {
        _id: '2',
        titulo: 'Nueva comanda #58',
        mensaje: 'Nueva comanda recibida en cocina',
        fecha: new Date(Date.now() - 120000),
        leida: false,
        tipo: 'comanda'
    },
    {
        _id: '3',
        titulo: 'Cierre de caja pendiente',
        mensaje: 'Hay un cierre de caja pendiente de validación',
        fecha: new Date(Date.now() - 3600000),
        leida: true,
        tipo: 'caja'
    }
];

/**
 * GET /api/notificaciones
 * Obtener todas las notificaciones
 */
router.get('/notificaciones', (req, res) => {
    try {
        // Ordenar por fecha (más recientes primero)
        const ordenadas = notificaciones.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        res.json(ordenadas);
    } catch (error) {
        console.error('Error obteniendo notificaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * PATCH /api/notificaciones/:id/leida
 * Marcar notificación como leída
 */
router.patch('/notificaciones/:id/leida', (req, res) => {
    try {
        const { id } = req.params;
        const notificacion = notificaciones.find(n => n._id === id);
        
        if (!notificacion) {
            return res.status(404).json({ error: 'Notificación no encontrada' });
        }
        
        notificacion.leida = true;
        res.json({ success: true, notificacion });
    } catch (error) {
        console.error('Error marcando notificación como leída:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * PATCH /api/notificaciones/leidas
 * Marcar todas las notificaciones como leídas
 */
router.patch('/notificaciones/leidas', (req, res) => {
    try {
        notificaciones.forEach(n => n.leida = true);
        res.json({ success: true, message: 'Todas las notificaciones marcadas como leídas' });
    } catch (error) {
        console.error('Error marcando todas como leídas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;

