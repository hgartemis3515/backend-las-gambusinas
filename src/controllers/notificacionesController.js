/**
 * NOTIFICACIONES CONTROLLER
 * Sistema completo de notificaciones para el dashboard
 */

const express = require('express');
const router = express.Router();
const Notificacion = require('../database/models/notificacion.model');
const logger = require('../utils/logger');
const { adminAuth } = require('../middleware/adminAuth');

// Aplicar middleware de autenticación a todas las rutas
router.use(adminAuth);

/**
 * GET /api/notificaciones
 * Obtener notificaciones para el usuario actual
 * Query params:
 *  - limit: número máximo (default: 20)
 *  - soloNoLeidas: boolean
 */
router.get('/notificaciones', async (req, res) => {
    try {
        const { limit = 20, soloNoLeidas = 'false' } = req.query;
        const usuario = req.admin || req.usuario;

        if (!usuario) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        // Query simple sin condiciones complejas
        const query = {};

        // Filtrar por no leídas si se solicita
        if (soloNoLeidas === 'true') {
            query.leida = false;
        }

        const notificaciones = await Notificacion.find(query)
            .sort({ prioridad: -1, createdAt: -1 })
            .limit(parseInt(limit))
            .populate('generadoPor', 'name rol')
            .lean();

        // Contar no leídas
        const noLeidas = await Notificacion.countDocuments({ leida: false });

        res.json({
            success: true,
            data: notificaciones,
            meta: {
                total: notificaciones.length,
                noLeidas,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        logger.error('Error obteniendo notificaciones:', { error: error.message, stack: error.stack });
        console.error('Error en notificaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
});

/**
 * GET /api/notificaciones/count
 * Contar notificaciones no leídas
 */
router.get('/notificaciones/count', async (req, res) => {
    try {
        const count = await Notificacion.countDocuments({ leida: false });
        res.json({ success: true, count });
    } catch (error) {
        logger.error('Error contando notificaciones:', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * PATCH /api/notificaciones/:id/leida
 * Marcar una notificación como leída
 */
router.patch('/notificaciones/:id/leida', async (req, res) => {
    try {
        const { id } = req.params;

        const notificacion = await Notificacion.findByIdAndUpdate(
            id,
            { leida: true, fechaLectura: new Date() },
            { new: true }
        );

        if (!notificacion) {
            return res.status(404).json({ error: 'Notificación no encontrada' });
        }

        res.json({ success: true, data: notificacion });

    } catch (error) {
        logger.error('Error marcando notificación como leída:', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * PATCH /api/notificaciones/leidas
 * Marcar todas las notificaciones como leídas
 */
router.patch('/notificaciones/leidas', async (req, res) => {
    try {
        const result = await Notificacion.updateMany(
            { leida: false },
            { leida: true, fechaLectura: new Date() }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} notificaciones marcadas como leídas`,
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        logger.error('Error marcando todas como leídas:', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * DELETE /api/notificaciones/:id
 * Eliminar una notificación
 */
router.delete('/notificaciones/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const notificacion = await Notificacion.findByIdAndDelete(id);

        if (!notificacion) {
            return res.status(404).json({ error: 'Notificación no encontrada' });
        }

        res.json({ success: true, message: 'Notificación eliminada' });

    } catch (error) {
        logger.error('Error eliminando notificación:', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * DELETE /api/notificaciones/limpiar
 * Limpiar notificaciones leídas antiguas
 */
router.delete('/notificaciones/limpiar', async (req, res) => {
    try {
        const { dias = 7 } = req.query;
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaLimite.getDate() - parseInt(dias));

        const result = await Notificacion.deleteMany({
            leida: true,
            createdAt: { $lt: fechaLimite }
        });

        res.json({
            success: true,
            message: `${result.deletedCount} notificaciones antiguas eliminadas`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        logger.error('Error limpiando notificaciones:', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * POST /api/notificaciones/test
 * Crear notificación de prueba (solo admin)
 */
router.post('/notificaciones/test', async (req, res) => {
    try {
        const usuario = req.admin || req.usuario;
        
        if (!usuario || usuario.rol !== 'admin') {
            return res.status(403).json({ error: 'Solo administradores pueden crear notificaciones de prueba' });
        }

        const notificacion = await Notificacion.create({
            tipo: 'sistema',
            titulo: 'Notificación de prueba',
            mensaje: `Creada por ${usuario.name} - ${new Date().toLocaleTimeString()}`,
            icono: '🧪',
            rolesDestinatarios: ['admin', 'supervisor'],
            prioridad: 5,
            generadoPor: usuario.id
        });

        // Emitir por Socket.io si está disponible
        if (global.io) {
            const adminNamespace = global.io.of('/admin');
            adminNamespace.emit('nueva-notificacion', notificacion);
        }

        res.json({ success: true, data: notificacion });

    } catch (error) {
        logger.error('Error creando notificación de prueba:', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * Servicio interno para crear notificaciones desde otros controllers
 */
const NotificacionService = {
    /**
     * Crear notificación de nueva comanda
     */
    async notificarComandaCreada(comanda, mozo) {
        try {
            const notificacion = await Notificacion.comandaCreada(comanda, mozo);
            
            if (global.io) {
                const adminNamespace = global.io.of('/admin');
                adminNamespace.emit('nueva-notificacion', notificacion);
            }
            
            return notificacion;
        } catch (error) {
            logger.error('Error notificando comanda creada:', { error: error.message });
            return null;
        }
    },

    /**
     * Crear notificación de pago procesado
     */
    async notificarPagoProcesado(boucher, mozo) {
        try {
            const notificacion = await Notificacion.pagoProcesado(boucher, mozo);
            
            if (global.io) {
                const adminNamespace = global.io.of('/admin');
                adminNamespace.emit('nueva-notificacion', notificacion);
            }
            
            return notificacion;
        } catch (error) {
            logger.error('Error notificando pago:', { error: error.message });
            return null;
        }
    },

    /**
     * Crear notificación de alerta de mesa
     */
    async notificarAlertaMesa(mesa, tipoAlerta) {
        try {
            const notificacion = await Notificacion.mesaAlerta(mesa, tipoAlerta);
            
            if (global.io) {
                const adminNamespace = global.io.of('/admin');
                adminNamespace.emit('nueva-notificacion', notificacion);
            }
            
            return notificacion;
        } catch (error) {
            logger.error('Error notificando alerta de mesa:', { error: error.message });
            return null;
        }
    },

    /**
     * Crear notificación de evento de auditoría
     */
    async notificarEventoAuditoria(auditoria) {
        try {
            const notificacion = await Notificacion.eventoAuditoria(auditoria);
            
            if (global.io) {
                const adminNamespace = global.io.of('/admin');
                adminNamespace.emit('nueva-notificacion', notificacion);
            }
            
            return notificacion;
        } catch (error) {
            logger.error('Error notificando evento de auditoría:', { error: error.message });
            return null;
        }
    },

    /**
     * Crear notificación personalizada
     */
    async crear(datos) {
        try {
            const notificacion = await Notificacion.create(datos);
            
            if (global.io) {
                const adminNamespace = global.io.of('/admin');
                adminNamespace.emit('nueva-notificacion', notificacion);
            }
            
            return notificacion;
        } catch (error) {
            logger.error('Error creando notificación:', { error: error.message });
            return null;
        }
    }
};

module.exports = router;
module.exports.NotificacionService = NotificacionService;
