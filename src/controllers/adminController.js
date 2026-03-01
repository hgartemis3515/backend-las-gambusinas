/**
 * ADMIN CONTROLLER
 * Endpoints para autenticación administrativa
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { autenticarMozo, obtenerMozosPorId } = require('../repository/mozos.repository');
const rolesRepository = require('../repository/roles.repository');
const { JWT_SECRET } = require('../middleware/adminAuth');
const logger = require('../utils/logger');

/**
 * POST /api/admin/auth
 * Autenticar administrador (mozo con rol admin/supervisor)
 */
router.post('/admin/auth', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }
        
        // Convertir password a número (DNI)
        const dniNumber = parseInt(password, 10);
        
        if (isNaN(dniNumber) || dniNumber <= 0) {
            return res.status(400).json({ error: 'Contraseña inválida' });
        }
        
        // Autenticar mozo
        const mozo = await autenticarMozo(username, dniNumber);
        
        if (!mozo) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        
        // Obtener información completa del rol y permisos
        const mozoConRol = await rolesRepository.obtenerMozoConRol(mozo._id);
        
        // Determinar el rol (usar el de BD o default)
        const rol = mozoConRol?.rol || mozo.rol || 'mozos';
        const permisos = mozoConRol?.permisosEfectivos || rolesRepository.PERMISOS_POR_ROL[rol] || [];
        
        // Verificar si tiene acceso al dashboard (admin o supervisor)
        const tieneAccesoDashboard = rol === 'admin' || rol === 'supervisor';
        
        if (!tieneAccesoDashboard) {
            logger.warn('Intento de acceso al dashboard sin permisos', {
                username,
                rol,
                mozoId: mozo._id
            });
            return res.status(403).json({ 
                error: 'No tiene permisos para acceder al dashboard administrativo',
                rol: rol
            });
        }
        
        // Generar token JWT con información de rol y permisos
        const token = jwt.sign(
            {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI,
                rol: rol,
                permisos: permisos
            },
            JWT_SECRET,
            {
                expiresIn: '24h' // Token válido por 24 horas
            }
        );
        
        logger.info('Usuario autenticado en dashboard', {
            mozoId: mozo._id,
            name: mozo.name,
            rol: rol
        });
        
        res.json({
            token,
            usuario: {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI,
                rol: rol,
                permisos: permisos
            }
        });
        
    } catch (error) {
        logger.error('Error en autenticación admin', { 
            error: error.message,
            stack: error.stack 
        });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * GET /api/admin/verify
 * Verificar si el token es válido y retornar información del usuario con permisos
 */
router.get('/admin/verify', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Obtener información actualizada del usuario con permisos
        const mozoConRol = await rolesRepository.obtenerMozoConRol(decoded.id);
        
        if (!mozoConRol) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // Verificar si el usuario está activo
        if (mozoConRol.activo === false) {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }
        
        res.json({
            valid: true,
            usuario: {
                id: decoded.id,
                name: decoded.name,
                rol: mozoConRol.rol,
                permisos: mozoConRol.permisosEfectivos,
                activo: mozoConRol.activo
            }
        });
        
    } catch (error) {
        logger.error('Error en verificación de token', { 
            error: error.message 
        });
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
});

/**
 * GET /api/admin/perfil
 * Obtener perfil completo del usuario autenticado
 */
router.get('/admin/perfil', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const mozoConRol = await rolesRepository.obtenerMozoConRol(decoded.id);
        
        if (!mozoConRol) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json({
            success: true,
            data: mozoConRol
        });
        
    } catch (error) {
        logger.error('Error al obtener perfil', { 
            error: error.message 
        });
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
});

/**
 * POST /api/admin/mozos/auth
 * Autenticación para App Mozos (retorna rol y permisos)
 */
router.post('/admin/mozos/auth', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }
        
        const dniNumber = parseInt(password, 10);
        
        if (isNaN(dniNumber) || dniNumber <= 0) {
            return res.status(400).json({ error: 'Contraseña inválida' });
        }
        
        const mozo = await autenticarMozo(username, dniNumber);
        
        if (!mozo) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        
        // Obtener información completa del rol y permisos
        const mozoConRol = await rolesRepository.obtenerMozoConRol(mozo._id);
        
        // Verificar si está activo
        if (mozoConRol?.activo === false) {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }
        
        const rol = mozoConRol?.rol || 'mozos';
        const permisos = mozoConRol?.permisosEfectivos || rolesRepository.PERMISOS_POR_ROL[rol] || [];
        
        // Generar token JWT para App Mozos
        const token = jwt.sign(
            {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI,
                rol: rol,
                permisos: permisos,
                app: 'mozos'
            },
            JWT_SECRET,
            {
                expiresIn: '12h'
            }
        );
        
        logger.info('Usuario autenticado en App Mozos', {
            mozoId: mozo._id,
            name: mozo.name,
            rol: rol
        });
        
        res.json({
            token,
            usuario: {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI,
                phoneNumber: mozo.phoneNumber,
                rol: rol,
                permisos: permisos
            }
        });
        
    } catch (error) {
        logger.error('Error en autenticación App Mozos', { 
            error: error.message 
        });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * POST /api/admin/cocina/auth
 * Autenticación rápida para App Cocina (solo DNI)
 */
router.post('/admin/cocina/auth', async (req, res) => {
    try {
        const { dni } = req.body;
        
        if (!dni) {
            return res.status(400).json({ error: 'DNI es requerido' });
        }
        
        const dniNumber = parseInt(dni, 10);
        
        if (isNaN(dniNumber) || dniNumber <= 0) {
            return res.status(400).json({ error: 'DNI inválido' });
        }
        
        // Buscar mozo por DNI
        const mozo = await obtenerMozosPorId(dniNumber);
        
        if (!mozo) {
            // Intentar buscar por campo DNI
            const mozos = require('../database/models/mozos.model');
            const mozoPorDNI = await mozos.findOne({ DNI: dniNumber });
            
            if (!mozoPorDNI) {
                return res.status(401).json({ error: 'DNI no registrado' });
            }
            
            const mozoConRol = await rolesRepository.obtenerMozoConRol(mozoPorDNI._id);
            
            // Verificar que tenga rol de cocinero o admin
            if (mozoConRol?.rol !== 'cocinero' && mozoConRol?.rol !== 'admin') {
                return res.status(403).json({ 
                    error: 'No tiene permisos para acceder a la App Cocina',
                    rol: mozoConRol?.rol
                });
            }
            
            if (mozoConRol?.activo === false) {
                return res.status(403).json({ error: 'Usuario inactivo' });
            }
            
            const permisos = mozoConRol?.permisosEfectivos || [];
            
            const token = jwt.sign(
                {
                    id: mozoPorDNI._id,
                    name: mozoPorDNI.name,
                    DNI: mozoPorDNI.DNI,
                    rol: mozoConRol?.rol || 'cocinero',
                    permisos: permisos,
                    app: 'cocina'
                },
                JWT_SECRET,
                { expiresIn: '8h' }
            );
            
            logger.info('Usuario autenticado en App Cocina', {
                mozoId: mozoPorDNI._id,
                name: mozoPorDNI.name,
                rol: mozoConRol?.rol
            });
            
            return res.json({
                token,
                usuario: {
                    id: mozoPorDNI._id,
                    name: mozoPorDNI.name,
                    rol: mozoConRol?.rol || 'cocinero',
                    permisos: permisos
                }
            });
        }
        
        const mozoConRol = await rolesRepository.obtenerMozoConRol(mozo._id);
        
        // Verificar que tenga rol de cocinero o admin
        if (mozoConRol?.rol !== 'cocinero' && mozoConRol?.rol !== 'admin') {
            return res.status(403).json({ 
                error: 'No tiene permisos para acceder a la App Cocina',
                rol: mozoConRol?.rol
            });
        }
        
        if (mozoConRol?.activo === false) {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }
        
        const permisos = mozoConRol?.permisosEfectivos || [];
        
        const token = jwt.sign(
            {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI,
                rol: mozoConRol?.rol || 'cocinero',
                permisos: permisos,
                app: 'cocina'
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        logger.info('Usuario autenticado en App Cocina', {
            mozoId: mozo._id,
            name: mozo.name,
            rol: mozoConRol?.rol
        });
        
        res.json({
            token,
            usuario: {
                id: mozo._id,
                name: mozo.name,
                rol: mozoConRol?.rol || 'cocinero',
                permisos: permisos
            }
        });
        
    } catch (error) {
        logger.error('Error en autenticación App Cocina', { 
            error: error.message 
        });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;

