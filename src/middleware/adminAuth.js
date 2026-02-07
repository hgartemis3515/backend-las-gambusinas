/**
 * ADMIN AUTH MIDDLEWARE
 * Protege las rutas del dashboard administrativo
 */

const jwt = require('jsonwebtoken');

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
        console.error('Error en adminAuth:', error);
        
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

module.exports = {
    adminAuth,
    verifyAdminToken,
    JWT_SECRET
};

