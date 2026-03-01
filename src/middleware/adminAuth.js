/**
 * ADMIN AUTH MIDDLEWARE
 * Protege las rutas del dashboard administrativo
 * Incluye verificación de roles y permisos
 */

const jwt = require('jsonwebtoken');
const rolesRepository = require('../repository/roles.repository');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'las-gambusinas-admin-secret-key-2024';

/**
 * Middleware para verificar token de administrador
 */
const adminAuth = (req, res, next) => {
    try {
        // Obtener token del header Authorization
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // Si es una petición HTML, redirigir a login
            if (req.accepts('html')) {
                return res.redirect('/dashboard/login.html');
            }
            // Si es API, devolver 401
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        const token = authHeader.substring(7); // Remover "Bearer "
        
        // Verificar token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Agregar información del usuario al request
        req.admin = decoded;
        
        next();
    } catch (error) {
        logger.error('Error en adminAuth', { error: error.message });
        
        // Si es una petición HTML, redirigir a login
        if (req.accepts('html')) {
            return res.redirect('/dashboard/login.html');
        }
        
        // Si es API, devolver 401
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

/**
 * Middleware opcional para verificar token (no redirige, solo verifica)
 */
const verifyAdminToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

/**
 * Middleware para verificar si el usuario tiene acceso al dashboard
 * Solo admin y supervisor pueden acceder
 */
const requireDashboardAccess = async (req, res, next) => {
    try {
        const rol = req.admin.rol;
        
        if (rol !== 'admin' && rol !== 'supervisor') {
            logger.warn('Intento de acceso no autorizado al dashboard', {
                userId: req.admin.id,
                rol: rol
            });
            
            if (req.accepts('html')) {
                return res.redirect('/login?error=unauthorized');
            }
            
            return res.status(403).json({ 
                error: 'No tiene permisos para acceder al dashboard' 
            });
        }
        
        next();
    } catch (error) {
        logger.error('Error en requireDashboardAccess', { error: error.message });
        return res.status(500).json({ error: 'Error de autorización' });
    }
};

/**
 * Middleware para verificar un permiso específico
 * @param {string} permiso - Permiso requerido
 */
const checkPermission = (permiso) => {
    return async (req, res, next) => {
        try {
            const rol = req.admin.rol;
            
            // Admin tiene todos los permisos
            if (rol === 'admin') {
                return next();
            }
            
            // Verificar permiso en el token o en BD
            const permisos = req.admin.permisos || [];
            
            if (!permisos.includes(permiso)) {
                // Verificar en BD si no está en el token
                const tienePermiso = await rolesRepository.tienePermiso(req.admin.id, permiso);
                
                if (!tienePermiso) {
                    logger.warn('Permiso denegado', {
                        userId: req.admin.id,
                        permiso: permiso
                    });
                    
                    return res.status(403).json({ 
                        error: `No tiene permiso: ${permiso}` 
                    });
                }
            }
            
            next();
        } catch (error) {
            logger.error('Error en checkPermission', { 
                error: error.message, 
                permiso 
            });
            return res.status(500).json({ error: 'Error de autorización' });
        }
    };
};

/**
 * Middleware para verificar un rol específico
 * @param {string|Array} roles - Rol o roles permitidos
 */
const checkRole = (roles) => {
    return async (req, res, next) => {
        try {
            const rolUsuario = req.admin.rol;
            const rolesPermitidos = Array.isArray(roles) ? roles : [roles];
            
            if (!rolesPermitidos.includes(rolUsuario)) {
                logger.warn('Rol no autorizado', {
                    userId: req.admin.id,
                    rol: rolUsuario,
                    rolesRequeridos: rolesPermitidos
                });
                
                return res.status(403).json({ 
                    error: `Rol no autorizado. Se requiere: ${rolesPermitidos.join(' o ')}` 
                });
            }
            
            next();
        } catch (error) {
            logger.error('Error en checkRole', { 
                error: error.message, 
                roles 
            });
            return res.status(500).json({ error: 'Error de autorización' });
        }
    };
};

/**
 * Middleware para verificar múltiples permisos (todos requeridos)
 * @param {Array} permisos - Lista de permisos requeridos
 */
const requireAllPermissions = (permisos) => {
    return async (req, res, next) => {
        try {
            const rol = req.admin.rol;
            
            // Admin tiene todos los permisos
            if (rol === 'admin') {
                return next();
            }
            
            const permisosUsuario = req.admin.permisos || [];
            
            for (const permiso of permisos) {
                if (!permisosUsuario.includes(permiso)) {
                    const tienePermiso = await rolesRepository.tienePermiso(req.admin.id, permiso);
                    
                    if (!tienePermiso) {
                        logger.warn('Permiso faltante', {
                            userId: req.admin.id,
                            permiso: permiso
                        });
                        
                        return res.status(403).json({ 
                            error: `No tiene permiso: ${permiso}` 
                        });
                    }
                }
            }
            
            next();
        } catch (error) {
            logger.error('Error en requireAllPermissions', { 
                error: error.message, 
                permisos 
            });
            return res.status(500).json({ error: 'Error de autorización' });
        }
    };
};

/**
 * Middleware para verificar al menos uno de los permisos
 * @param {Array} permisos - Lista de permisos (al menos uno requerido)
 */
const requireAnyPermission = (permisos) => {
    return async (req, res, next) => {
        try {
            const rol = req.admin.rol;
            
            // Admin tiene todos los permisos
            if (rol === 'admin') {
                return next();
            }
            
            const permisosUsuario = req.admin.permisos || [];
            
            for (const permiso of permisos) {
                if (permisosUsuario.includes(permiso)) {
                    return next();
                }
                
                const tienePermiso = await rolesRepository.tienePermiso(req.admin.id, permiso);
                if (tienePermiso) {
                    return next();
                }
            }
            
            logger.warn('Ningún permiso encontrado', {
                userId: req.admin.id,
                permisosRequeridos: permisos
            });
            
            return res.status(403).json({ 
                error: `Se requiere al menos uno de estos permisos: ${permisos.join(', ')}` 
            });
        } catch (error) {
            logger.error('Error en requireAnyPermission', { 
                error: error.message, 
                permisos 
            });
            return res.status(500).json({ error: 'Error de autorización' });
        }
    };
};

module.exports = {
    adminAuth,
    verifyAdminToken,
    requireDashboardAccess,
    checkPermission,
    checkRole,
    requireAllPermissions,
    requireAnyPermission,
    JWT_SECRET
};

