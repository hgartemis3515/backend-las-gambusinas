const express = require('express');
const router = express.Router();
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const inventario = require('../repository/inventario.repository');
const logger = require('../utils/logger');

function puedeLeerAlertas(req) {
    const rol = req.admin && req.admin.rol;
    if (rol === 'admin' || rol === 'supervisor' || rol === 'cocinero') return true;
    const permisos = (req.admin && req.admin.permisos) || [];
    return permisos.includes('ver-inventario')
        || permisos.includes('ver-comandas-cocina')
        || permisos.includes('ver-cocina-completo')
        || permisos.includes('ver-cocina-personalizado');
}

function errorHttp(error, res) {
    const status = error.statusCode || 500;
    if (status >= 500) logger.error('Inventario', { error: error.message });
    return res.status(status).json({ success: false, error: error.message || 'Error de inventario' });
}

router.get('/inventario/kardex', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const data = req.query.carta === '1'
            ? await inventario.kardexCarta(req.query.desde, req.query.hasta)
            : await inventario.kardex(req.query.desde, req.query.hasta);
        res.json({ success: true, ...data });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.get('/inventario/movimientos', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const movimientos = await inventario.listarMovimientos(req.query);
        res.json({ success: true, movimientos });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.post('/inventario/movimientos', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const doc = await inventario.crearMovimiento(req.body || {}, req.admin && req.admin.id);
        res.status(201).json({ success: true, movimiento: doc });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.get('/inventario/alertas', adminAuth, async (req, res) => {
    try {
        if (!puedeLeerAlertas(req)) {
            return res.status(403).json({ success: false, error: 'No tiene permiso: ver-inventario' });
        }
        const alertas = await inventario.alertasActuales();
        res.json({ success: true, alertas });
    } catch (error) {
        errorHttp(error, res);
    }
});

router.put('/inventario/rubros/:clave', adminAuth, checkPermission('ver-inventario'), async (req, res) => {
    try {
        const data = await inventario.guardarUmbralRubro(req.params.clave, req.body || {});
        res.json({ success: true, ...data });
    } catch (error) {
        errorHttp(error, res);
    }
});

module.exports = router;
