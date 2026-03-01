/**
 * ROLES CONTROLLER
 * Endpoints para gestión de roles y permisos
 * 
 * Rutas:
 * GET    /api/roles           - Lista todos los mozos con sus roles
 * GET    /api/roles/mostrar   - Lista roles y permisos disponibles
 * GET    /api/roles/:id       - Obtiene un mozo con su rol
 * POST   /api/roles/:id       - Asigna rol y permisos a un mozo
 * PUT    /api/roles/:id       - Actualiza permisos de un mozo
 * DELETE /api/roles/:id       - Resetea permisos al default del rol
 */

const express = require('express');
const router = express.Router();
const rolesRepository = require('../repository/roles.repository');
const { adminAuth, verifyAdminToken, checkPermission, checkRole } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/**
 * GET /api/roles/mostrar
 * Obtener lista de roles y permisos disponibles
 * Requiere autenticación admin
 */
router.get('/roles/mostrar', adminAuth, async (req, res) => {
    try {
        const roles = rolesRepository.obtenerRolesDisponibles();
        const permisos = rolesRepository.obtenerPermisosFundamentales();

        res.json({
            success: true,
            data: {
                roles,
                permisos,
                permisosPorRol: rolesRepository.PERMISOS_POR_ROL
            }
        });
    } catch (error) {
        logger.error('Error al obtener roles y permisos', { 
            error: error.message,
            stack: error.stack 
        });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener roles y permisos' 
        });
    }
});

/**
 * GET /api/roles
 * Listar todos los mozos con sus roles y permisos
 * Requiere permiso: gestionar-roles o ser admin/supervisor
 */
router.get('/roles', adminAuth, async (req, res) => {
    try {
        // Verificar permisos
        if (req.admin.rol !== 'admin' && req.admin.rol !== 'supervisor') {
            // Verificar si tiene el permiso específico
            const tienePermiso = req.admin.permisos?.includes('gestionar-roles');
            if (!tienePermiso) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'No tiene permisos para ver roles' 
                });
            }
        }

        const mozos = await rolesRepository.listarMozosConRoles();

        res.json({
            success: true,
            data: mozos,
            count: mozos.length
        });
    } catch (error) {
        logger.error('Error al listar mozos con roles', { 
            error: error.message,
            stack: error.stack 
        });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener lista de usuarios' 
        });
    }
});

/**
 * GET /api/roles/:id
 * Obtener un mozo específico con su rol y permisos
 */
router.get('/roles/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const mozo = await rolesRepository.obtenerMozoConRol(id);

        if (!mozo) {
            return res.status(404).json({ 
                success: false, 
                error: 'Mozo no encontrado' 
            });
        }

        res.json({
            success: true,
            data: mozo
        });
    } catch (error) {
        logger.error('Error al obtener mozo con rol', { 
            error: error.message,
            mozoId: req.params.id 
        });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener usuario' 
        });
    }
});

/**
 * POST /api/roles/:id
 * Asignar rol y permisos a un mozo
 * Solo admin puede asignar roles
 */
router.post('/roles/:id', adminAuth, async (req, res) => {
    try {
        // Solo admin puede asignar roles
        if (req.admin.rol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden asignar roles' 
            });
        }

        const { id } = req.params;
        const { rol, permisos } = req.body;

        if (!rol) {
            return res.status(400).json({ 
                success: false, 
                error: 'El rol es requerido' 
            });
        }

        const mozoActualizado = await rolesRepository.asignarRol(id, rol, permisos);

        // Emitir evento WebSocket para actualización en tiempo real
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('roles-actualizados', {
                tipo: 'asignacion',
                mozoId: id,
                rol,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Rol asignado', { 
            adminId: req.admin.id,
            mozoId: id, 
            rol,
            permisosCount: permisos?.length || 0
        });

        res.json({
            success: true,
            message: 'Rol asignado correctamente',
            data: mozoActualizado
        });
    } catch (error) {
        logger.error('Error al asignar rol', { 
            error: error.message,
            mozoId: req.params.id,
            body: req.body 
        });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al asignar rol' 
        });
    }
});

/**
 * PUT /api/roles/:id
 * Actualizar permisos personalizados de un mozo
 * Admin y supervisor pueden actualizar permisos
 */
router.put('/roles/:id', adminAuth, async (req, res) => {
    try {
        // Verificar que sea admin o supervisor
        if (req.admin.rol !== 'admin' && req.admin.rol !== 'supervisor') {
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para modificar roles' 
            });
        }

        const { id } = req.params;
        const { rol, permisos } = req.body;

        let mozoActualizado;

        if (rol) {
            // Si se especifica rol, asignar rol completo
            if (req.admin.rol !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Solo administradores pueden cambiar roles' 
                });
            }
            mozoActualizado = await rolesRepository.asignarRol(id, rol, permisos);
        } else if (permisos) {
            // Si solo se especifican permisos, actualizar permisos
            mozoActualizado = await rolesRepository.actualizarPermisos(id, permisos);
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Se requiere rol o permisos para actualizar' 
            });
        }

        // Emitir evento WebSocket
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('roles-actualizados', {
                tipo: 'actualizacion',
                mozoId: id,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Permisos actualizados', { 
            adminId: req.admin.id,
            mozoId: id,
            cambios: { rol, permisosCount: permisos?.length || 0 }
        });

        res.json({
            success: true,
            message: 'Permisos actualizados correctamente',
            data: mozoActualizado
        });
    } catch (error) {
        logger.error('Error al actualizar permisos', { 
            error: error.message,
            mozoId: req.params.id 
        });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al actualizar permisos' 
        });
    }
});

/**
 * DELETE /api/roles/:id
 * Resetear permisos personalizados (volver a los del rol por defecto)
 * Solo admin puede resetear permisos
 */
router.delete('/roles/:id', adminAuth, async (req, res) => {
    try {
        if (req.admin.rol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden resetear permisos' 
            });
        }

        const { id } = req.params;

        // Resetear permisos (vaciar array para usar los del rol)
        const mozoActualizado = await rolesRepository.asignarRol(id, undefined, []);

        // Emitir evento WebSocket
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('roles-actualizados', {
                tipo: 'reset',
                mozoId: id,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Permisos reseteados', { 
            adminId: req.admin.id,
            mozoId: id 
        });

        res.json({
            success: true,
            message: 'Permisos reseteados a valores por defecto del rol',
            data: mozoActualizado
        });
    } catch (error) {
        logger.error('Error al resetear permisos', { 
            error: error.message,
            mozoId: req.params.id 
        });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al resetear permisos' 
        });
    }
});

/**
 * GET /api/roles/verificar/:permiso
 * Verificar si el usuario autenticado tiene un permiso
 */
router.get('/roles/verificar/:permiso', adminAuth, async (req, res) => {
    try {
        const { permiso } = req.params;
        const mozoId = req.admin.id;

        const tienePermiso = await rolesRepository.tienePermiso(mozoId, permiso);

        res.json({
            success: true,
            data: {
                permiso,
                permitido: tienePermiso
            }
        });
    } catch (error) {
        logger.error('Error al verificar permiso', { 
            error: error.message,
            permiso: req.params.permiso 
        });
        res.status(500).json({ 
            success: false, 
            error: 'Error al verificar permiso' 
        });
    }
});

/**
 * POST /api/roles/migrar
 * Migrar usuarios existentes sin rol al rol por defecto
 * Solo admin puede ejecutar migración
 */
router.post('/roles/migrar', adminAuth, async (req, res) => {
    try {
        if (req.admin.rol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden ejecutar migraciones' 
            });
        }

        const resultado = await rolesRepository.migrarRolesDefault();

        res.json({
            success: true,
            message: 'Migración completada',
            data: {
                usuariosMigrados: resultado.modifiedCount
            }
        });
    } catch (error) {
        logger.error('Error en migración de roles', { 
            error: error.message 
        });
        res.status(500).json({ 
            success: false, 
            error: 'Error en migración de roles' 
        });
    }
});

/**
 * GET /api/roles/usuarios/:rol
 * Obtener usuarios por rol específico
 */
router.get('/roles/usuarios/:rol', adminAuth, async (req, res) => {
    try {
        const { rol } = req.params;

        if (!rolesRepository.ROLES.includes(rol)) {
            return res.status(400).json({ 
                success: false, 
                error: `Rol inválido. Roles válidos: ${rolesRepository.ROLES.join(', ')}` 
            });
        }

        const usuarios = await rolesRepository.obtenerUsuariosPorRol(rol);

        res.json({
            success: true,
            data: usuarios,
            count: usuarios.length
        });
    } catch (error) {
        logger.error('Error al obtener usuarios por rol', { 
            error: error.message,
            rol: req.params.rol 
        });
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener usuarios' 
        });
    }
});

module.exports = router;
