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
        const permisos = mozoConRol?.permisosEfectivos || rolesRepository.PERMISOS_POR_ROL_SISTEMA[rol] || [];
        
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
 * Autenticación para App Cocina (usuario + contraseña/DNI)
 */
router.post('/admin/cocina/auth', async (req, res) => {
    try {
        const { username, password, dni } = req.body;
        
        // Log de depuración
        console.log('[Cocina Auth] Request recibido:', { username, password, dni });
        
        // Soportar tanto el formato nuevo (username + password) como el anterior (solo dni)
        let dniNumber;
        let mozo;
        
        if (username && password) {
            // Formato nuevo: usuario + contraseña
            dniNumber = parseInt(password, 10);
            
            if (isNaN(dniNumber) || dniNumber <= 0) {
                return res.status(400).json({ error: 'Contraseña inválida' });
            }
            
            // Autenticar con nombre + DNI
            mozo = await autenticarMozo(username, dniNumber);
            
            if (!mozo) {
                return res.status(401).json({ error: 'Credenciales incorrectas' });
            }
        } else if (dni) {
            // Formato anterior: solo DNI (mantener retrocompatibilidad)
            dniNumber = parseInt(dni, 10);
            
            if (isNaN(dniNumber) || dniNumber <= 0) {
                return res.status(400).json({ error: 'DNI inválido' });
            }
            
            // Buscar mozo por DNI
            mozo = await obtenerMozosPorId(dniNumber);
            
            if (!mozo) {
                // Intentar buscar por campo DNI
                const mozosModel = require('../database/models/mozos.model');
                mozo = await mozosModel.findOne({ DNI: dniNumber });
                
                if (!mozo) {
                    return res.status(401).json({ error: 'DNI no registrado' });
                }
            }
        } else {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }
        
        // Obtener información del rol
        const mozoConRol = await rolesRepository.obtenerMozoConRol(mozo._id);
        
        // Determinar el rol (usar el de BD o verificar si es admin por nombre)
        const rolUsuario = mozoConRol?.rol || (username?.toLowerCase() === 'admin' ? 'admin' : null);
        
        // Verificar que tenga rol de cocinero, supervisor o admin
        if (rolUsuario !== 'cocinero' && rolUsuario !== 'admin' && rolUsuario !== 'supervisor') {
            return res.status(403).json({ 
                error: 'No tiene permisos para acceder a la App Cocina',
                rol: rolUsuario || 'sin rol'
            });
        }
        
        if (mozoConRol?.activo === false) {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }
        
        const permisos = rolesRepository.PERMISOS_POR_ROL_SISTEMA[rolUsuario] || [];
        
        const token = jwt.sign(
            {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI,
                rol: rolUsuario,
                permisos: permisos,
                app: 'cocina'
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        logger.info('Usuario autenticado en App Cocina', {
            mozoId: mozo._id,
            name: mozo.name,
            rol: rolUsuario
        });
        
        res.json({
            token,
            usuario: {
                id: mozo._id,
                name: mozo.name,
                rol: rolUsuario,
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

/**
 * GET /api/admin/auth/me
 * Obtener información del usuario autenticado (para topbar y perfil)
 */
router.get('/admin/auth/me', async (req, res) => {
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
        
        // Separar nombre y apellido
        const nombreCompleto = mozoConRol.name || '';
        const partes = nombreCompleto.trim().split(/\s+/);
        const nombre = partes[0] || '';
        const apellido = partes.slice(1).join(' ') || '';
        
        res.json({
            success: true,
            usuario: {
                id: decoded.id,
                nombre: nombre,
                apellido: apellido,
                email: mozoConRol.email || '',
                telefono: mozoConRol.telefono || '',
                rol: {
                    nombre: mozoConRol.rol || 'Usuario',
                    permisos: mozoConRol.permisosEfectivos || []
                },
                foto: mozoConRol.foto || null,
                area: mozoConRol.area?.nombre || 'General',
                fechaIngreso: mozoConRol.createdAt || null,
                activo: mozoConRol.activo !== false
            }
        });
        
    } catch (error) {
        logger.error('Error al obtener usuario actual', { 
            error: error.message 
        });
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
});

/**
 * PUT /api/admin/auth/perfil
 * Actualizar perfil del usuario autenticado
 */
router.put('/admin/auth/perfil', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { nombre, apellido, email, telefono, dosFactores } = req.body;
        
        // Actualizar en la base de datos
        const Mozo = require('../database/models/mozos.model');
        const nombreCompleto = `${nombre || ''} ${apellido || ''}`.trim();
        
        const actualizado = await Mozo.findByIdAndUpdate(
            decoded.id,
            {
                name: nombreCompleto || decoded.name,
                email: email || '',
                telefono: telefono || '',
                dosFactores: dosFactores || false
            },
            { new: true }
        );
        
        if (!actualizado) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        logger.info('Perfil actualizado', { mozoId: decoded.id });
        
        res.json({
            success: true,
            message: 'Perfil actualizado correctamente',
            usuario: {
                nombre: nombre,
                apellido: apellido,
                email: email,
                telefono: telefono,
                dosFactores: dosFactores
            }
        });
        
    } catch (error) {
        logger.error('Error al actualizar perfil', { 
            error: error.message 
        });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * POST /api/admin/usuarios/perfil/foto
 * Subir foto de perfil
 */
router.post('/admin/usuarios/perfil/foto', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Aquí iría la lógica de subida de archivo
        // Por ahora retornamos un placeholder
        const fotoUrl = `/uploads/perfil/${decoded.id}.jpg`;
        
        // Actualizar en BD
        const Mozo = require('../database/models/mozos.model');
        await Mozo.findByIdAndUpdate(decoded.id, { foto: fotoUrl });
        
        logger.info('Foto de perfil actualizada', { mozoId: decoded.id });
        
        res.json({
            success: true,
            fotoUrl: fotoUrl,
            message: 'Foto de perfil actualizada'
        });
        
    } catch (error) {
        logger.error('Error al subir foto de perfil', { 
            error: error.message 
        });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;

