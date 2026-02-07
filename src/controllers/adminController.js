/**
 * ADMIN CONTROLLER
 * Endpoints para autenticación administrativa
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { autenticarMozo } = require('../repository/mozos.repository');
const { JWT_SECRET } = require('../middleware/adminAuth');

/**
 * POST /api/admin/auth
 * Autenticar administrador (mozo con rol admin)
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
        
        // Verificar si es admin (por ahora, cualquier mozo puede ser admin)
        // TODO: Agregar campo 'rol' en el modelo de mozos para distinguir admin/supervisor/mozo
        
        // Generar token JWT
        const token = jwt.sign(
            {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI,
                role: 'admin' // Por ahora todos son admin
            },
            JWT_SECRET,
            {
                expiresIn: '24h' // Token válido por 24 horas
            }
        );
        
        res.json({
            token,
            usuario: {
                id: mozo._id,
                name: mozo.name,
                DNI: mozo.DNI
            }
        });
        
    } catch (error) {
        console.error('Error en autenticación admin:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * GET /api/admin/verify
 * Verificar si el token es válido
 */
router.get('/admin/verify', (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token no proporcionado' });
        }
        
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        
        res.json({
            valid: true,
            usuario: {
                id: decoded.id,
                name: decoded.name,
                role: decoded.role
            }
        });
        
    } catch (error) {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
});

module.exports = router;

