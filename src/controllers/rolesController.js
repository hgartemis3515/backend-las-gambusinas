/**
 * ROLES CONTROLLER
 * Endpoints para gestión de roles y permisos
 * 
 * Rutas:
 * GET    /api/roles              - Lista todos los roles
 * GET    /api/roles/permisos     - Lista permisos disponibles
 * GET    /api/roles/:id          - Obtiene un rol específico
 * POST   /api/roles              - Crea un nuevo rol personalizado
 * PUT    /api/roles/:id          - Actualiza un rol
 * DELETE /api/roles/:id          - Elimina un rol (soft delete)
 */

const express = require('express');
const router = express.Router();
const rolesRepository = require('../repository/roles.repository');
const { adminAuth } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/**
 * GET /roles/permisos
 * Obtener lista de permisos fundamentales disponibles
 */
router.get('/roles/permisos', adminAuth, (req, res) => {
    try {
        const permisos = rolesRepository.obtenerPermisosFundamentales();
        const permisosAgrupados = rolesRepository.obtenerPermisosAgrupados();

        res.json({
            success: true,
            data: {
                permisos,
                permisosAgrupados
            }
        });
    } catch (error) {
        logger.error('Error al obtener permisos', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener permisos' });
    }
});

/**
 * GET /roles
 * Listar todos los roles (sistema + personalizados)
 */
router.get('/roles', adminAuth, async (req, res) => {
    try {
        const userRol = req.admin?.rol || req.admin?.role;
        
        // Log para depuración
        logger.info('GET /roles solicitado', { 
            userRol, 
            adminId: req.admin?.id,
            adminName: req.admin?.name
        });
        
        // Permitir acceso si es admin, supervisor, o si el token no tiene rol (para compatibilidad)
        // Solo denegar si explícitamente no es admin ni supervisor
        if (userRol && userRol !== 'admin' && userRol !== 'supervisor') {
            logger.warn('Acceso denegado a /roles', { userRol, adminId: req.admin?.id });
            return res.status(403).json({ 
                success: false, 
                error: 'No tiene permisos para ver roles. Solo admin y supervisor pueden acceder.',
                rol: userRol
            });
        }

        const roles = await rolesRepository.obtenerTodosLosRoles();
        const permisosPorRolSistema = rolesRepository.PERMISOS_POR_ROL_SISTEMA;

        logger.info('Roles obtenidos correctamente', { count: roles.length });

        res.json({
            success: true,
            data: roles,
            permisosPorRolSistema,
            count: roles.length
        });
    } catch (error) {
        logger.error('Error al listar roles', { error: error.message, stack: error.stack });
        res.status(500).json({ success: false, error: 'Error al obtener roles: ' + error.message });
    }
});

/**
 * GET /roles/usuarios/:rol
 * Obtener usuarios que tienen un rol específico
 */
router.get('/roles/usuarios/:rol', adminAuth, async (req, res) => {
    try {
        const { rol } = req.params;
        const usuarios = await rolesRepository.obtenerUsuariosPorRol(rol);

        res.json({
            success: true,
            data: usuarios,
            count: usuarios.length
        });
    } catch (error) {
        logger.error('Error al obtener usuarios por rol', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al obtener usuarios' });
    }
});

/**
 * GET /roles/:id
 * Obtener un rol específico
 */
router.get('/roles/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const rol = await rolesRepository.obtenerRolPorId(id);

        if (!rol) {
            return res.status(404).json({ 
                success: false, 
                error: 'Rol no encontrado' 
            });
        }

        res.json({ success: true, data: rol });
    } catch (error) {
        logger.error('Error al obtener rol', { error: error.message, id: req.params.id });
        res.status(500).json({ success: false, error: 'Error al obtener rol' });
    }
});

/**
 * POST /roles
 * Crear un nuevo rol personalizado
 * Solo admin puede crear roles
 */
router.post('/roles', adminAuth, async (req, res) => {
    try {
        const userRol = req.admin?.rol || req.admin?.role;
        
        if (userRol && userRol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden crear roles' 
            });
        }

        const { nombre, nombreDisplay, descripcion, permisos, color } = req.body;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'El nombre del rol es requerido' 
            });
        }

        const nuevoRol = await rolesRepository.crearRol({
            nombre: nombre.trim(),
            nombreDisplay,
            descripcion,
            permisos,
            color
        }, req.admin?.id);

        // Emitir evento WebSocket
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('rol-creado', {
                rol: nuevoRol,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Rol creado', { 
            adminId: req.admin?.id, 
            rolId: nuevoRol._id, 
            nombre: nuevoRol.nombre 
        });

        res.status(201).json({
            success: true,
            message: 'Rol creado exitosamente',
            data: nuevoRol
        });
    } catch (error) {
        logger.error('Error al crear rol', { error: error.message, body: req.body });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al crear rol' 
        });
    }
});

/**
 * POST /roles/inicializar
 * Inicializar roles del sistema (solo para desarrollo/migración)
 */
router.post('/roles/inicializar', adminAuth, async (req, res) => {
    try {
        if (req.admin.rol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden inicializar roles' 
            });
        }

        await rolesRepository.inicializarRolesSistema();

        res.json({
            success: true,
            message: 'Roles del sistema inicializados correctamente'
        });
    } catch (error) {
        logger.error('Error al inicializar roles', { error: error.message });
        res.status(500).json({ success: false, error: 'Error al inicializar roles' });
    }
});

/**
 * PUT /roles/:id
 * Actualizar un rol existente
 * Solo admin puede actualizar roles
 */
router.put('/roles/:id', adminAuth, async (req, res) => {
    try {
        const userRol = req.admin?.rol || req.admin?.role;
        
        if (userRol && userRol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden modificar roles' 
            });
        }

        const { id } = req.params;
        const { nombreDisplay, descripcion, permisos, color, activo } = req.body;

        const rolActualizado = await rolesRepository.actualizarRol(id, {
            nombreDisplay,
            descripcion,
            permisos,
            color,
            activo
        });

        // Emitir evento WebSocket
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('rol-actualizado', {
                rolId: id,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Rol actualizado', { 
            adminId: req.admin?.id, 
            rolId: id 
        });

        res.json({
            success: true,
            message: 'Rol actualizado correctamente',
            data: rolActualizado
        });
    } catch (error) {
        logger.error('Error al actualizar rol', { error: error.message, stack: error.stack, id: req.params.id, body: req.body });
        const statusCode = error.name === 'CastError' || error.name === 'ValidationError' ? 400 : 400;
        res.status(statusCode).json({
            success: false,
            error: error.message || 'Error al actualizar rol',
            type: error.name
        });
    }
});

/**
 * PUT /roles/:id/usuarios/:usuarioId
 * Agregar un usuario al rol
 */
router.put('/roles/:id/usuarios/:usuarioId', adminAuth, async (req, res) => {
    try {
        const userRol = req.admin?.rol || req.admin?.role;
        
        if (userRol && userRol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden asignar usuarios a roles' 
            });
        }

        const { id, usuarioId } = req.params;
        
        // Obtener el rol
        const rol = await rolesRepository.obtenerRolPorId(id);
        if (!rol) {
            return res.status(404).json({ 
                success: false, 
                error: 'Rol no encontrado' 
            });
        }

        // Asignar el rol al usuario
        const usuario = await rolesRepository.asignarRolAUsuario(usuarioId, rol.nombre);

        // Emitir evento WebSocket
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('usuario-rol-asignado', {
                rolId: id,
                usuarioId,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Usuario asignado a rol', { 
            adminId: req.admin?.id, 
            rolId: id,
            usuarioId
        });

        res.json({
            success: true,
            message: 'Usuario agregado al rol correctamente',
            data: usuario
        });
    } catch (error) {
        logger.error('Error al asignar usuario a rol', { error: error.message });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al asignar usuario a rol' 
        });
    }
});

/**
 * DELETE /roles/:id/usuarios/:usuarioId
 * Quitar un usuario del rol (cambiar a rol por defecto 'mozos')
 */
router.delete('/roles/:id/usuarios/:usuarioId', adminAuth, async (req, res) => {
    try {
        const userRol = req.admin?.rol || req.admin?.role;
        
        if (userRol && userRol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden quitar usuarios de roles' 
            });
        }

        const { id, usuarioId } = req.params;
        
        // Verificar que el rol existe
        const rol = await rolesRepository.obtenerRolPorId(id);
        if (!rol) {
            return res.status(404).json({ 
                success: false, 
                error: 'Rol no encontrado' 
            });
        }

        // Quitar el usuario del rol (asignar rol por defecto 'mozos')
        const mozosModel = require('../database/models/mozos.model');
        let usuario = await mozosModel.findById(usuarioId);
        if (!usuario) {
            usuario = await mozosModel.findOne({ mozoId: parseInt(usuarioId) });
        }

        if (!usuario) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuario no encontrado' 
            });
        }

        // Verificar que el usuario pertenece al rol
        if (usuario.rol !== rol.nombre) {
            return res.status(400).json({ 
                success: false, 
                error: 'El usuario no pertenece a este rol' 
            });
        }

        // Asignar rol por defecto 'mozos'
        usuario.rol = 'mozos';
        await usuario.save();

        // Emitir evento WebSocket
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('usuario-rol-removido', {
                rolId: id,
                usuarioId,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Usuario removido del rol', { 
            adminId: req.admin?.id, 
            rolId: id,
            usuarioId
        });

        res.json({
            success: true,
            message: 'Usuario removido del rol correctamente',
            data: usuario.toObject()
        });
    } catch (error) {
        logger.error('Error al remover usuario del rol', { error: error.message });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al remover usuario del rol' 
        });
    }
});

/**
 * DELETE /roles/:id
 * Eliminar un rol (soft delete)
 * Solo admin puede eliminar roles
 */
router.delete('/roles/:id', adminAuth, async (req, res) => {
    try {
        const userRol = req.admin?.rol || req.admin?.role;
        
        if (userRol && userRol !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Solo administradores pueden eliminar roles' 
            });
        }

        const { id } = req.params;
        const resultado = await rolesRepository.eliminarRol(id);

        // Emitir evento WebSocket
        if (global.io && global.io.of('/admin')) {
            global.io.of('/admin').emit('rol-eliminado', {
                rolId: id,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Rol eliminado', { 
            adminId: req.admin?.id, 
            rolId: id 
        });

        res.json({
            success: true,
            message: resultado.message
        });
    } catch (error) {
        logger.error('Error al eliminar rol', { error: error.message, id: req.params.id });
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Error al eliminar rol' 
        });
    }
});

module.exports = router;
